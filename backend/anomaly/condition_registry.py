"""Stable registry of every condition that can fire.

Each `if`-branch in a layer references a unique integer code. The UI maps a code
to a human label/penalty without parsing Python. Penalties live here, not
scattered in the layer files — layers only reference codes via `describe()`.

Codes are permanent, opaque identifiers — the numeric prefix is historical and
does NOT track a layer's position (a layer can be added or removed without
renumbering codes, which are persisted in the DB and shown in the UI).

Code ranges:
    hard_failures        1001-1099
    output_format        2001-2099   (regex / contract violations)
    numeric_thresholds   4001-4099   (static thresholds + cross-field)
    statistical_baseline 5001-5099   (IQR/log-normal Tukey fence deviations from per-step baseline)
"""

from __future__ import annotations

from dataclasses import dataclass

from .schemas import LayerId


@dataclass(frozen=True)
class ConditionDef:
    code: int
    layer: LayerId
    name: str            # stable snake_case id
    penalty: float       # contribution to total_score if fired
    description: str      # UI tooltip / dashboard copy
    if_ref: str           # which if-branch in code (dev reference)


# --- hard_failures: deterministic, non-heuristic failures. Each penalty ==
# threshold (100) so any single hard hit short-circuits immediately. ---
_HARD: list[ConditionDef] = [
    ConditionDef(
        1001, "hard_failures", "status_failure", 100.0,
        "Call reported status_success=False.",
        "hard_failures.run_hard_failures:status",
    ),
    ConditionDef(
        1002, "hard_failures", "error_present", 100.0,
        "Call carries a non-empty error message.",
        "hard_failures.run_hard_failures:error",
    ),
    ConditionDef(
        1003, "hard_failures", "empty_output_on_success", 100.0,
        "Call succeeded but produced no output_code.",
        "hard_failures.run_hard_failures:empty_output",
    ),
    ConditionDef(
        1004, "hard_failures", "negative_tokens", 100.0,
        "A token count (input/output/reasoning/total) is negative.",
        "hard_failures.run_hard_failures:negative_tokens",
    ),
    ConditionDef(
        1005, "hard_failures", "negative_latency", 100.0,
        "latency_ms is negative.",
        "hard_failures.run_hard_failures:negative_latency",
    ),
    ConditionDef(
        1006, "hard_failures", "negative_cost", 100.0,
        "cost is negative.",
        "hard_failures.run_hard_failures:negative_cost",
    ),
    ConditionDef(
        1007, "hard_failures", "token_accounting_mismatch", 100.0,
        "total_tokens does not equal input + output + reasoning tokens.",
        "hard_failures.run_hard_failures:token_accounting",
    ),
    ConditionDef(
        1008, "hard_failures", "missing_required_field", 100.0,
        "A required identity field (step_name/model/prompt/run_id) is blank.",
        "hard_failures.run_hard_failures:missing_field",
    ),
]

# --- output_format: prompt-implied output contracts (JSON / enum / yes-no). The
# prompt declares a shape; the output must honor it. Detected via regex +
# json parsing in output_format. ---
_FORMAT: list[ConditionDef] = [
    ConditionDef(
        2001, "output_format", "json_contract_violation", 50.0,
        "Prompt asks for JSON but output_code is not parseable JSON.",
        "output_format.run_output_format:json_contract",
    ),
    ConditionDef(
        2002, "output_format", "json_strict_violation", 60.0,
        "Prompt demands only JSON but output has code fences or surrounding prose.",
        "output_format.run_output_format:json_strict",
    ),
    ConditionDef(
        2003, "output_format", "enum_contract_violation", 35.0,
        "Prompt enumerates allowed answers but output is not one of them.",
        "output_format.run_output_format:enum_contract",
    ),
    ConditionDef(
        2004, "output_format", "yes_no_contract_violation", 25.0,
        "Prompt asks a yes/no question but output is not a bare yes or no.",
        "output_format.run_output_format:yes_no_contract",
    ),
    # Learned-contract violations. Unlike 2001-2004 (inferred from the prompt),
    # these fire against a contract induced from the step's own output history
    # (services/contract_checker). Injected into the result by the ingest
    # pipeline, not by a layer — only when the contract is 'enforced'.
    ConditionDef(
        2010, "output_format", "contract_format_not_json", 50.0,
        "Learned contract expects a JSON object but output was unparseable or non-object.",
        "contract_checker.check_output:format_not_json",
    ),
    ConditionDef(
        2011, "output_format", "contract_missing_required_key", 40.0,
        "Output is missing a key the step's learned contract marks as always present.",
        "contract_checker.check_output:missing_required_key",
    ),
    ConditionDef(
        2012, "output_format", "contract_wrong_type", 40.0,
        "A key's value type differs from the type learned for this step.",
        "contract_checker.check_output:wrong_type",
    ),
]

