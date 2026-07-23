"""Tests for L1 perception — forward-model semantic surprise.

Covers: the 5010 fence integration (fires only on HIGH surprise, via the scalar
registry), the scoring math against a known coef, role gating, min-samples,
TTL caching, and safe degradation. DB and embedder are faked — no model load.

    cd backend && pytest tests/test_forward_model.py
"""

from __future__ import annotations

import numpy as np
from unittest.mock import patch

import services.forward_model_service as fms
from anomaly.config import EvalConfig
from anomaly.layers.statistical_baseline import run_statistical_baseline
from anomaly.schemas import CallInput, MetricStat, StepBaseline

MOD = "services.forward_model_service"


def surprise_stat(q1=0.05, med=0.08, q3=0.12) -> MetricStat:
    return MetricStat(count=30, log_transform=False, q1=q1, median=med, q3=q3, iqr=q3 - q1)


def call(**over) -> CallInput:
    base = dict(step_name="router", model="m", prompt="hi", run_id="r", latency_ms=100)
    base.update(over)
    return CallInput(**base)


# --- 5010 through the fence (the scalar-registry seam) -----------------------

def test_high_surprise_fires_5010():
    baseline = StepBaseline(sample_count=30, semantic_surprise=surprise_stat())
    hits = run_statistical_baseline(call(semantic_surprise=0.9), EvalConfig(baseline=baseline))
    assert [h.condition_code for h in hits] == [5010]
    assert hits[0].observed == 0.9


def test_normal_surprise_is_silent():
    baseline = StepBaseline(sample_count=30, semantic_surprise=surprise_stat())
    assert run_statistical_baseline(call(semantic_surprise=0.08), EvalConfig(baseline=baseline)) == []


def test_low_surprise_is_silent_upper_tail_only():
    # Landing unusually CLOSE to prediction is below the lower fence — not anomalous.
    baseline = StepBaseline(sample_count=30, semantic_surprise=surprise_stat())
    assert run_statistical_baseline(call(semantic_surprise=0.0001), EvalConfig(baseline=baseline)) == []


def test_no_surprise_value_skips_5010():
    baseline = StepBaseline(sample_count=30, semantic_surprise=surprise_stat())
    assert run_statistical_baseline(call(), EvalConfig(baseline=baseline)) == []


# --- scoring math -------------------------------------------------------------

def _identity_model(dim=4):
    return fms.FittedModel(coef=np.eye(dim), intercept=np.zeros(dim),
                           stat=surprise_stat(), fitted_at=fms.time.time(), n=30)


def test_score_surprise_math_identity_coef():
    # coef = identity -> prediction == input embedding. Same in/out vector ->
    # surprise 0; orthogonal output -> surprise 1.
    vecs = {"in": [1.0, 0.0, 0.0, 0.0], "same": [1.0, 0.0, 0.0, 0.0], "orth": [0.0, 1.0, 0.0, 0.0]}

    def fake_embed(text):
        return vecs[text]

    with patch(f"{MOD}._get_model", return_value=_identity_model()), \
         patch("services.fingerprinter._embed", side_effect=fake_embed):
        s_same = fms.score_surprise("p1", '{"messages":[{"role":"user","content":"in"}]}', "same")
        s_orth = fms.score_surprise("p1", '{"messages":[{"role":"user","content":"in"}]}', "orth")

    assert s_same is not None and abs(s_same[0]) < 1e-9
    assert s_orth is not None and abs(s_orth[0] - 1.0) < 1e-9


def test_score_returns_none_without_model_or_output():
    skip = fms.FittedModel(coef=None, intercept=None, stat=None, fitted_at=fms.time.time(), n=0)
    with patch(f"{MOD}._get_model", return_value=skip):
        assert fms.score_surprise("p1", '{"messages":[{"role":"user","content":"x"}]}', "out") is None
    assert fms.score_surprise("p1", '{"messages":[{"role":"user","content":"x"}]}', None) is None
    assert fms.score_surprise("p1", None, "out") is None


def test_score_never_raises():
    with patch(f"{MOD}._get_model", side_effect=RuntimeError("boom")):
        assert fms.score_surprise("p1", '{"messages":[{"role":"user","content":"x"}]}', "out") is None


# --- fit gating + cache --------------------------------------------------------

class FakeDB:
    def __init__(self, role, rows):
        self.role, self.rows = role, rows

    def table(self, name):
        db = self

        class Q:
            def __getattr__(self, _):
                return lambda *a, **k: self

            def execute(self):
                class R: pass
                r = R()
                r.data = {"role": db.role, "last_evolved_at": None} if name == "step_profiles" else db.rows
                return r
        return Q()


def test_fit_skips_ungated_role():
    fms._cache.clear()
    with patch(f"{MOD}.get_client", return_value=FakeDB("generator", [])):
        fm = fms._get_model("p-gen")
    assert fm.coef is None


def test_fit_skips_thin_history():
    fms._cache.clear()
    rows = [{"prompt": '{"messages":[{"role":"user","content":"q"}]}', "output_code": "a"}] * 5
    with patch(f"{MOD}.get_client", return_value=FakeDB("router", rows)):
        fm = fms._get_model("p-thin")
    assert fm.coef is None and fm.n == 5


def test_cache_hit_avoids_refit():
    fms._cache.clear()
    with patch(f"{MOD}._fit", return_value=_identity_model()) as fit:
        fms._get_model("p1")
        fms._get_model("p1")
    assert fit.call_count == 1


def test_ttl_expiry_refits():
    fms._cache.clear()
    stale = _identity_model()
    stale.fitted_at = fms.time.time() - fms.FIT_TTL_SEC - 1
    fms._cache["p1"] = stale
    with patch(f"{MOD}._fit", return_value=_identity_model()) as fit:
        fms._get_model("p1")
    assert fit.call_count == 1


# --- registry sanity ------------------------------------------------------------

def test_5010_registered():
    from anomaly.condition_registry import describe
    cond = describe(5010)
    assert cond.name == "semantic_surprise_fence"
    assert cond.layer == "statistical_baseline"
