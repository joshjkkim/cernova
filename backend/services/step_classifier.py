"""Step-role inference — classify a step profile's role from its embedding.

Loads the artifact trained by ml/train_step_classifier.py once and reuses it.
Takes the SAME 384-dim all-MiniLM-L6-v2 vector the fingerprinter already computes
for identity matching, so classification is free of any extra embedding — it runs
once, when a new step profile is created (see fingerprinter.match_or_create_profile).

Role → variance_tolerance is a fixed lookup (variance is largely a function of
role); variance sets the Tukey fence width k downstream. Both degrade safely:
a missing artifact, an unknown role, or a low-confidence prediction returns None,
and callers fall back to the default fence.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import NamedTuple

log = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ml", "step_classifier.joblib")

# Below this max-class probability we decline to label rather than guess.
MIN_CONFIDENCE = 0.40

# Variance tolerance per role — how much natural spread the step's metrics have,
# which sets the fence width k. Creative output varies wildly (wide fence);
# routers/extractors are near-deterministic (tight fence).
ROLE_VARIANCE: dict[str, str] = {
    "router":    "low",
    "extractor": "low",
    "retriever": "low",
    "generator": "medium",
    "creative":  "high",
}


class RolePrediction(NamedTuple):
    role: str | None
    variance: str | None
    confidence: float


_UNKNOWN = RolePrediction(None, None, 0.0)


@lru_cache(maxsize=1)
def _load():
    """Load the classifier artifact once. Returns None if it isn't present."""
    if not os.path.exists(MODEL_PATH):
        log.warning(f"[step-classifier] no artifact at {MODEL_PATH} — roles disabled")
        return None
    try:
        import joblib
        return joblib.load(MODEL_PATH)
    except Exception:
        log.error("[step-classifier] failed to load artifact", exc_info=True)
        return None


def classify_role(embedding: list[float]) -> RolePrediction:
    """Classify a step's role from its (already-computed) system-prompt embedding.

    Returns RolePrediction(role, variance, confidence). role/variance are None when
    no artifact is loaded or the top-class probability is below MIN_CONFIDENCE.
    """
    bundle = _load()
    if bundle is None or not embedding:
        return _UNKNOWN
    try:
        clf = bundle["clf"]
        proba = clf.predict_proba([embedding])[0]
        idx = int(proba.argmax())
        confidence = float(proba[idx])
        role = str(clf.classes_[idx])
        if confidence < MIN_CONFIDENCE:
            return RolePrediction(None, None, confidence)
        return RolePrediction(role, ROLE_VARIANCE.get(role), confidence)
    except Exception:
        log.error("[step-classifier] inference failed", exc_info=True)
        return _UNKNOWN