# --- numeric_thresholds: static numeric limits plus cross-field plausibility.
# Reads limits / step_limits from EvalConfig and shape hints from shape_classifier.
# Penalties are individually small — several must fire to cross threshold. ---
_NUMERIC: list[ConditionDef] = [
    ConditionDef(
        4001, "numeric_thresholds", "latency_threshold", 15.0,
        "latency_ms exceeds the configured maximum.",
        "numeric_thresholds.run_numeric_thresholds:latency",
    ),
    ConditionDef(
        4002, "numeric_thresholds", "tokens_threshold", 15.0,
        "total_tokens exceeds the configured maximum.",
        "numeric_thresholds.run_numeric_thresholds:tokens",
    ),
    ConditionDef(
        4003, "numeric_thresholds", "cost_threshold", 15.0,
        "cost exceeds the configured maximum.",
        "numeric_thresholds.run_numeric_thresholds:cost",
    ),
    ConditionDef(
        4004, "numeric_thresholds", "token_ratio_anomaly", 10.0,
        "output_tokens / input_tokens exceeds the configured ratio.",
        "numeric_thresholds.run_numeric_thresholds:token_ratio",
    ),
    ConditionDef(
        4005, "numeric_thresholds", "classify_step_token_bloat", 25.0,
        "A classify/intent step produced far more output tokens than expected.",
        "numeric_thresholds.run_numeric_thresholds:classify_bloat",
    ),
    ConditionDef(
        4006, "numeric_thresholds", "short_step_output_bloat", 20.0,
        "A short-answer (enum) step produced more output tokens than expected.",
        "numeric_thresholds.run_numeric_thresholds:short_bloat",
    ),
    ConditionDef(
        4007, "numeric_thresholds", "high_latency_low_output", 20.0,
        "High latency paired with almost no output tokens.",
        "numeric_thresholds.run_numeric_thresholds:latency_low_output",
    ),
    ConditionDef(
        4008, "numeric_thresholds", "json_step_token_bloat", 20.0,
        "A JSON-expected step produced an implausibly large token count.",
        "numeric_thresholds.run_numeric_thresholds:json_bloat",
    ),
    ConditionDef(
        4009, "numeric_thresholds", "chars_per_token_suspicious", 15.0,
        "Output characters per token fall outside the plausible range.",
        "numeric_thresholds.run_numeric_thresholds:chars_per_token",
    ),
    ConditionDef(
        4010, "numeric_thresholds", "zero_output_tokens_with_body", 25.0,
        "output_tokens is zero but output_code is non-empty.",
        "numeric_thresholds.run_numeric_thresholds:zero_tokens_body",
    ),
]

# --- statistical_baseline: IQR/log-normal Tukey fence deviations from per-step-
# profile baselines. Only fires when a StepBaseline is available (≥20 samples). Fence
# is computed in log space — multiplicative detection suited to right-skewed LLM data.
# Owns latency/tokens/cost when active — numeric_thresholds' 4001/4002/4003 defer to these. ---
_STATISTICAL: list[ConditionDef] = [
    ConditionDef(
        5001, "statistical_baseline", "latency_iqr_fence", 30.0,
        "Call latency falls outside the Tukey fence in log space (multiplicative latency spike vs this step's baseline).",
        "statistical_baseline.run_statistical_baseline:latency_iqr_fence",
    ),
    ConditionDef(
        5002, "statistical_baseline", "tokens_iqr_fence", 25.0,
        "Total token count falls outside the Tukey fence — abnormally large or small output for this step.",
        "statistical_baseline.run_statistical_baseline:tokens_iqr_fence",
    ),
    ConditionDef(
        5003, "statistical_baseline", "cost_iqr_fence", 20.0,
        "Call cost falls outside the Tukey fence — typically caused by unexpected token growth.",
        "statistical_baseline.run_statistical_baseline:cost_iqr_fence",
    ),
    ConditionDef(
        5004, "statistical_baseline", "output_tokens_iqr_fence", 20.0,
        "Output token count falls outside the Tukey fence, independent of input size.",
        "statistical_baseline.run_statistical_baseline:output_tokens_iqr_fence",
    ),
    # L1 perception — forward-model semantic surprise. Unlike 5001-5004 (raw
    # metrics from the SDK), the observed value is COMPUTED by the pipeline:
    # surprise = 1 - cos(g(embed(input)), embed(output)) against the step's own
    # learned input->output map (services/forward_model_service). Fires when the
    # output is semantically unlike what this step produces for this input.
    ConditionDef(
        5010, "statistical_baseline", "semantic_surprise_fence", 40.0,
        "Output is semantically unlike what this step normally produces for this input "
        "(forward-model surprise outside the step's own fence).",
        "statistical_baseline.run_statistical_baseline:semantic_surprise_fence",
    ),
]

CONDITION_REGISTRY: dict[int, ConditionDef] = {
    c.code: c for c in (*_HARD, *_FORMAT, *_NUMERIC, *_STATISTICAL)
}


def describe(code: int) -> ConditionDef:
    """Look up a condition definition by code. Raises KeyError if unregistered."""
    return CONDITION_REGISTRY[code]
