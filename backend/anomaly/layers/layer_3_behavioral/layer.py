"""Layer 3 — behavioral drift vs per-step-profile centroid.

Compares the call's pre-computed behavior_vector to the profile centroid
(cosine distance). No baseline or no vector on the call → no hits (cold start).
"""

from __future__ import annotations

from ...condition_registry import describe
from ...config import EvalConfig
from ...schemas import CallInput, EvalHit
from .behavior_vector import cosine_distance


def run_layer_3_behavioral(payload: CallInput, config: EvalConfig) -> list[EvalHit]:
    baseline = config.behavior_baseline
    vector = payload.behavior_vector
    if baseline is None or vector is None:
        return []

    distance = cosine_distance(vector, baseline.centroid)
    threshold = config.behavior_drift_threshold
    if distance <= threshold:
        return []

    cond = describe(3010)
    return [EvalHit(
        condition_code=cond.code,
        layer=cond.layer,
        rule_name=cond.name,
        step_name=payload.step_name,
        run_id=payload.run_id,
        penalty=config.penalty_for(cond.code, cond.penalty),
        message=cond.description,
        observed=round(distance, 4),
        expected=f"cosine distance <= {threshold} (baseline n={baseline.sample_count}, goal={baseline.goal_type})",
    )]
