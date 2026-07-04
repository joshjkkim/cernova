"""Adapter for OpenTelemetry GenAI traces (OTLP).

Accepts the OTLP/JSON trace payload and maps GenAI-convention spans into
CanonicalTrace. This is the only place OTel's attribute vocabulary — and the
divergences between emitters — is known.

Emitters handled:
  - Native OTel GenAI semantic conventions (gen_ai.*)
  - OpenLLMetry / Traceloop (gen_ai.prompt.N.*, gen_ai.completion.N.*, *_tokens)
  - Vercel AI SDK (ai.* namespace)

An OTLP trace groups many spans; the trace_id becomes the Cernova run_id and
each GenAI span becomes one step. Non-GenAI spans (HTTP, DB, framework) are
skipped — span_to_canonical returns None for them.

Known gap: OTel spans rarely carry cost, so CanonicalTrace.cost is usually None
for this source (latency/token detection still applies). Server-side cost
derivation from model + tokens is a later addition.
"""

from __future__ import annotations

import json
from typing import Any, TypedDict

from schemas.canonical import CanonicalMessage, CanonicalTrace


class NormalizedSpan(TypedDict):
    trace_id: str
    span_id: str
    parent_span_id: str | None
    name: str
    start_nano: int
    end_nano: int
    attributes: dict[str, Any]
    events: list[dict[str, Any]]
    status_code: int  # 0 unset, 1 ok, 2 error (OTLP StatusCode)
    resource: dict[str, Any]


# ── OTLP/JSON decoding ─────────────────────────────────────────────────────────

def _unwrap_value(v: Any) -> Any:
    """OTLP wraps every attribute value in a typed AnyValue object. Unwrap to a
    plain Python value."""
    if not isinstance(v, dict):
        return v
    if "stringValue" in v:
        return v["stringValue"]
    if "intValue" in v:
        # OTLP/JSON encodes int64 as a string
        try:
            return int(v["intValue"])
        except (ValueError, TypeError):
            return v["intValue"]
    if "doubleValue" in v:
        return v["doubleValue"]
    if "boolValue" in v:
        return v["boolValue"]
    if "arrayValue" in v:
        return [_unwrap_value(x) for x in v["arrayValue"].get("values", [])]
    if "kvlistValue" in v:
        return _unwrap_attributes(v["kvlistValue"].get("values", []))
    return None


