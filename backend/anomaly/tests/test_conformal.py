"""Tests for conformal calibration of the statistical-baseline layer.

Covers the p-value math (ranks, ties, tails), the false-alarm GUARANTEE itself
(simulated on exchangeable draws), the small-n floor, transform invariance,
layer integration via calibration-carrying stats, and that stats WITHOUT
calibration still take the legacy Tukey path unchanged.

    cd backend && pytest anomaly/tests/test_conformal.py
"""

from __future__ import annotations

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from anomaly.config import EvalConfig
from anomaly.layers.statistical_baseline import run_statistical_baseline
from anomaly.schemas import CallInput, MetricStat, StepBaseline


def stat_with_cal(values: list[float]) -> MetricStat:
    s = sorted(values)
    n = len(s)
    q1, med, q3 = s[n // 4], s[n // 2], s[(3 * n) // 4]
    return MetricStat(count=n, log_transform=False, q1=q1, median=med, q3=q3,
                      iqr=q3 - q1, calibration=s)


def call(**over) -> CallInput:
    base = dict(step_name="s", model="m", prompt="p", run_id="r", latency_ms=100)
    base.update(over)
    return CallInput(**base)


# --- p-value math -------------------------------------------------------------

def test_p_extreme_high_is_one_over_n_plus_one():
    stat = stat_with_cal(list(range(1, 101)))            # 1..100
    p, direction = stat.conformal_p(1000, "upper")
    assert p == 1 / 101 and direction == "above"


def test_p_median_is_about_half():
    stat = stat_with_cal(list(range(1, 101)))
    p, _ = stat.conformal_p(50.5, "upper")
    assert abs(p - 51 / 101) < 1e-9


def test_ties_count_as_extreme_conservative():
    stat = stat_with_cal([1.0, 2.0, 2.0, 2.0, 3.0])
    p, _ = stat.conformal_p(2.0, "upper")                # >= 2.0: four values
    assert p == (1 + 4) / 6


def test_lower_tail():
    stat = stat_with_cal(list(range(1, 101)))
    p, direction = stat.conformal_p(0, "lower")
    assert p == 1 / 101 and direction == "below"


def test_two_sided_doubles_smaller_side():
    stat = stat_with_cal(list(range(1, 101)))
    p_hi, d_hi = stat.conformal_p(1000, "both")
    p_lo, d_lo = stat.conformal_p(0, "both")
    assert p_hi == 2 / 101 and d_hi == "above"
    assert p_lo == 2 / 101 and d_lo == "below"


def test_no_calibration_returns_none():
    stat = MetricStat(count=30, q1=1, median=2, q3=3, iqr=2)
    assert stat.conformal_p(100, "upper") is None


def test_transform_invariance_log_vs_raw():
    # Ranks are monotone-invariant: decisions identical on raw and log'd values.
    raw = [random.Random(1).lognormvariate(0, 1) for _ in range(200)]
    obs = 25.0
    p_raw, _ = stat_with_cal(raw).conformal_p(obs, "upper")
    p_log, _ = stat_with_cal([math.log(v) for v in raw]).conformal_p(math.log(obs), "upper")
    assert p_raw == p_log


# --- the guarantee itself -------------------------------------------------------

def test_false_alarm_rate_respects_alpha_on_exchangeable_data():
    """On normal traffic (test point from the SAME distribution as calibration),
    the fire rate at level alpha must be <= alpha (within simulation noise)."""
    rng = random.Random(0)
    alpha = 0.05
    fires = 0
    trials = 2000
    for _ in range(trials):
        vals = [rng.lognormvariate(0, 1) for _ in range(100)]
        cal, test_v = vals[:-1], vals[-1]
        p, _ = stat_with_cal(cal).conformal_p(test_v, "upper")
        fires += p <= alpha
    rate = fires / trials
    assert rate <= alpha * 1.4, f"false-alarm rate {rate:.3f} exceeds alpha={alpha}"


# --- layer integration ------------------------------------------------------------

def test_layer_fires_via_conformal_at_alpha():
    baseline = StepBaseline(sample_count=200, latency_ms=stat_with_cal([float(v) for v in range(100, 300)]))
    cfg = EvalConfig(baseline=baseline, conformal_alpha=0.01)
    hits = run_statistical_baseline(call(latency_ms=5000), cfg)     # beyond all history
    assert [h.condition_code for h in hits] == [5001]
    assert "conformal: p=" in str(hits[0].expected)


def test_layer_silent_for_typical_value():
    baseline = StepBaseline(sample_count=200, latency_ms=stat_with_cal([float(v) for v in range(100, 300)]))
    assert run_statistical_baseline(call(latency_ms=200), EvalConfig(baseline=baseline)) == []


def test_small_n_floor_still_detects_beyond_history():
    # n=20 -> smallest two-sided p = 2/21 ~ 0.095 > alpha=0.01. The floor lets
    # "beyond everything in history" still fire rather than going dead.
    baseline = StepBaseline(sample_count=20, latency_ms=stat_with_cal([float(v) for v in range(100, 120)]))
    cfg = EvalConfig(baseline=baseline, conformal_alpha=0.01)
    hits = run_statistical_baseline(call(latency_ms=9999), cfg)
    assert [h.condition_code for h in hits] == [5001]


def test_small_n_inside_history_stays_silent():
    baseline = StepBaseline(sample_count=20, latency_ms=stat_with_cal([float(v) for v in range(100, 120)]))
    assert run_statistical_baseline(call(latency_ms=110), EvalConfig(baseline=baseline)) == []


def test_upper_tail_scalar_ignores_low_extreme_conformally():
    # semantic_surprise is tail="upper": an output unusually CLOSE to prediction
    # (extreme low) must not fire.
    baseline = StepBaseline(sample_count=100,
                            semantic_surprise=stat_with_cal([0.05 + i * 0.001 for i in range(100)]))
    hits = run_statistical_baseline(call(semantic_surprise=0.0), EvalConfig(baseline=baseline))
    assert hits == []


def test_no_calibration_takes_legacy_tukey_path():
    # A stat WITHOUT calibration must behave exactly as before (log-IQR fence).
    ls = [float(v) for v in range(80, 121)]
    q1, med, q3 = 90.0, 100.0, 110.0
    legacy = MetricStat(count=41, log_transform=True, q1=q1, median=med, q3=q3, iqr=q3 - q1,
                        log_q1=math.log(q1), log_q3=math.log(q3),
                        log_iqr=math.log(q3) - math.log(q1))
    baseline = StepBaseline(sample_count=41, latency_ms=legacy)
    hits = run_statistical_baseline(call(latency_ms=2000), EvalConfig(baseline=baseline))
    assert [h.condition_code for h in hits] == [5001]
    assert "IQR fence" in str(hits[0].expected)


# --- calibration sources -----------------------------------------------------------

def test_baseline_service_stat_attaches_calibration():
    from services.baseline_service import _stat
    vals = [float(v) for v in range(1, 41)]
    stat = _stat(vals)
    assert stat is not None and stat.calibration == sorted(vals)


def test_forward_model_stat_attaches_calibration():
    from services.forward_model_service import _surprise_stat
    stat = _surprise_stat([0.3, 0.1, 0.2])
    assert stat.calibration == [0.1, 0.2, 0.3]


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all passed")
