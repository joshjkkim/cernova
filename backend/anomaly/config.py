"""Evaluation config — thresholds, static limits, optional penalty overrides.

Penalties themselves live in condition_registry.py. `penalty_overrides` lets a
caller tune a specific code without editing the registry.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from .schemas import StepBaseline


class EvalConfig(BaseModel):
    threshold: float = 100.0
    # code -> penalty, overrides the registry value for that code when present.
    penalty_overrides: dict[int, float] = Field(default_factory=dict)

    # Per-step statistical baseline (L5). When present, L5 scores latency/tokens/
    # cost via IQR Tukey fences against this step's own history, and L4 defers
    # its raw threshold checks (4001/4002/4003) to avoid double-counting.
    baseline: StepBaseline | None = None

    # When an *enforced* learned contract governs this step's output shape, the
    # regex output_format layer defers its JSON checks (2001/2002) to it — the
    # contract's format_not_json (2010) covers the same failure, so we don't
    # double-count one bad shape. Same "defer to the more precise signal" rule
    # the baseline gives numeric_thresholds above.
    contract_governs_format: bool = False

    # Tukey fence multiplier k: fence = Q3 + k*IQR (upper) / Q1 - k*IQR (lower).
    # k=2.5 gives ~0.05% false positive rate on normal data; real LLM distributions
    # are more skewed, so the log-space transform in MetricStat compensates.
    # Only used on the LEGACY path — when a MetricStat carries a conformal
    # calibration set, the decision is p <= conformal_alpha instead and k is
    # irrelevant (calibration already absorbs the distribution's width).
    iqr_fence_k: float = 2.5

    # Conformal false-alarm budget: a scalar fires when its conformal p-value
    # <= alpha — guaranteeing (distribution-free, finite-sample) that at most
    # this fraction of CLEAN calls fires per scalar. With few calibration
    # samples the smallest achievable p is 1/(n+1) (2/(n+1) two-sided); the
    # layer fires at max(alpha, that floor), so small-n steps still detect
    # "beyond everything in history" while the guarantee tightens as n grows.
    conformal_alpha: float = 0.01

    # Static numeric limits — consumed by L4 later. Defined now so config shape
    # is stable across layers.
    limits: dict[str, float] = Field(
        default_factory=lambda: {
            "latency_ms_max": 10_000,
            "total_tokens_max": 50_000,
            "cost_max": 1.0,
            "output_input_ratio_max": 50.0,
            "max_len_ratio_classify": 20.0,
            "chars_per_token_min": 2.0,
            "chars_per_token_max": 8.0,
        }
    )
    step_limits: dict[str, dict[str, float]] = Field(
        default_factory=lambda: {
            "classify": {"max_output_tokens": 50, "max_latency_ms": 2000},
            "proofread": {"max_output_tokens": 100, "max_latency_ms": 3000},
            "draft": {"max_output_tokens": 2000, "max_latency_ms": 15_000},
        }
    )

    def penalty_for(self, code: int, default: float) -> float:
        """Resolved penalty for a code: override if set, else the registry default."""
        return self.penalty_overrides.get(code, default)
