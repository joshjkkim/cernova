"""Adapter for LangSmith runs (import / warm-start).

Maps LangSmith `llm` runs — the model calls — into CanonicalTrace so a new user's
existing LangSmith history can seed step profiles and baselines on day one. This
is the only place LangSmith's run vocabulary is known.

A LangSmith trace is a tree of runs sharing a trace_id; only the `llm` leaves
carry a model call, so run_to_canonical returns None for chain/tool/retriever
runs. The run's trace_id becomes the Cernova run_id (grouping the trace) and each
llm run's own id becomes the span_id and external_id — so re-running an import is
idempotent (see the partial unique index in add_calls_idempotency.sql). start_time
is carried into CanonicalTrace.timestamp so imported rows are backdated and
baselines/evolution cutoffs order by real time, not import time.

LangSmith stores prompts the way LangChain serializes them, and that shape varies:
inputs may be {"messages": [[...]]} (a batch-of-one nested list) of LangChain
constructor dicts ({"id": [...,"HumanMessage"], "kwargs": {"content": ...}}), the
older dumpd form ({"type": "human", "data": {"content": ...}}), plain
{"role","content"} dicts, or {"prompts": ["..."]} for completion models. Tokens,
cost, and the model name each live in several possible places across versions —
all handled below.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from schemas.canonical import CanonicalMessage, CanonicalTrace

# LangChain serializes a message either as a constructor dict whose `id` array
# ends in the class name, or as a dumpd dict with a short `type` tag. Map both to
# a canonical role.
_ROLE_BY_CLASS = {
    "SystemMessage": "system",
    "HumanMessage": "user",
    "HumanMessageChunk": "user",
    "AIMessage": "assistant",
    "AIMessageChunk": "assistant",
    "ToolMessage": "tool",
    "FunctionMessage": "function",
    "ChatMessage": "user",
}
_ROLE_BY_TYPE = {
    "system": "system",
    "human": "user",
    "ai": "assistant",
    "tool": "tool",
    "function": "function",
    "chat": "user",
}


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


def _stringify(v: Any) -> str:
    """Content may be a plain string or a structured block (tool calls, content
    parts) — keep strings verbatim, serialize anything else."""
    if v is None:
        return ""
    return v if isinstance(v, str) else json.dumps(v)


def _message_from_dict(m: dict[str, Any]) -> CanonicalMessage:
    # LangChain constructor form: {"id": [...,"HumanMessage"], "kwargs": {...}}.
    kwargs = m.get("kwargs")
    if isinstance(kwargs, dict):
        cls = m["id"][-1] if isinstance(m.get("id"), list) and m["id"] else None
        role = _ROLE_BY_CLASS.get(cls) or str(kwargs.get("role") or "user")
        return CanonicalMessage(role=role, content=_stringify(kwargs.get("content", "")))
    # LangChain dumpd form: {"type": "human", "data": {"content": ...}}.
    data = m.get("data")
    if isinstance(data, dict) and "type" in m:
        role = _ROLE_BY_TYPE.get(str(m.get("type")).lower(), "user")
        return CanonicalMessage(role=role, content=_stringify(data.get("content", "")))
    # Plain OpenAI-style {"role","content"}.
    if "role" in m or "content" in m:
        return CanonicalMessage(role=str(m.get("role", "user")), content=_stringify(m.get("content", "")))
    return CanonicalMessage(role="user", content=json.dumps(m))


def _message_from_any(m: Any) -> CanonicalMessage:
    if isinstance(m, dict):
        return _message_from_dict(m)
    if m is None:
        return CanonicalMessage(role="user", content="")
    return CanonicalMessage(role="user", content=str(m))


def _flatten_messages(items: list[Any]) -> list[CanonicalMessage]:
    """LangChain batches messages as [[m, m, ...]]; flatten one level of nesting."""
    out: list[CanonicalMessage] = []
    for it in items:
        if isinstance(it, list):
            out.extend(_message_from_any(m) for m in it)
        else:
            out.append(_message_from_any(it))
    return out


def _coerce_messages(inputs: Any) -> list[CanonicalMessage]:
    """Normalize a run's `inputs` into ordered messages."""
    if inputs is None:
        return []
    if isinstance(inputs, str):
        return [CanonicalMessage(role="user", content=inputs)]
    if isinstance(inputs, dict):
        if isinstance(inputs.get("messages"), list):
            return _flatten_messages(inputs["messages"])
        if isinstance(inputs.get("prompts"), list):
            return [CanonicalMessage(role="user", content=_stringify(p)) for p in inputs["prompts"]]
        if isinstance(inputs.get("input"), str):
            return [CanonicalMessage(role="user", content=inputs["input"])]
        if "role" in inputs or "content" in inputs or "kwargs" in inputs:
            return [_message_from_dict(inputs)]
        return [CanonicalMessage(role="user", content=json.dumps(inputs))]
    if isinstance(inputs, list):
        return _flatten_messages(inputs)
    return [CanonicalMessage(role="user", content=str(inputs))]


def _message_content(msg: dict[str, Any]) -> str | None:
    if isinstance(msg.get("kwargs"), dict):
        return _stringify(msg["kwargs"].get("content", ""))
    if isinstance(msg.get("data"), dict):
        return _stringify(msg["data"].get("content", ""))
    if "content" in msg:
        return _stringify(msg.get("content"))
    return None


def _first_generation(gens: Any) -> dict[str, Any] | None:
    """Dive through LangSmith's nested generations list ([[gen]]) to the first
    generation dict."""
    node = gens
    for _ in range(3):
        if isinstance(node, list):
            if not node:
                return None
            node = node[0]
        else:
            break
    return node if isinstance(node, dict) else None


