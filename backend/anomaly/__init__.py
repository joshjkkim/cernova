"""trace-anomaly — standalone weighted-layer scoring for traced LLM calls."""

from __future__ import annotations

from .condition_registry import CONDITION_REGISTRY, ConditionDef, describe
from .config import EvalConfig
from .evaluator import evaluate_call
from .schemas import CallInput, EvalHit, EvalResult, LayerId, OutputShape

__all__ = [
    "evaluate_call",
    "CallInput",
    "EvalResult",
    "EvalHit",
    "EvalConfig",
    "OutputShape",
    "LayerId",
    "CONDITION_REGISTRY",
    "ConditionDef",
    "describe",
]
