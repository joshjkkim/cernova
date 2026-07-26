"""L1 Perception — per-step forward model, semantic surprise.

For each step profile, learn g: embed(user input) -> embed(output) from the
step's own clean history (Ridge 384->384). Per call:

    surprise = 1 - cos(g(embed(input)), embed(output))

Low surprise: the output is what this step usually produces FOR THIS INPUT.
High surprise: a well-formed but semantically-off answer — the class that hard
checks, contracts, and metric fences are all blind to (validated in
research/forward_model.py: 80-93% decoy discrimination on decision-type steps).

The fit is cached in-process with a TTL. Everything here runs in the anomaly
background thread — a 1-2s first fit per profile after a deploy is acceptable
there and never touches the ingest hot path. Every failure path returns None:
surprise is optional evidence and must never break ingest.

Role-gated: only fitted for decision-type roles (router/retriever/extractor)
where the prototype proved discrimination. Free-text steps (generator/creative)
are owned by L2 semantic entropy; label steps by learned contracts.

Forward-model input prefers structured state when present: if the user message
carries pipeline-state JSON (multi-hop supervisors that re-send the same ticket
text every hop with only decision flags changing), the embedded input is a
deterministic serialization of those flags with long free-text fields dropped.
Otherwise the full user text is used, unchanged. This keeps hops with identical
ticket text but different flags distinguishable, so correct later-hop routes
don't fire 5010 as "surprising". Bump FORWARD_INPUT_VERSION when changing the
extraction so cached fits from the old scheme are never reused.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass

import numpy as np

from anomaly.schemas import MetricStat
from db import get_client

log = logging.getLogger(__name__)

MIN_SAMPLES   = 20
HISTORY_LIMIT = 200
FIT_TTL_SEC   = 6 * 3600
RIDGE_ALPHA   = 1.0
FIT_ROLES     = {"router", "retriever", "extractor"}

# Version of the _forward_input_text extraction scheme. Part of the cache key:
# a fit learned under one extraction must never score inputs from another.
FORWARD_INPUT_VERSION = 2

# Keys whose presence marks a user message as pipeline-state JSON.
_STATE_KEY_HINTS = {"classified", "retrieved", "drafted", "reviewed",
                    "next_agent", "ticket_excerpt", "kb_articles_found"}
# Free-text blobs always excluded from the state serialization.
_STATE_DROP_KEYS = {"ticket_excerpt"}
# Any other string value longer than this is treated as free text and dropped.
_STATE_MAX_STR_LEN = 120


@dataclass
class FittedModel:
    coef: np.ndarray | None      # Ridge weights; None = "don't score this profile"
    intercept: np.ndarray | None
    stat: MetricStat | None      # out-of-fold surprise distribution (the fence)
    fitted_at: float
    n: int


_cache: dict[str, FittedModel] = {}
_fit_lock = threading.Lock()


def _user_text(raw_prompt: str | None) -> str:
    """The varying (user) part of a stored prompt — same extraction at train and
    score time, since CALLS.prompt IS CanonicalTrace.raw_prompt."""
    if not raw_prompt:
        return ""
    try:
        obj = json.loads(raw_prompt)
        msgs = obj.get("messages", [])
        for m in reversed(msgs):
            if m.get("role") == "user":
                return " ".join(str(m.get("content", "")).split())
    except Exception:
        pass
    return " ".join(raw_prompt.split())


def _parse_pipeline_state(text: str) -> dict | None:
    """The user message as a pipeline-state dict, or None if it isn't one.

    Tolerates a prose prefix ("Pipeline state:\\n{...}") by parsing the outermost
    {...} span. Only dicts carrying known state keys qualify — plain prompts and
    unrelated JSON fall through to the full-text path.
    """
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except Exception:
        return None
    if not isinstance(obj, dict) or not (_STATE_KEY_HINTS & obj.keys()):
        return None
    return obj


def _state_value_repr(v) -> str | None:
    """Compact deterministic value repr; None = drop this key (free text)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        return v if len(v) <= _STATE_MAX_STR_LEN else None
    if isinstance(v, (int, float)):
        return json.dumps(v)
    s = json.dumps(v, sort_keys=True, separators=(",", ":"))
    return s if len(s) <= _STATE_MAX_STR_LEN else None


def _forward_input_text(raw_prompt: str | None) -> str:
    """The string embedded as the forward model's input — shared by fit and
    score so both sides see identical features.

    Pipeline-state messages become sorted `key=value` pairs with free-text
    blobs dropped: two hops over the same ticket but different flags now embed
    differently, and two tickets in the same state embed identically. Anything
    else is the whitespace-normalized user text, exactly as before.
    """
    text = _user_text(raw_prompt)
    state = _parse_pipeline_state(text) if text else None
    if state is None:
        return text
    parts = []
    for k in sorted(state):
        if k in _STATE_DROP_KEYS:
            continue
        rep = _state_value_repr(state[k])
        if rep is not None:
            parts.append(f"{k}={rep}")
    return " ".join(parts) if parts else text


def _unit(m: np.ndarray) -> np.ndarray:
    return m / np.clip(np.linalg.norm(m, axis=-1, keepdims=True), 1e-9, None)


