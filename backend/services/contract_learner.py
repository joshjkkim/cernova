"""Induce a LearnedContract from a step's output history.

The philosophy mirrors the anomaly baselines: the step teaches you its own
normal. Nobody writes a schema — we watch what the outputs have *always* looked
like and lock onto the regularities, per step, whatever the keys and values
happen to be. This is why arbitrary per-user variable names/values need no
anticipation: we observe them.

Statistical discipline (same spirit as L5): "always" means "in at least
REQUIRED_THRESHOLD of a large-enough sample", never a literal always — so one
rare-but-valid output can't lock a key out, and a small stable string domain
becomes an enum only with enough evidence.
"""

from __future__ import annotations

import json
from collections import defaultdict

from schemas.contract import KeySpec, LearnedContract

MIN_SAMPLES = 20            # below this, stay in "observing" — not enough to learn
JSON_FORMAT_THRESHOLD = 0.90  # ≥ this fraction parse as JSON → format is "json"
TEXT_FORMAT_THRESHOLD = 0.10  # < this fraction parse as JSON → format is "text"
REQUIRED_THRESHOLD = 0.98   # key present in ≥ this fraction of JSON outputs → required
ENUM_MAX_DOMAIN = 8         # ≤ this many distinct string values → treat as enum


def _json_type(v: object) -> str:
    # bool is a subclass of int — check it first
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, dict):
        return "object"
    if isinstance(v, list):
        return "array"
    if isinstance(v, str):
        return "string"
    if isinstance(v, (int, float)):
        return "number"
    if v is None:
        return "null"
    return "unknown"


def learn_contract(outputs: list[str]) -> LearnedContract:
    """Induce a proposed contract from raw output strings."""
    total = len(outputs)
    parsed: list[dict] = []
    json_ok = 0
    for out in outputs:
        try:
            obj = json.loads(out)
        except (ValueError, TypeError):
            continue
        json_ok += 1
        if isinstance(obj, dict):          # only top-level objects contribute key specs
            parsed.append(obj)

    json_rate = (json_ok / total) if total else 0.0

    if json_rate >= JSON_FORMAT_THRESHOLD:
        fmt = "json"
    elif json_rate < TEXT_FORMAT_THRESHOLD:
        fmt = "text"
    else:
        fmt = "mixed"

    status = "observing" if total < MIN_SAMPLES else "proposed"

    # Text/mixed steps: structural key learning doesn't apply (yet). A later pass
    # can learn text features (length band, language, format markers).
    if fmt != "json" or not parsed:
        return LearnedContract(
            format=fmt, json_rate=round(json_rate, 4),
            sample_count=total, status=status,
        )

    n = len(parsed)
    presence: dict[str, int] = defaultdict(int)
    types: dict[str, set[str]] = defaultdict(set)
    str_values: dict[str, set[str]] = defaultdict(set)
    str_value_ok: dict[str, bool] = defaultdict(lambda: True)  # all values were strings
    num_min: dict[str, float] = {}
    num_max: dict[str, float] = {}

    for obj in parsed:
        for key, val in obj.items():
            presence[key] += 1
            t = _json_type(val)
            types[key].add(t)
            if t == "string":
                str_values[key].add(val)
            else:
                str_value_ok[key] = False
            if t == "number":
                num_min[key] = min(num_min.get(key, val), val)
                num_max[key] = max(num_max.get(key, val), val)

    keys: dict[str, KeySpec] = {}
    for key in presence:
        frac = presence[key] / n
        enum = None
        # Enum only if every observed value was a string and the domain is small
        if str_value_ok[key] and 0 < len(str_values[key]) <= ENUM_MAX_DOMAIN:
            enum = sorted(str_values[key])
        keys[key] = KeySpec(
            name=key,
            presence=round(frac, 4),
            types=sorted(types[key]),
            enum_values=enum,
            num_min=num_min.get(key),
            num_max=num_max.get(key),
        )

    required = sorted(k for k, spec in keys.items() if spec.presence >= REQUIRED_THRESHOLD)

    return LearnedContract(
        format="json",
        json_rate=round(json_rate, 4),
        sample_count=total,
        required_keys=required,
        keys=keys,
        status=status,
    )
