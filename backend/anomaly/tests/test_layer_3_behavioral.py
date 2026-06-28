from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from anomaly.config import EvalConfig
from anomaly.layers.layer_3_behavioral import run_layer_3_behavioral
from anomaly.schemas import BehaviorBaseline, CallInput


def _unit_vector(dim: int, index: int = 0) -> list[float]:
    vec = [0.0] * dim
    vec[index] = 1.0
    return vec


def _call_with_vector(vec: list[float]) -> CallInput:
    return CallInput(
        step_name="classify-intent",
        model="claude-haiku-4-5",
        prompt="Classify intent.",
        system_prompt="Classify the user message.",
        input_tokens=10,
        output_tokens=2,
        total_tokens=12,
        latency_ms=200,
        cost=0.0003,
        status_success=True,
        output_code="billing",
        run_id="run_l3",
        behavior_vector=vec,
    )


def test_near_centroid_no_hit():
    vec = _unit_vector(778, 0)
    baseline = BehaviorBaseline(sample_count=25, centroid=vec, goal_type="Extract")
    config = EvalConfig(behavior_baseline=baseline, behavior_drift_threshold=0.35)
    hits = run_layer_3_behavioral(_call_with_vector(vec), config)
    assert hits == []


def test_far_vector_fires_3010():
    centroid = _unit_vector(778, 0)
    drifted = _unit_vector(778, 1)
    baseline = BehaviorBaseline(sample_count=25, centroid=centroid, goal_type="Extract")
    config = EvalConfig(behavior_baseline=baseline, behavior_drift_threshold=0.35)
    hits = run_layer_3_behavioral(_call_with_vector(drifted), config)
    assert len(hits) == 1
    assert hits[0].condition_code == 3010
    assert hits[0].layer == "L3_behavioral"


def test_no_baseline_no_hit():
    config = EvalConfig()
    hits = run_layer_3_behavioral(_call_with_vector(_unit_vector(778, 0)), config)
    assert hits == []
