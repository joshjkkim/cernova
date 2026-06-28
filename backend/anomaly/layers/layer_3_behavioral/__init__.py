"""Layer 3 — behavioral drift. Two jobs, one file each:

    behavior_vector.py  BUILD   — build_behavior_vector (incl. goal classification)
    layer.py            COMPARE — run_layer_3_behavioral (drift vs centroid → 3010)

The evaluator imports ``run_layer_3_behavioral``; ingest builds vectors via
``build_behavior_vector`` / ``classify_goal_type``. Import them from this package,
not the inner modules.
"""

from __future__ import annotations

from .behavior_vector import (
    GOAL_TYPES,
    VECTOR_DIM,
    GoalType,
    build_behavior_vector,
    classify_goal_type,
    cosine_distance,
)
from .layer import run_layer_3_behavioral

__all__ = [
    "run_layer_3_behavioral",
    "build_behavior_vector",
    "cosine_distance",
    "VECTOR_DIM",
    "classify_goal_type",
    "GOAL_TYPES",
    "GoalType",
]
