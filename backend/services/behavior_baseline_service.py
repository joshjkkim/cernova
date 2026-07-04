"""Compute per-step-profile behavioral centroids from stored behavior vectors.

Mirrors baseline_service filters: same model, post last_evolved_at, exclude
anomaly_triggered calls. Requires MIN_SAMPLES stored vectors.
"""

from __future__ import annotations

import math

from anomaly.schemas import BehaviorBaseline
from db import get_client

MIN_SAMPLES = 20
HISTORY_LIMIT = 200


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-12:
        return vec
    return [x / norm for x in vec]


def _mean_vector(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return []
    dim = len(vectors[0])
    sums = [0.0] * dim
    for vec in vectors:
        for i, val in enumerate(vec):
            sums[i] += val
    n = len(vectors)
    return [s / n for s in sums]


def compute_behavior_baseline(step_profile_id: str, model: str | None = None) -> BehaviorBaseline | None:
    """Return a BehaviorBaseline for the given profile, or None if not enough data."""
    try:
        last_evolved_at: str | None = None
        goal_type: str = "Transform"
        try:
            prof = (
                get_client()
                .table("step_profiles")
                .select("last_evolved_at,goal_type")
                .eq("id", step_profile_id)
                .single()
                .execute()
            )
            if prof.data:
                last_evolved_at = prof.data.get("last_evolved_at")
                goal_type = prof.data.get("goal_type") or goal_type
        except Exception:
            pass

        query = (
            get_client()
            .table("CALLS")
            .select("behavior_vector")
            .eq("step_profile_id", step_profile_id)
            .eq("status_success", True)
            .not_.is_("behavior_vector", "null")
            .or_("anomaly_triggered.is.null,anomaly_triggered.eq.false")
            .order("created_at", desc=True)
            .limit(HISTORY_LIMIT)
        )

        if model:
            query = query.eq("model", model)

        if last_evolved_at:
            query = query.gte("created_at", last_evolved_at)

        res = query.execute()
        rows = res.data or []
        vectors: list[list[float]] = []
        for row in rows:
            raw = row.get("behavior_vector")
            if raw is None:
                continue
            if isinstance(raw, str):
                # pgvector may return "[1,2,...]" string in some clients
                import json
                parsed = json.loads(raw.replace(" ", ""))
                vectors.append([float(x) for x in parsed])
            else:
                vectors.append([float(x) for x in raw])

        if len(vectors) < MIN_SAMPLES:
            return None

        centroid = _l2_normalize(_mean_vector(vectors))
        return BehaviorBaseline(
            sample_count=len(vectors),
            centroid=centroid,
            goal_type=goal_type,
        )
    except Exception as exc:
        print(f"[behavior_baseline] failed for profile={step_profile_id}: {exc}")
        return None
