"""Read-only admin surface — operator views of the anomaly pipeline.

Everything here is gated by require_admin (ADMIN_EMAILS env var, fail-closed)
and strictly read-only: recent calls across all projects, fired anomalies with
their registry names, step profiles with their live baselines, and per-step
scalar firing rates. No mutation endpoints.

The firing-rates view is the health check for the conformal guarantee: a scalar
firing on far more than conformal_alpha of a step's clean traffic means the
baseline no longer describes that step (drift, contamination, or the clean-only
exclusion preventing recovery) — that state does not self-heal and is invisible
everywhere else in the product.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from anomaly import CONDITION_REGISTRY
from auth import require_admin
from db import get_client

router = APIRouter(prefix="/admin", tags=["admin"])

CALL_FIELDS = ("id,created_at,project_id,run_id,step_name,step_profile_id,"
               "model,latency_ms,total_tokens,cost,status_success,anomaly_triggered")


@router.get("/me")
def me(request: Request) -> dict:
    user = require_admin(request)
    return {"admin": True, "email": user["email"]}


@router.get("/calls")
def recent_calls(request: Request, limit: int = 100) -> list[dict]:
    require_admin(request)
    return (
        get_client().table("CALLS").select(CALL_FIELDS)
        .order("created_at", desc=True).limit(min(limit, 500))
        .execute().data or []
    )


@router.get("/anomalies")
def recent_anomalies(request: Request, limit: int = 100) -> list[dict]:
    require_admin(request)
    rows = (
        get_client().table("ANOMALIES").select("*")
        .order("created_at", desc=True).limit(min(limit, 500))
        .execute().data or []
    )
    for r in rows:
        cond = CONDITION_REGISTRY.get(r.get("error_code"))
        r["rule_name"] = cond.name if cond else None
        r["layer"] = cond.layer if cond else None
    return rows


@router.get("/profiles")
def step_profiles(request: Request) -> list[dict]:
    require_admin(request)
    return (
        get_client().table("step_profiles")
        .select("id,project_id,step_name,role,variance_tolerance,last_seen_at,last_evolved_at")
        .order("last_seen_at", desc=True).limit(200)
        .execute().data or []
    )


@router.get("/profiles/{profile_id}/baseline")
def profile_baseline(request: Request, profile_id: str) -> dict:
    """The baseline exactly as production would compute it right now — same
    compute_baseline call ingest makes, so what you see is what L5 scores with."""
    require_admin(request)
    from services.baseline_service import compute_baseline

    baseline = compute_baseline(profile_id)
    if baseline is None:
        return {"profile_id": profile_id, "baseline": None}

    metrics = {}
    for key in ("latency_ms", "total_tokens", "output_tokens", "cost"):
        stat = getattr(baseline, key, None)
        metrics[key] = None if stat is None else {
            "count": stat.count,
            "q1": stat.q1, "median": stat.median, "q3": stat.q3, "iqr": stat.iqr,
            "calibration_n": len(stat.calibration or []),
        }
    return {"profile_id": profile_id, "baseline": metrics}


@router.get("/firing-rates")
def firing_rates(request: Request, window: int = 500) -> list[dict]:
    """Per step_name over the last `window` calls: volume, flagged count, and
    which condition codes fired how often.

    ANOMALIES rows carry step_name but not step_profile_id, so the join is by
    step_name over the same time span — approximate when two projects share a
    step name, exact otherwise.
    """
    require_admin(request)
    window = min(window, 2000)
    calls = (
        get_client().table("CALLS").select("step_name,anomaly_triggered,created_at")
        .order("created_at", desc=True).limit(window)
        .execute().data or []
    )
    if not calls:
        return []
    oldest = calls[-1]["created_at"]
    anoms = (
        get_client().table("ANOMALIES").select("step_name,error_code")
        .gte("created_at", oldest).limit(5000)
        .execute().data or []
    )

    by_step: dict[str, dict] = {}
    for c in calls:
        s = by_step.setdefault(c.get("step_name") or "?", {"calls": 0, "flagged": 0, "codes": {}})
        s["calls"] += 1
        if c.get("anomaly_triggered"):
            s["flagged"] += 1
    for a in anoms:
        s = by_step.get(a.get("step_name") or "?")
        if s is None:
            continue
        code = str(a.get("error_code"))
        s["codes"][code] = s["codes"].get(code, 0) + 1

    return [
        {"step_name": name, **v, "flag_rate": round(v["flagged"] / v["calls"], 4)}
        for name, v in sorted(by_step.items(), key=lambda kv: -kv[1]["calls"])
    ]
