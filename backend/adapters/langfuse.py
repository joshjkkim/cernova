"""Adapter for Langfuse traces (import / warm-start).

Maps Langfuse GENERATION observations — the LLM calls — into CanonicalTrace so a
new user's existing Langfuse history can seed step profiles and baselines on day
one. This is the only place Langfuse's observation vocabulary is known.

A Langfuse trace groups many observations; its traceId becomes the Cernova
run_id and each GENERATION observation becomes one step. Non-generation
observations (SPAN, EVENT) carry no model call and are skipped —
observation_to_canonical returns None for them.

Each observation's own id becomes external_id, so re-running an import is
idempotent (see the partial unique index in add_calls_idempotency.sql). startTime
is carried into CanonicalTrace.timestamp so imported rows are backdated and
baselines/evolution cutoffs order by real time, not import time.

Field shapes vary across Langfuse versions (usage {input,output,total} vs
{promptTokens,completionTokens,totalTokens}; calculatedTotalCost vs totalCost;
input as a list, {messages:[...]}, or a bare string) — all handled below.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from schemas.canonical import CanonicalMessage, CanonicalTrace


def _first_present(*vals: Any) -> Any:
    """First value that isn't None — unlike `a or b`, this keeps a legitimate 0."""
    for v in vals:
        if v is not None:
            return v
    return None


def _to_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _coerce_messages(blob: Any) -> list[CanonicalMessage]:
    """Normalize Langfuse's `input` into ordered messages. It may arrive as a
    message list, a {"messages": [...]} wrapper, a single {role, content} dict,
    or a bare string/other JSON value."""
    if blob is None:
        return []
    if isinstance(blob, str):
        return [CanonicalMessage(role="user", content=blob)]
    if isinstance(blob, dict):
        if isinstance(blob.get("messages"), list):
            return _coerce_messages(blob["messages"])
        if "role" in blob or "content" in blob:
            return [_message_from_dict(blob)]
        # Unknown dict shape — preserve it as a single user message.
        return [CanonicalMessage(role="user", content=json.dumps(blob))]
    if isinstance(blob, list):
        out: list[CanonicalMessage] = []
        for m in blob:
            if isinstance(m, dict):
                out.append(_message_from_dict(m))
            elif m is not None:
                out.append(CanonicalMessage(role="user", content=str(m)))
        return out
    return [CanonicalMessage(role="user", content=str(blob))]


def _message_from_dict(m: dict[str, Any]) -> CanonicalMessage:
    content = m.get("content", "")
    return CanonicalMessage(
        role=str(m.get("role", "user")),
        content=content if isinstance(content, str) else json.dumps(content),
    )


def _coerce_output(blob: Any) -> str | None:
    """Flatten Langfuse's `output` into the assistant text. It may be a string, a
    {role, content} dict, a {"content": ...} dict, or a list of messages."""
    if blob is None:
        return None
    if isinstance(blob, str):
        return blob
    if isinstance(blob, dict):
        content = blob.get("content")
        if isinstance(content, str):
            return content
        if content is not None:
            return json.dumps(content)
        return json.dumps(blob)
    if isinstance(blob, list):
        # Prefer the last assistant message's content, else serialize the list.
        for m in reversed(blob):
            if isinstance(m, dict) and m.get("role") == "assistant":
                c = m.get("content")
                return c if isinstance(c, str) else json.dumps(c)
        return json.dumps(blob)
    return str(blob)


def _latency_ms(start: Any, end: Any) -> int:
    """Milliseconds between ISO-8601 startTime and endTime; 0 if unparseable."""
    s, e = _parse_iso(start), _parse_iso(end)
    if s is None or e is None:
        return 0
    return max(0, int((e - s).total_seconds() * 1000))


def _parse_iso(v: Any) -> datetime | None:
    if not isinstance(v, str):
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


def observation_to_canonical(obs: dict[str, Any]) -> CanonicalTrace | None:
    """Map one Langfuse observation to a CanonicalTrace, or None if it isn't a
    GENERATION (i.e. carries no LLM call)."""
    if str(obs.get("type", "")).upper() != "GENERATION":
        return None

    usage = obs.get("usage") or {}
    input_tokens = _to_int(_first_present(usage.get("input"), usage.get("promptTokens")))
    output_tokens = _to_int(_first_present(usage.get("output"), usage.get("completionTokens")))
    total_tokens = _to_int(_first_present(usage.get("total"), usage.get("totalTokens")))
    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = (input_tokens or 0) + (output_tokens or 0)

    cost = _to_float(_first_present(obs.get("calculatedTotalCost"), obs.get("totalCost")))
    if cost is None:
        ci = _to_float(obs.get("calculatedInputCost"))
        co = _to_float(obs.get("calculatedOutputCost"))
        if ci is not None or co is not None:
            cost = (ci or 0.0) + (co or 0.0)

    messages = _coerce_messages(obs.get("input"))
    output_text = _coerce_output(obs.get("output"))

    # Hoist a leading system message into the dedicated field, matching the
    # cernova/otel adapters so fingerprinting sees a consistent shape.
    system: str | None = None
    if messages and messages[0].role == "system":
        system = messages[0].content
        messages = messages[1:]

    raw_prompt = json.dumps({
        "system": system,
        "messages": [m.model_dump() for m in messages],
    })

    level = str(obs.get("level", "DEFAULT")).upper()
    status_success = level != "ERROR"
    prompt_version = obs.get("promptVersion")

    return CanonicalTrace(
        run_id=str(obs.get("traceId") or obs.get("id") or "unknown"),
        step_name=str(obs.get("name") or "llm-call"),
        span_id=str(obs["id"]) if obs.get("id") else None,
        parent_span_id=obs.get("parentObservationId"),
        model=str(obs.get("model") or "unknown"),
        raw_prompt=raw_prompt,
        prompt_parsed=True,
        system=system,
        messages=messages,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        latency_ms=_latency_ms(obs.get("startTime"), obs.get("endTime")),
        cost=cost,
        status_success=status_success,
        error=obs.get("statusMessage") if not status_success else None,
        output_text=output_text,
        timestamp=obs.get("startTime") if isinstance(obs.get("startTime"), str) else None,
        source="langfuse",
        external_id=str(obs["id"]) if obs.get("id") else None,
        prompt_version=str(prompt_version) if prompt_version is not None else None,
    )


def observations_to_canonical(observations: list[dict[str, Any]]) -> list[CanonicalTrace]:
    """Map a page of Langfuse observations → CanonicalTrace (GENERATIONs only)."""
    out = []
    for obs in observations:
        trace = observation_to_canonical(obs)
        if trace is not None:
            out.append(trace)
    return out
