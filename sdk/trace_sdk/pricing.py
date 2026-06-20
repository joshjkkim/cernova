from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPricing:
    input_per_million: float
    output_per_million: float


# USD per 1M tokens — Anthropic (Claude). Update for current pricing.
MODEL_PRICING: dict[str, ModelPricing] = {
    "claude-opus-4": ModelPricing(input_per_million=15.00, output_per_million=75.00),
    "claude-sonnet-4": ModelPricing(input_per_million=3.00, output_per_million=15.00),
    "claude-3-5-sonnet": ModelPricing(input_per_million=3.00, output_per_million=15.00),
    "claude-3-5-haiku": ModelPricing(input_per_million=0.80, output_per_million=4.00),
    "claude-3-opus": ModelPricing(input_per_million=15.00, output_per_million=75.00),
    "claude-3-haiku": ModelPricing(input_per_million=0.25, output_per_million=1.25),
}


def _get_pricing(model: str) -> ModelPricing | None:
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]
    for key, pricing in MODEL_PRICING.items():
        if model.startswith(key):
            return pricing
    return None


def compute_cost(
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
) -> float | None:
    pricing = _get_pricing(model)
    if pricing is None:
        return None
    cost = 0.0
    if input_tokens:
        cost += (input_tokens / 1_000_000) * pricing.input_per_million
    if output_tokens:
        cost += (output_tokens / 1_000_000) * pricing.output_per_million
    return round(cost, 8)
