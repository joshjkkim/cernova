"""Unit tests for step-role inference.

Mocks the trained artifact so nothing loads sklearn or the embedding model — the
tests exercise the decision logic (confidence floor, variance lookup, safe
degradation) and the variance->k mapping, not the model's accuracy.

    cd backend && pytest tests/test_step_classifier.py
"""

from __future__ import annotations

from unittest.mock import patch

import numpy as np

from services import step_classifier as sc

_MOD = "services.step_classifier"


class FakeClf:
    """Stand-in for the sklearn LogisticRegression: classes_ + predict_proba."""

    def __init__(self, classes, proba):
        self.classes_ = np.array(classes)
        self._proba = np.array([proba])

    def predict_proba(self, X):
        return self._proba


def bundle(classes, proba):
    return {"clf": FakeClf(classes, proba)}


ROLES = ["creative", "extractor", "generator", "retriever", "router"]


# --- k_for_variance -----------------------------------------------------------

def test_k_for_variance_mapping():
    assert sc.k_for_variance("low") == 2.0
    assert sc.k_for_variance("medium") == 2.5
    assert sc.k_for_variance("high") == 3.5


def test_k_for_variance_defaults_when_unknown_or_none():
    assert sc.k_for_variance(None) == sc.DEFAULT_K
    assert sc.k_for_variance("bogus") == sc.DEFAULT_K
    assert sc.DEFAULT_K == 2.5  # matches EvalConfig.iqr_fence_k default


# --- classify_role: confident prediction -------------------------------------

def test_confident_prediction_returns_role_and_variance():
    # router wins clearly (0.70), above the 0.40 floor.
    proba = [0.05, 0.05, 0.10, 0.10, 0.70]  # creative, extractor, generator, retriever, router
    with patch(f"{_MOD}._load", return_value=bundle(ROLES, proba)):
        pred = sc.classify_role([0.1] * 384)
    assert pred.role == "router"
    assert pred.variance == "low"          # ROLE_VARIANCE["router"]
    assert pred.confidence == 0.70


def test_creative_maps_to_high_variance():
    proba = [0.80, 0.05, 0.05, 0.05, 0.05]
    with patch(f"{_MOD}._load", return_value=bundle(ROLES, proba)):
        pred = sc.classify_role([0.1] * 384)
    assert pred.role == "creative"
    assert pred.variance == "high"


# --- classify_role: the safety paths -----------------------------------------

def test_low_confidence_declines():
    # Top class only 0.35 (< MIN_CONFIDENCE) -> decline, but still report the score.
    proba = [0.20, 0.20, 0.10, 0.15, 0.35]
    with patch(f"{_MOD}._load", return_value=bundle(ROLES, proba)):
        pred = sc.classify_role([0.1] * 384)
    assert pred.role is None
    assert pred.variance is None
    assert pred.confidence == 0.35


def test_missing_artifact_returns_unknown():
    with patch(f"{_MOD}._load", return_value=None):
        pred = sc.classify_role([0.1] * 384)
    assert pred == sc._UNKNOWN


def test_empty_embedding_returns_unknown():
    with patch(f"{_MOD}._load", return_value=bundle(ROLES, [0.9, 0, 0, 0, 0.1])):
        pred = sc.classify_role([])
    assert pred == sc._UNKNOWN


def test_inference_error_degrades_to_unknown():
    class Boom:
        classes_ = np.array(ROLES)
        def predict_proba(self, X):
            raise RuntimeError("boom")

    with patch(f"{_MOD}._load", return_value={"clf": Boom()}):
        pred = sc.classify_role([0.1] * 384)
    assert pred == sc._UNKNOWN


def test_every_role_has_a_variance():
    # Guard against adding a role to the model without updating ROLE_VARIANCE.
    for role in ROLES:
        assert role in sc.ROLE_VARIANCE