def _percentile(sorted_vals: list[float], p: float) -> float:
    n = len(sorted_vals)
    pos = p * (n - 1)
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def _surprise_stat(values: list[float]) -> MetricStat:
    """Raw-space MetricStat over out-of-fold surprise values (bounded ~[0,2],
    so no log transform — matches ScalarSpec('semantic_surprise', ..., 'raw')).

    The OOF residuals double as the conformal calibration set — they are honest
    "surprise of a normal call the model didn't train on" draws, which is
    exactly what split conformal wants.
    """
    s = sorted(values)
    q1, med, q3 = _percentile(s, 0.25), _percentile(s, 0.50), _percentile(s, 0.75)
    return MetricStat(count=len(s), log_transform=False,
                      q1=q1, median=med, q3=q3, iqr=q3 - q1,
                      calibration=s)


def _skip(reason: str, profile_id: str, n: int = 0) -> FittedModel:
    log.info(f"[forward-model] skip profile={profile_id}: {reason}")
    return FittedModel(coef=None, intercept=None, stat=None, fitted_at=time.time(), n=n)


def _fit(step_profile_id: str) -> FittedModel:
    """Fit the profile's forward model from clean history. Mirrors the baseline
    hardening rules: successful, non-anomalous calls after the last evolution."""
    db = get_client()

    prof = (db.table("step_profiles").select("role,last_evolved_at")
            .eq("id", step_profile_id).single().execute()).data or {}
    role = prof.get("role")
    if role not in FIT_ROLES:
        return _skip(f"role={role} not gated in", step_profile_id)

    q = (db.table("CALLS").select("prompt,output_code")
         .eq("step_profile_id", step_profile_id)
         .eq("status_success", True)
         .or_("anomaly_triggered.is.null,anomaly_triggered.eq.false")
         .order("created_at", desc=True)
         .limit(HISTORY_LIMIT))
    if prof.get("last_evolved_at"):
        q = q.gte("created_at", prof["last_evolved_at"])
    rows = q.execute().data or []

    pairs = [( _forward_input_text(r.get("prompt")), r.get("output_code") )
             for r in rows]
    pairs = [(i, o) for i, o in pairs if i.strip() and o]
    if len(pairs) < MIN_SAMPLES:
        return _skip(f"n={len(pairs)} < {MIN_SAMPLES}", step_profile_id, n=len(pairs))

    from sklearn.linear_model import Ridge
    from sklearn.model_selection import KFold
    from services.fingerprinter import _embed

    X = _unit(np.array([_embed(i) for i, _ in pairs]))
    Y = _unit(np.array([_embed(o) for _, o in pairs]))

    # Out-of-fold surprise = honest residual distribution for the fence
    # (in-sample residuals would understate normal surprise).
    oof = np.zeros(len(X))
    for tr, te in KFold(n_splits=5, shuffle=True, random_state=0).split(X):
        m = Ridge(alpha=RIDGE_ALPHA).fit(X[tr], Y[tr])
        pred = _unit(m.predict(X[te]))
        oof[te] = 1.0 - (pred * Y[te]).sum(-1)

    final = Ridge(alpha=RIDGE_ALPHA).fit(X, Y)
    fm = FittedModel(coef=final.coef_, intercept=final.intercept_,
                     stat=_surprise_stat(list(oof)), fitted_at=time.time(), n=len(pairs))
    log.info(f"[forward-model] fitted profile={step_profile_id} role={role} n={fm.n} "
             f"surprise q1={fm.stat.q1:.3f} q3={fm.stat.q3:.3f}")
    return fm


def _cache_key(step_profile_id: str) -> str:
    return f"{step_profile_id}:v{FORWARD_INPUT_VERSION}"


def _get_model(step_profile_id: str) -> FittedModel:
    key = _cache_key(step_profile_id)
    fm = _cache.get(key)
    if fm and time.time() - fm.fitted_at < FIT_TTL_SEC:
        return fm
    with _fit_lock:
        fm = _cache.get(key)                      # double-checked: another thread may have fitted
        if fm and time.time() - fm.fitted_at < FIT_TTL_SEC:
            return fm
        fm = _fit(step_profile_id)
        _cache[key] = fm
        return fm


def score_surprise(step_profile_id: str, raw_prompt: str | None,
                   output_text: str | None) -> tuple[float, MetricStat] | None:
    """Semantic surprise for one call, plus this step's surprise fence stats.

    None when the profile has no usable model (cold start, role-gated out, no
    output, or any failure) — the caller simply doesn't score 5010.
    """
    try:
        inp = _forward_input_text(raw_prompt)
        if not inp.strip() or not output_text:
            return None
        fm = _get_model(step_profile_id)
        if fm.coef is None or fm.stat is None:
            return None

        from services.fingerprinter import _embed
        x = _unit(np.array(_embed(inp)))
        y = _unit(np.array(_embed(output_text)))
        pred = _unit(x @ fm.coef.T + fm.intercept)
        surprise = float(1.0 - pred @ y)
        return surprise, fm.stat
    except Exception:
        log.error(f"[forward-model] scoring failed profile={step_profile_id}", exc_info=True)
        return None
