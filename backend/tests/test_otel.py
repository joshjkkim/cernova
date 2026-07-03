"""Golden tests for the OTel adapter.

Payloads mirror what real emitters send over OTLP/JSON — OpenLLMetry (Traceloop)
with indexed prompt/completion attributes, and the Vercel AI SDK with its ai.*
namespace and JSON message blobs. These pin the attribute-vocabulary mapping so
adding an emitter never silently shifts an existing one's output.
"""

import json

from adapters.otel import (
    otlp_json_to_spans,
    span_to_canonical,
    otlp_json_to_canonical,
)


def _sv(s): return {"stringValue": s}
def _iv(i): return {"intValue": str(i)}


def attr(key, val):
    return {"key": key, "value": val}


# ── OpenLLMetry / Traceloop shape ──────────────────────────────────────────────

OPENLLMETRY_PAYLOAD = {
    "resourceSpans": [{
        "resource": {"attributes": [attr("service.name", _sv("my-app"))]},
        "scopeSpans": [{
            "scope": {"name": "opentelemetry.instrumentation.anthropic"},
            "spans": [{
                "traceId": "abc123trace",
                "spanId": "span001",
                "name": "anthropic.chat",
                "startTimeUnixNano": "1000000000",       # +1.00s
                "endTimeUnixNano": "1340000000",         # → 340ms
                "attributes": [
                    attr("gen_ai.system", _sv("anthropic")),
                    attr("gen_ai.request.model", _sv("claude-haiku-4-5-20251001")),
                    attr("gen_ai.response.model", _sv("claude-haiku-4-5-20251001")),
                    attr("gen_ai.usage.prompt_tokens", _iv(12)),
                    attr("gen_ai.usage.completion_tokens", _iv(4)),
                    attr("gen_ai.prompt.0.role", _sv("system")),
                    attr("gen_ai.prompt.0.content", _sv("Classify as: billing, technical, general.")),
                    attr("gen_ai.prompt.1.role", _sv("user")),
                    attr("gen_ai.prompt.1.content", _sv("My invoice is wrong")),
                    attr("gen_ai.completion.0.role", _sv("assistant")),
                    attr("gen_ai.completion.0.content", _sv("billing")),
                ],
                "status": {"code": 1},
            }],
        }],
    }],
}


def test_openllmetry_maps_to_canonical():
    traces = otlp_json_to_canonical(OPENLLMETRY_PAYLOAD)
    assert len(traces) == 1
    t = traces[0]
    assert t.source == "otel"
    assert t.run_id == "abc123trace"       # trace_id becomes run_id
    assert t.span_id == "span001"
    assert t.model == "claude-haiku-4-5-20251001"
    assert t.latency_ms == 340
    assert t.input_tokens == 12
    assert t.output_tokens == 4
    assert t.total_tokens == 16            # derived from prompt + completion
    assert t.status_success is True


def test_openllmetry_content_extraction():
    t = otlp_json_to_canonical(OPENLLMETRY_PAYLOAD)[0]
    # Leading system message hoisted into .system
    assert t.system == "Classify as: billing, technical, general."
    assert [(m.role, m.content) for m in t.messages] == [("user", "My invoice is wrong")]
    assert t.output_text == "billing"


def test_openllmetry_kernel_matches_system():
    # Fingerprinting must see the same kernel as the cernova SDK would produce
    t = otlp_json_to_canonical(OPENLLMETRY_PAYLOAD)[0]
    assert t.kernel() == "Classify as: billing, technical, general."
    assert t.instruction_text() == (
        "Classify as: billing, technical, general.\nMy invoice is wrong"
    )


# ── Vercel AI SDK shape ────────────────────────────────────────────────────────

