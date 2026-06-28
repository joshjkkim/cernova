"""Layer 3 — Job 1: BUILD the behavior fingerprint.

Turns one call into a 778-number "behavior fingerprint":

    prompt_embed (384) + output_embed (384) + numeric_block (6) + goal_one_hot (4)

Built at ingest (off the response path) and stored on ``CALLS.behavior_vector``;
``layer.py`` (Job 3: COMPARE) scores it against the per-step centroid.

Goal classification lives here too — the goal type is just the one-hot tail of the
vector, so the whole fingerprint is assembled in one place. Text → embedding is the
only external dependency (``embed_fn``), injected by the caller (ingest passes the
shared MiniLM embedder); this module stays pure.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from ...schemas import CallInput

EMBED_DIM = 384
NUMERIC_DIM = 6
GOAL_DIM = 4
VECTOR_DIM = EMBED_DIM * 2 + NUMERIC_DIM + GOAL_DIM  # 778

OUTPUT_MAX_CHARS = 500


# --- Goal type: the one-hot tail of the fingerprint ------------------------

GoalType = Literal["Lookup", "Extract", "Transform", "Creative"]

GOAL_TYPES: tuple[GoalType, ...] = ("Lookup", "Extract", "Transform", "Creative")

_LOOKUP = ("lookup", "search", "find", "retrieve", "what is", "who is", "list ")
_EXTRACT = ("extract", "parse", "pull", "identify", "classify", "summarize", "summary")
_TRANSFORM = ("transform", "convert", "format", "json", "schema", "one of", "enum", "validate")
_CREATIVE = ("generate", "write", "draft", "compose", "create", "reply", "respond with")


def classify_goal_type(system_prompt: str) -> GoalType:
    """Classify intent from the stable system prompt (first match wins)."""
    text = system_prompt.lower()

    for kw in _EXTRACT:
        if kw in text:
            return "Extract"
    for kw in _TRANSFORM:
        if kw in text:
            return "Transform"
    for kw in _CREATIVE:
        if kw in text:
            return "Creative"
    for kw in _LOOKUP:
        if kw in text:
            return "Lookup"

    return "Transform"


# --- Fingerprint assembly --------------------------------------------------

def _log_scale(value: float | int | None) -> float:
    if value is None or value < 0:
        return 0.0
    return math.log1p(float(value))


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-12:
        return vec
    return [x / norm for x in vec]


def _goal_one_hot(goal_type: str) -> list[float]:
    vec = [0.0] * GOAL_DIM
    try:
        idx = GOAL_TYPES.index(goal_type)  # type: ignore[arg-type]
        vec[idx] = 1.0
    except ValueError:
        vec[GOAL_TYPES.index("Transform")] = 1.0
    return vec


def _numeric_block(
    *,
    latency_ms: int,
    total_tokens: int | None,
    output_tokens: int | None,
    input_tokens: int | None,
    cost: float | None,
    output_char_len: int,
) -> list[float]:
    return [
        _log_scale(latency_ms),
        _log_scale(total_tokens),
        _log_scale(output_tokens),
        _log_scale(input_tokens),
        _log_scale(cost),
        _log_scale(output_char_len),
    ]


def build_behavior_vector(
    call: CallInput,
    embed_fn: Callable[[str], list[float]],
    *,
    system_prompt: str | None = None,
    goal_type: str | None = None,
) -> list[float]:
    """Build a 778-dim L2-normalized behavior vector for one call."""
    prompt_text = system_prompt if system_prompt is not None else (call.system_prompt or call.prompt)
    prompt_embed = embed_fn(prompt_text[:500])

    output = call.output_code or ""
    output_embed = embed_fn(output[:OUTPUT_MAX_CHARS]) if output.strip() else [0.0] * EMBED_DIM

    numeric = _numeric_block(
        latency_ms=call.latency_ms,
        total_tokens=call.total_tokens,
        output_tokens=call.output_tokens,
        input_tokens=call.input_tokens,
        cost=call.cost,
        output_char_len=len(output),
    )

    goal = goal_type or classify_goal_type(prompt_text)
    goal_vec = _goal_one_hot(goal)

    return _l2_normalize([*prompt_embed, *output_embed, *numeric, *goal_vec])


def cosine_distance(a: list[float], b: list[float]) -> float:
    """Cosine distance between two vectors (0 = identical direction, 2 = opposite)."""
    if len(a) != len(b):
        raise ValueError(f"vector length mismatch: {len(a)} vs {len(b)}")
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a < 1e-12 or norm_b < 1e-12:
        return 1.0
    similarity = dot / (norm_a * norm_b)
    return 1.0 - similarity