def _coerce_output(outputs: Any) -> str | None:
    """Flatten a run's `outputs` into the assistant text. LLM runs carry
    {"generations": [[{"text": ..., "message": {...}}]]}; fall back to common
    single-value shapes, else serialize."""
    if outputs is None:
        return None
    if isinstance(outputs, str):
        return outputs
    if isinstance(outputs, dict):
        gen = _first_generation(outputs.get("generations"))
        if gen is not None:
            text = gen.get("text")
            if isinstance(text, str) and text:
                return text
            msg = gen.get("message")
            if isinstance(msg, dict):
                content = _message_content(msg)
                if content:
                    return content
        for key in ("content", "output", "text"):
            if isinstance(outputs.get(key), str):
                return outputs[key]
        return json.dumps(outputs)
    if isinstance(outputs, list):
        gen = _first_generation(outputs)
        if gen is not None and isinstance(gen.get("text"), str):
            return gen["text"]
        return json.dumps(outputs)
    return str(outputs)


def _extract_model(run: dict[str, Any]) -> str:
    """Model name lives in several places across LangChain versions — prefer the
    explicit ls_model_name metadata, then invocation params, then output/serialized."""
    extra = run.get("extra") or {}
    meta = extra.get("metadata") or {}
    inv = extra.get("invocation_params") or {}
    llm_output = (run.get("outputs") or {}).get("llm_output")
    serialized = run.get("serialized") or {}

    candidates = [
        meta.get("ls_model_name"),
        inv.get("model_name"),
        inv.get("model"),
        llm_output.get("model_name") if isinstance(llm_output, dict) else None,
        (serialized.get("kwargs") or {}).get("model") if isinstance(serialized, dict) else None,
    ]
    for c in candidates:
        if c:
            return str(c)
    return "unknown"


def _extract_tokens(run: dict[str, Any]) -> tuple[int | None, int | None, int | None]:
    """Tokens may sit at the run's top level (newer API) or nested in
    outputs.llm_output.token_usage / usage_metadata (LangChain callback output)."""
    it = _to_int(run.get("prompt_tokens"))
    ot = _to_int(run.get("completion_tokens"))
    tt = _to_int(run.get("total_tokens"))

    if it is None and ot is None and tt is None:
        outputs = run.get("outputs") or {}
        llm_output = outputs.get("llm_output")
        usage: dict[str, Any] = {}
        if isinstance(llm_output, dict):
            usage = llm_output.get("token_usage") or llm_output.get("usage") or {}
        if not usage and isinstance(outputs.get("usage_metadata"), dict):
            usage = outputs["usage_metadata"]
        it = _to_int(_first_present(usage.get("prompt_tokens"), usage.get("input_tokens")))
        ot = _to_int(_first_present(usage.get("completion_tokens"), usage.get("output_tokens")))
        tt = _to_int(usage.get("total_tokens"))

    if tt is None and (it is not None or ot is not None):
        tt = (it or 0) + (ot or 0)
    return it, ot, tt


def _extract_cost(run: dict[str, Any]) -> float | None:
    cost = _to_float(run.get("total_cost"))
    if cost is None:
        pc = _to_float(run.get("prompt_cost"))
        cc = _to_float(run.get("completion_cost"))
        if pc is not None or cc is not None:
            cost = (pc or 0.0) + (cc or 0.0)
    return cost


def _latency_ms(start: Any, end: Any) -> int:
    """Milliseconds between ISO-8601 start_time and end_time; 0 if unparseable."""
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


def run_to_canonical(run: dict[str, Any]) -> CanonicalTrace | None:
    """Map one LangSmith run to a CanonicalTrace, or None if it isn't an `llm`
    run (i.e. carries no model call)."""
    if str(run.get("run_type", "")).lower() != "llm":
        return None

    input_tokens, output_tokens, total_tokens = _extract_tokens(run)
    messages = _coerce_messages(run.get("inputs"))
    output_text = _coerce_output(run.get("outputs"))

    # Hoist a leading system message into the dedicated field, matching the
    # cernova/otel/langfuse adapters so fingerprinting sees a consistent shape.
    system: str | None = None
    if messages and messages[0].role == "system":
        system = messages[0].content
        messages = messages[1:]

    raw_prompt = json.dumps({
        "system": system,
        "messages": [m.model_dump() for m in messages],
    })

    error = run.get("error")
    status_success = not error
    parent = run.get("parent_run_id")

    return CanonicalTrace(
        run_id=str(run.get("trace_id") or run.get("id") or "unknown"),
        step_name=str(run.get("name") or "llm-call"),
        span_id=str(run["id"]) if run.get("id") else None,
        parent_span_id=str(parent) if parent else None,
        model=_extract_model(run),
        raw_prompt=raw_prompt,
        prompt_parsed=True,
        system=system,
        messages=messages,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        latency_ms=_latency_ms(run.get("start_time"), run.get("end_time")),
        cost=_extract_cost(run),
        status_success=status_success,
        error=str(error) if error else None,
        output_text=output_text,
        timestamp=run.get("start_time") if isinstance(run.get("start_time"), str) else None,
        source="langsmith",
        external_id=str(run["id"]) if run.get("id") else None,
    )


def runs_to_canonical(runs: list[dict[str, Any]]) -> list[CanonicalTrace]:
    """Map a page of LangSmith runs → CanonicalTrace (llm runs only)."""
    out = []
    for run in runs:
        trace = run_to_canonical(run)
        if trace is not None:
            out.append(trace)
    return out