def _unwrap_attributes(attrs: list[dict[str, Any]] | None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for a in attrs or []:
        key = a.get("key")
        if key is not None:
            out[key] = _unwrap_value(a.get("value"))
    return out


def _to_int(v: Any) -> int:
    try:
        return int(v)
    except (ValueError, TypeError):
        return 0


def otlp_json_to_spans(payload: dict[str, Any]) -> list[NormalizedSpan]:
    """Flatten an OTLP/JSON ExportTraceServiceRequest into normalized spans."""
    spans: list[NormalizedSpan] = []
    for rs in payload.get("resourceSpans", []):
        resource = _unwrap_attributes(rs.get("resource", {}).get("attributes"))
        for ss in rs.get("scopeSpans", []):
            for sp in ss.get("spans", []):
                events = [
                    {
                        "name": ev.get("name", ""),
                        "attributes": _unwrap_attributes(ev.get("attributes")),
                        "time_nano": _to_int(ev.get("timeUnixNano", 0)),
                    }
                    for ev in sp.get("events", []) or []
                ]
                spans.append(NormalizedSpan(
                    trace_id=sp.get("traceId", ""),
                    span_id=sp.get("spanId", ""),
                    parent_span_id=sp.get("parentSpanId") or None,
                    name=sp.get("name", ""),
                    start_nano=_to_int(sp.get("startTimeUnixNano", 0)),
                    end_nano=_to_int(sp.get("endTimeUnixNano", 0)),
                    attributes=_unwrap_attributes(sp.get("attributes")),
                    events=events,
                    status_code=_to_int(sp.get("status", {}).get("code", 0)),
                    resource=resource,
                ))
    return spans


# ── GenAI span → CanonicalTrace ────────────────────────────────────────────────

# A span is a GenAI/LLM call if any of these attribute keys (or prefixes) appear.
_GENAI_MARKERS = ("gen_ai.system", "gen_ai.request.model", "llm.request.type",
                  "ai.model.id", "ai.model.provider")


def _first(attrs: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in attrs and attrs[k] not in (None, ""):
            return attrs[k]
    return None


def _is_genai_span(attrs: dict[str, Any]) -> bool:
    if any(k in attrs for k in _GENAI_MARKERS):
        return True
    # OpenLLMetry indexes prompt/completion content by position
    return any(k.startswith(("gen_ai.prompt.", "gen_ai.completion.", "ai.prompt")) for k in attrs)


def _extract_indexed_messages(attrs: dict[str, Any], prefix: str) -> list[CanonicalMessage]:
    """OpenLLMetry flattens messages as gen_ai.prompt.0.role / gen_ai.prompt.0.content.
    Collect them back into ordered messages."""
    by_index: dict[int, dict[str, str]] = {}
    plen = len(prefix)
    for key, val in attrs.items():
        if not key.startswith(prefix):
            continue
        rest = key[plen:]
        idx_str, _, field = rest.partition(".")
        if not idx_str.isdigit() or field not in ("role", "content"):
            continue
        by_index.setdefault(int(idx_str), {})[field] = str(val)
    messages = []
    for i in sorted(by_index):
        entry = by_index[i]
        messages.append(CanonicalMessage(
            role=entry.get("role", "user"),
            content=entry.get("content", ""),
        ))
    return messages


def _extract_content(span: NormalizedSpan) -> tuple[str | None, list[CanonicalMessage], str | None]:
    """Return (system, messages, output_text) from whichever content shape the
    emitter used: span events (newer gen_ai), indexed attributes (OpenLLMetry),
    or a JSON messages blob (Vercel)."""
    attrs = span["attributes"]
    messages: list[CanonicalMessage] = []
    output_text: str | None = None

    # 1. Native gen_ai content events
    for ev in span["events"]:
        name = ev["name"]
        ea = ev["attributes"]
        if name in ("gen_ai.system.message", "gen_ai.user.message", "gen_ai.assistant.message"):
            role = name.split(".")[1]
            content = ea.get("content", "")
            messages.append(CanonicalMessage(role=role, content=str(content)))
        elif name == "gen_ai.content.prompt":
            blob = ea.get("gen_ai.prompt") or ea.get("content")
            messages.extend(_messages_from_blob(blob))
        elif name in ("gen_ai.choice", "gen_ai.content.completion"):
            output_text = _text_from_completion(ea)

    # 2. OpenLLMetry indexed attributes
    if not messages:
        messages = _extract_indexed_messages(attrs, "gen_ai.prompt.")
    if output_text is None:
        comp = _extract_indexed_messages(attrs, "gen_ai.completion.")
        if comp:
            output_text = comp[0].content

    # 3. Vercel AI SDK — JSON blobs
    if not messages:
        blob = _first(attrs, "ai.prompt.messages", "ai.prompt")
        messages.extend(_messages_from_blob(blob))
    if output_text is None:
        output_text = _first(attrs, "ai.response.text", "gen_ai.completion")

    # Hoist a leading system message into the dedicated field
    system: str | None = None
    if messages and messages[0].role == "system":
        system = messages[0].content
        messages = messages[1:]

    return system, messages, (str(output_text) if output_text is not None else None)


def _messages_from_blob(blob: Any) -> list[CanonicalMessage]:
    """Parse a messages array that may arrive as a JSON string or a list."""
    if blob is None:
        return []
    if isinstance(blob, str):
        try:
            blob = json.loads(blob)
        except (ValueError, TypeError):
            return [CanonicalMessage(role="user", content=blob)]
    out = []
    for m in blob if isinstance(blob, list) else []:
        if isinstance(m, dict):
            content = m.get("content", "")
            out.append(CanonicalMessage(
                role=str(m.get("role", "user")),
                content=content if isinstance(content, str) else str(content),
            ))
    return out


def _text_from_completion(ea: dict[str, Any]) -> str | None:
    for k in ("content", "message", "gen_ai.completion"):
        if ea.get(k):
            v = ea[k]
            if isinstance(v, dict):
                return str(v.get("content", v))
            return str(v)
    return None


def span_to_canonical(span: NormalizedSpan) -> CanonicalTrace | None:
    """Map one GenAI span to a CanonicalTrace, or None if it isn't a GenAI span."""
    attrs = span["attributes"]
    if not _is_genai_span(attrs):
        return None

    model = _first(attrs, "gen_ai.request.model", "ai.model.id", "llm.request.model") or "unknown"
    response_model = _first(attrs, "gen_ai.response.model", "ai.response.model")

    input_tokens = _first(attrs,
        "gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens", "ai.usage.promptTokens")
    output_tokens = _first(attrs,
        "gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens", "ai.usage.completionTokens")
    total_tokens = _first(attrs, "gen_ai.usage.total_tokens", "llm.usage.total_tokens")
    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = (input_tokens or 0) + (output_tokens or 0)

    system, messages, output_text = _extract_content(span)

    # Reconstruct the same prompt shape the cernova adapter produces, so
    # downstream fingerprinting/format checks are format-agnostic.
    raw_prompt = json.dumps({
        "system": system,
        "messages": [m.model_dump() for m in messages],
    })

    latency_ms = max(0, (span["end_nano"] - span["start_nano"]) // 1_000_000)
    status_success = span["status_code"] != 2  # 2 == ERROR

    step_name = (
        _first(attrs, "gen_ai.operation.name", "ai.operationId")
        or span["name"]
        or "llm-call"
    )

    return CanonicalTrace(
        run_id=span["trace_id"] or span["span_id"],
        step_name=str(step_name),
        span_id=span["span_id"] or None,
        parent_span_id=span["parent_span_id"],
        model=str(model),
        response_model=str(response_model) if response_model else None,
        raw_prompt=raw_prompt,
        prompt_parsed=True,
        system=system,
        messages=messages,
        input_tokens=int(input_tokens) if input_tokens is not None else None,
        output_tokens=int(output_tokens) if output_tokens is not None else None,
        total_tokens=int(total_tokens) if total_tokens is not None else None,
        latency_ms=int(latency_ms),
        cost=None,  # OTel spans rarely carry cost — see module docstring
        status_success=status_success,
        error=_first(attrs, "error.message", "exception.message") if not status_success else None,
        output_text=output_text,
        source="otel",
    )


def otlp_json_to_canonical(payload: dict[str, Any]) -> list[CanonicalTrace]:
    """Full path: OTLP/JSON payload → list of CanonicalTrace (GenAI spans only)."""
    out = []
    for span in otlp_json_to_spans(payload):
        trace = span_to_canonical(span)
        if trace is not None:
            out.append(trace)
    return out
