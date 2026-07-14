"""Tests for the statistical-baseline layer and its scalar registry.

Covers the registry-driven fence: the four historical scalars still fire on an
out-of-fence value (regression of the pre-registry behaviour), the fence stays
quiet inside the box, and the new per-scalar `tail` / `action` policies gate
correctly.

Standalone — builds MetricStat/StepBaseline directly so the anomaly package never
imports backend services.

    cd backend && pytest anomaly/tests/test_statistical_baseline.py
    cd backend && .venv/bin/python anomaly/tests/test_statistical_baseline.py
"""

from __future__ import annotations

import math
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from anomaly.config import EvalConfig
from anomaly.layers.statistical_baseline import run_statistical_baseline
from anomaly.scalars import ScalarSpec
from anomaly.schemas import CallInput, MetricStat, StepBaseline

_LAYER = "anomaly.layers.statistical_baseline"


def log_stat(q1: float, med: float, q3: float) -> MetricStat:
    """A log-space MetricStat centred on [q1, q3], as compute_baseline builds."""
    return MetricStat(
        count=30, log_transform=True,
        q1=q1, median=med, q3=q3, iqr=q3 - q1,
        log_q1=math.log(q1), log_q3=math.log(q3), log_iqr=math.log(q3) - math.log(q1),
    )


def call(**over) -> CallInput:
    base = dict(step_name="draft", model="claude-3", prompt="hi", run_id="r1", latency_ms=100)
    base.update(over)
    return CallInput(**base)


# --- regression: the four scalars still fire out of fence -------------------

def test_latency_spike_fires_5001():
    baseline = StepBaseline(sample_count=30, latency_ms=log_stat(80, 100, 120))
    hits = run_statistical_baseline(call(latency_ms=2000), EvalConfig(baseline=baseline))
    assert [h.condition_code for h in hits] == [5001]
    assert hits[0].observed == 2000


def test_within_fence_is_clean():
    baseline = StepBaseline(sample_count=30, latency_ms=log_stat(80, 100, 120))
    hits = run_statistical_baseline(call(latency_ms=100), EvalConfig(baseline=baseline))
    assert hits == []


def test_all_four_scalars_addressable():
    baseline = StepBaseline(
        sample_count=30,
        latency_ms=log_stat(80, 100, 120),
        total_tokens=log_stat(200, 250, 300),
        cost=log_stat(0.001, 0.002, 0.003),
        output_tokens=log_stat(50, 60, 70),
    )
    hits = run_statistical_baseline(
        call(latency_ms=5000, total_tokens=9000, cost=0.5, output_tokens=4000),
        EvalConfig(baseline=baseline),
    )
    assert {h.condition_code for h in hits} == {5001, 5002, 5003, 5004}


def test_no_baseline_no_hits():
    assert run_statistical_baseline(call(latency_ms=9999), EvalConfig()) == []


# --- tail gate: only the anomalous side fires -------------------------------

def _run_one(spec: ScalarSpec, observed: float) -> list[int]:
    baseline = StepBaseline(sample_count=30, latency_ms=log_stat(80, 100, 120))
    with patch(f"{_LAYER}.SCALAR_SPECS", [spec]):
        hits = run_statistical_baseline(call(latency_ms=observed), EvalConfig(baseline=baseline))
    return [h.condition_code for h in hits]


def test_tail_upper_ignores_a_drop():
    # 20ms is well below the fence — a "drop". An upper-tail scalar must stay silent.
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "upper"), 20) == []
    # ...but still fires on a spike.
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "upper"), 2000) == [5001]


def test_tail_lower_ignores_a_spike():
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "lower"), 2000) == []
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "lower"), 20) == [5001]


def test_tail_both_fires_either_side():
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "both"), 2000) == [5001]
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "both"), 20) == [5001]


# --- action gate: trigger-only scalars do not score -------------------------

def test_trigger_action_does_not_score():
    # Out of fence, but action="trigger" → escalation path, no penalty hit here.
    assert _run_one(ScalarSpec("latency_ms", 5001, "log", "both", action="trigger"), 2000) == []


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all passed")
