# Max context window tokens per model — Anthropic (Claude), 200k context.
CONTEXT_LIMITS: dict[str, int] = {
    "claude-opus-4": 200_000,
    "claude-sonnet-4": 200_000,
    "claude-3-5-sonnet": 200_000,
    "claude-3-5-haiku": 200_000,
    "claude-3-opus": 200_000,
    "claude-3-haiku": 200_000,
    "claude": 200_000,
}

DEFAULT_CONTEXT_LIMIT = 200_000


def get_context_limit(model: str) -> int:
    if model in CONTEXT_LIMITS:
        return CONTEXT_LIMITS[model]
    for key, limit in CONTEXT_LIMITS.items():
        if model.startswith(key):
            return limit
    return DEFAULT_CONTEXT_LIMIT


def compute_utilization(total_tokens: int | None, context_limit: int | None) -> float | None:
    if total_tokens is None or context_limit is None or context_limit <= 0:
        return None
    return round(total_tokens / context_limit, 6)
