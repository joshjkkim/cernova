from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from anomaly.layers.layer_3_behavioral import VECTOR_DIM, build_behavior_vector, cosine_distance
from anomaly.schemas import CallInput


def _mock_embed(text: str) -> list[float]:
    """Deterministic 384-d pseudo-embedding from text hash."""
    base = float(sum(ord(c) for c in text[:50]) % 1000) / 1000.0
    return [base + i * 0.0001 for i in range(384)]


def _sample_call(**overrides) -> CallInput:
    data = dict(
        step_name="classify-intent",
        model="claude-haiku-4-5",
        prompt="Classify intent.",
        system_prompt="Classify the user message into billing, support, or sales.",
        input_tokens=10,
        output_tokens=2,
        total_tokens=12,
        latency_ms=200,
        cost=0.0003,
        status_success=True,
        output_code="billing",
        run_id="run_test",
    )
    data.update(overrides)
    return CallInput(**data)


def test_vector_length_and_normalized():
    vec = build_behavior_vector(_sample_call(), _mock_embed)
    assert len(vec) == VECTOR_DIM
    norm = math.sqrt(sum(x * x for x in vec))
    assert abs(norm - 1.0) < 1e-6


def test_empty_output_zeros_output_block():
    call = _sample_call(output_code="")
    vec_empty = build_behavior_vector(call, _mock_embed)
    call_with_output = _sample_call(output_code="billing")
    vec_with = build_behavior_vector(call_with_output, _mock_embed)
    assert vec_empty != vec_with


def test_cosine_distance_identical_is_zero():
    vec = build_behavior_vector(_sample_call(), _mock_embed)
    assert cosine_distance(vec, vec) < 1e-6


def test_cosine_distance_different_vectors():
    v1 = build_behavior_vector(_sample_call(output_code="billing"), _mock_embed)
    v2 = build_behavior_vector(_sample_call(output_code="x" * 500), _mock_embed)
    assert cosine_distance(v1, v2) > 0.0