VERCEL_PAYLOAD = {
    "resourceSpans": [{
        "resource": {"attributes": [attr("service.name", _sv("next-app"))]},
        "scopeSpans": [{
            "scope": {"name": "ai"},
            "spans": [{
                "traceId": "vercel-trace-9",
                "spanId": "spanA",
                "parentSpanId": "spanRoot",
                "name": "ai.generateText.doGenerate",
                "startTimeUnixNano": "5000000000",
                "endTimeUnixNano": "6250000000",         # → 1250ms
                "attributes": [
                    attr("ai.model.provider", _sv("openai")),
                    attr("ai.model.id", _sv("gpt-4o-mini")),
                    attr("ai.usage.promptTokens", _iv(30)),
                    attr("ai.usage.completionTokens", _iv(120)),
                    attr("ai.prompt.messages", _sv(json.dumps([
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": "Summarize this article."},
                    ]))),
                    attr("ai.response.text", _sv("Here is the summary.")),
                ],
                "status": {"code": 0},
            }],
        }],
    }],
}


def test_vercel_maps_to_canonical():
    t = otlp_json_to_canonical(VERCEL_PAYLOAD)[0]
    assert t.model == "gpt-4o-mini"
    assert t.parent_span_id == "spanRoot"
    assert t.latency_ms == 1250
    assert t.input_tokens == 30
    assert t.output_tokens == 120
    assert t.total_tokens == 150
    assert t.status_success is True        # code 0 (unset) is not an error


def test_vercel_json_blob_messages():
    t = otlp_json_to_canonical(VERCEL_PAYLOAD)[0]
    assert t.system == "You are a helpful assistant."
    assert [(m.role, m.content) for m in t.messages] == [("user", "Summarize this article.")]
    assert t.output_text == "Here is the summary."


# ── Filtering + edge cases ─────────────────────────────────────────────────────

def test_non_genai_spans_skipped():
    payload = {
        "resourceSpans": [{
            "resource": {"attributes": []},
            "scopeSpans": [{
                "spans": [
                    {  # an HTTP span — no gen_ai markers
                        "traceId": "t", "spanId": "s1", "name": "GET /api",
                        "startTimeUnixNano": "0", "endTimeUnixNano": "1000000",
                        "attributes": [attr("http.method", _sv("GET"))],
                        "status": {"code": 1},
                    },
                    {  # a real LLM span
                        "traceId": "t", "spanId": "s2", "name": "chat",
                        "startTimeUnixNano": "0", "endTimeUnixNano": "2000000",
                        "attributes": [
                            attr("gen_ai.system", _sv("anthropic")),
                            attr("gen_ai.request.model", _sv("claude-haiku-4-5-20251001")),
                        ],
                        "status": {"code": 1},
                    },
                ],
            }],
        }],
    }
    traces = otlp_json_to_canonical(payload)
    assert len(traces) == 1
    assert traces[0].span_id == "s2"


def test_error_status_sets_failure():
    payload = {
        "resourceSpans": [{
            "resource": {"attributes": []},
            "scopeSpans": [{
                "spans": [{
                    "traceId": "t", "spanId": "s", "name": "chat",
                    "startTimeUnixNano": "0", "endTimeUnixNano": "1000000",
                    "attributes": [
                        attr("gen_ai.system", _sv("anthropic")),
                        attr("gen_ai.request.model", _sv("claude-haiku-4-5-20251001")),
                        attr("error.message", _sv("rate_limit_exceeded")),
                    ],
                    "status": {"code": 2},   # ERROR
                }],
            }],
        }],
    }
    t = otlp_json_to_canonical(payload)[0]
    assert t.status_success is False
    assert t.error == "rate_limit_exceeded"


def test_anyvalue_unwrapping():
    span = otlp_json_to_spans(OPENLLMETRY_PAYLOAD)[0]
    assert span["attributes"]["gen_ai.system"] == "anthropic"       # stringValue
    assert span["attributes"]["gen_ai.usage.prompt_tokens"] == 12   # intValue → int
    assert span["resource"]["service.name"] == "my-app"


def test_empty_payload():
    assert otlp_json_to_canonical({}) == []
    assert otlp_json_to_canonical({"resourceSpans": []}) == []
