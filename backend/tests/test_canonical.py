"""Golden tests for the cernova adapter and CanonicalTrace helpers.

These pin the wire-format → canonical mapping and the kernel/instruction
extraction that step fingerprinting and output_format checks depend on.
If one of these breaks, step identities shift and baselines silently reset —
change them only with intent.
"""

import json

import pytest

from adapters import to_canonical
from schemas.trace import IngestPayload
from services.fingerprinter import _derive_step_name


def make_payload(prompt: str, **overrides) -> IngestPayload:
    fields = {
        "step_name": "classify-intent",
        "model": "claude-haiku-4-5-20251001",
        "prompt": prompt,
        "input_tokens": 12,
        "output_tokens": 4,
        "total_tokens": 16,
        "latency_ms": 84,
        "cost": 0.000012,
        "status_success": True,
        "output_code": "billing",
        "run_id": "run-1",
        "step_index": 0,
        "project_id": "proj-1",
        "span_id": "span-1",
        "parent_span_id": None,
    }
    fields.update(overrides)
    return IngestPayload(**fields)


TS_PROMPT = json.dumps({
    "system": "Classify the message as: billing, technical, general.",
    "messages": [{"role": "user", "content": "My invoice is wrong"}],
})

LANGCHAIN_PROMPT = json.dumps({
    "messages": [
        {"role": "system", "content": "You are a support agent. Be concise."},
        {"role": "user", "content": "How do I reset my password?"},
        {"role": "assistant", "content": "Go to settings."},
    ],
})


# ── Field mapping ──────────────────────────────────────────────────────────────

def test_field_mapping():
    trace = to_canonical(make_payload(TS_PROMPT))
    assert trace.run_id == "run-1"
    assert trace.step_name == "classify-intent"
    assert trace.model == "claude-haiku-4-5-20251001"
    assert trace.raw_prompt == TS_PROMPT          # original wire string preserved
    assert trace.output_text == "billing"          # output_code → output_text
    assert trace.latency_ms == 84
    assert trace.cost == 0.000012
    assert trace.source == "cernova-sdk"
    assert trace.schema_version == 1


def test_schema_version_passthrough():
    trace = to_canonical(make_payload(TS_PROMPT, schema_version=2))
    assert trace.schema_version == 2


# ── TS SDK prompt shape ────────────────────────────────────────────────────────

def test_ts_shape():
    trace = to_canonical(make_payload(TS_PROMPT))
    assert trace.prompt_parsed is True
    assert trace.system == "Classify the message as: billing, technical, general."
    assert [(m.role, m.content) for m in trace.messages] == [
        ("user", "My invoice is wrong"),
    ]


def test_ts_kernel_is_system():
    trace = to_canonical(make_payload(TS_PROMPT))
    assert trace.kernel() == "Classify the message as: billing, technical, general."


def test_ts_instruction_text_joins_system_and_user():
    trace = to_canonical(make_payload(TS_PROMPT))
    assert trace.instruction_text() == (
        "Classify the message as: billing, technical, general.\nMy invoice is wrong"
    )


# ── LangChain prompt shape ─────────────────────────────────────────────────────

def test_langchain_system_message_hoisted():
    trace = to_canonical(make_payload(LANGCHAIN_PROMPT))
    assert trace.prompt_parsed is True
    assert trace.system == "You are a support agent. Be concise."
    assert [(m.role, m.content) for m in trace.messages] == [
        ("user", "How do I reset my password?"),
        ("assistant", "Go to settings."),
    ]


def test_langchain_kernel_is_system():
    trace = to_canonical(make_payload(LANGCHAIN_PROMPT))
    assert trace.kernel() == "You are a support agent. Be concise."


def test_langchain_instruction_excludes_assistant():
    trace = to_canonical(make_payload(LANGCHAIN_PROMPT))
    assert trace.instruction_text() == (
        "You are a support agent. Be concise.\nHow do I reset my password?"
    )


def test_non_string_content_stringified():
    # LangChain content blocks arrive as lists — old code str()-ified them
    prompt = json.dumps({"messages": [
        {"role": "system", "content": [{"type": "text", "text": "Extract entities."}]},
    ]})
    trace = to_canonical(make_payload(prompt))
    assert trace.system == "[{'type': 'text', 'text': 'Extract entities.'}]"


# ── Kernel fallbacks and truncation ────────────────────────────────────────────

def test_kernel_falls_back_to_first_user_message():
    prompt = json.dumps({"messages": [
        {"role": "assistant", "content": "hi"},
        {"role": "user", "content": "u" * 300},
    ]})
    trace = to_canonical(make_payload(prompt))
    assert trace.system is None
    assert trace.kernel() == "u" * 200  # user-message fallback caps at 200


def test_kernel_system_truncated_at_500():
    prompt = json.dumps({"system": "s" * 600, "messages": []})
    trace = to_canonical(make_payload(prompt))
    assert trace.kernel() == "s" * 500


def test_unparseable_prompt_falls_back_to_raw():
    raw = "just a plain prompt string " + "x" * 300
    trace = to_canonical(make_payload(raw))
    assert trace.prompt_parsed is False
    assert trace.system is None
    assert trace.messages == []
    assert trace.kernel() == raw[:200]
    assert trace.instruction_text() == raw  # output_format sees the raw string untruncated


def test_json_but_not_dict_treated_as_raw():
    raw = json.dumps(["not", "a", "dict"])
    trace = to_canonical(make_payload(raw))
    assert trace.prompt_parsed is False
    assert trace.kernel() == raw[:200]


def test_dict_without_messages_key():
    # Kernel still uses system; instruction falls back to raw (parity with the
    # pre-adapter behavior, where output_format extraction required a "messages" key).
    raw = json.dumps({"system": "Summarize the document."})
    trace = to_canonical(make_payload(raw))
    assert trace.prompt_parsed is False
    assert trace.kernel() == "Summarize the document."
    assert trace.instruction_text() == raw


def test_malformed_message_entries_skipped():
    prompt = json.dumps({"system": "Do the thing.", "messages": [
        "not-a-dict",
        {"role": "user", "content": "ok"},
    ]})
    trace = to_canonical(make_payload(prompt))
    assert [(m.role, m.content) for m in trace.messages] == [("user", "ok")]


# ── Call-site provenance ───────────────────────────────────────────────────────

def test_call_site_provenance_flows_through():
    trace = to_canonical(make_payload(
        TS_PROMPT,
        code_filepath="sample-app/chatbot.ts",
        code_lineno=42,
        code_function="classifyIntent",
        commit_sha="deadbeef1234",
    ))
    assert trace.code_filepath == "sample-app/chatbot.ts"
    assert trace.code_lineno == 42
    assert trace.code_function == "classifyIntent"
    assert trace.commit_sha == "deadbeef1234"


def test_call_site_provenance_absent_is_none():
    # Older SDKs (pre-0.1.6) don't send these — must default to None, not error.
    trace = to_canonical(make_payload(TS_PROMPT))
    assert trace.code_filepath is None
    assert trace.code_lineno is None
    assert trace.code_function is None
    assert trace.commit_sha is None


# ── Step-name derivation ───────────────────────────────────────────────────────

def test_derive_step_name_from_system():
    assert _derive_step_name("Classify the incoming message!") == "classify-the-incoming-message"


def test_derive_step_name_none_without_system():
    assert _derive_step_name(None) is None
    assert _derive_step_name("") is None
