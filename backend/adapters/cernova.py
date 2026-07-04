"""Adapter for the Cernova SDK wire format (@cernova/sdk and the cernova pip package).

The SDKs send a flat payload whose `prompt` field is a JSON string in one of
two shapes:

    TS SDK:      {"system": "...", "messages": [...]}
    LangChain:   {"messages": [{"role": "system", "content": "..."}, ...]}

This is the only place those shapes are known. Parsing happens once, here;
downstream code reads CanonicalTrace.system / .messages.
"""

import json

from schemas.canonical import CanonicalMessage, CanonicalTrace
from schemas.trace import IngestPayload


def _parse_prompt(raw: str) -> tuple[bool, str | None, list[CanonicalMessage]]:
    """Returns (parsed, system, messages). parsed is True only for the
    structured {..., "messages": [...]} shape — it gates whether L2/L3 see the
    extracted instruction text or the raw string."""
    try:
        obj = json.loads(raw)
    except (ValueError, TypeError):
        return False, None, []
    if not isinstance(obj, dict):
        return False, None, []

    system: str | None = str(obj["system"]) if obj.get("system") else None
    messages: list[CanonicalMessage] = []

    raw_msgs = obj.get("messages")
    for msg in raw_msgs if isinstance(raw_msgs, list) else []:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role", ""))
        content = msg.get("content", "")
        text = content if isinstance(content, str) else str(content)
        if role == "system":
            # LangChain shape — hoist the first system message
            if system is None:
                system = text
            continue
        messages.append(CanonicalMessage(role=role, content=text))

    return "messages" in obj, system, messages


def to_canonical(payload: IngestPayload) -> CanonicalTrace:
    parsed, system, messages = _parse_prompt(payload.prompt)
    return CanonicalTrace(
        run_id=payload.run_id,
        step_name=payload.step_name,
        step_index=payload.step_index,
        project_id=payload.project_id,
        span_id=payload.span_id,
        parent_span_id=payload.parent_span_id,
        model=payload.model,
        raw_prompt=payload.prompt,
        prompt_parsed=parsed,
        system=system,
        messages=messages,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        reasoning_tokens=payload.reasoning_tokens,
        total_tokens=payload.total_tokens,
        latency_ms=payload.latency_ms,
        cost=payload.cost,
        status_success=payload.status_success,
        error=payload.error,
        output_text=payload.output_code,
        source="cernova-sdk",
        schema_version=payload.schema_version,
    )
