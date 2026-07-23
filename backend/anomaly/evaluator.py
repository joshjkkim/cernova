"""evaluate_call — run the weighted layers in order and produce an EvalResult.

Layers run hard_failures -> output_format -> numeric_thresholds ->
statistical_baseline. Each fired condition contributes its penalty to
a running total via error_map. After each layer we check the threshold: once
total_score >= threshold the call is anomalous and we short-circuit, recording
which layer we stopped at.

Storage rule (plan): a clean call stores nothing. So when the run finishes below
threshold we return an empty report (hits=[], error_map={}, total_score=0) even
if some sub-threshold conditions technically fired — they were not enough to
flag the call.
"""

from __future__ import annotations

from .config import EvalConfig
from .layers.hard_failures import run_hard_failures
from .layers.output_format import run_output_format
from .layers.numeric_thresholds import run_numeric_thresholds
from .layers.statistical_baseline import run_statistical_baseline
from .schemas import CallInput, EvalHit, EvalResult, LayerId
from .shape_classifier import classify_shape

# Ordered pipeline. (layer_id, runner) — order is the scoring order. Labels are
# semantic, not positional, so add/remove never leaves a misleading gap (an
# earlier heuristic shape layer was removed for overlapping with output_format).
_LAYERS: list[tuple[LayerId, object]] = [
    ("hard_failures",        run_hard_failures),
    ("output_format",        run_output_format),
    ("numeric_thresholds",   run_numeric_thresholds),
    ("statistical_baseline", run_statistical_baseline),
]


def evaluate_call(payload: CallInput, config: EvalConfig | None = None) -> EvalResult:
    """Score one traced call. Returns a full EvalResult (clean or triggered)."""
    config = config or EvalConfig()

    # Computed for UI/debug regardless of outcome.
    prompt_shape = classify_shape(payload.prompt)
    output_shape = classify_shape(payload.output_code)

    hits: list[EvalHit] = []
    error_map: dict[int, float] = {}
    total = 0.0
    stopped_at: LayerId | None = None

    for layer_id, runner in _LAYERS:
        for hit in runner(payload, config):  # type: ignore[operator]
            hits.append(hit)
            error_map[hit.condition_code] = hit.penalty
            total += hit.penalty
        if total >= config.threshold:
            stopped_at = layer_id
            break

    triggered = total >= config.threshold

    return EvalResult(
        triggered=triggered,
        total_score=total,
        threshold=config.threshold,
        stopped_at_layer=stopped_at,
        hits=hits,
        error_map=error_map,
        prompt_shape=prompt_shape,
        output_shape=output_shape,
    )
