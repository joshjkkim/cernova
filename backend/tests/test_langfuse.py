"""Golden tests for the Langfuse import adapter.

Payloads mirror what the Langfuse public API returns for observations across
versions (new usage {input,output,total} vs old {promptTokens,...}; input as a
message list, a wrapper, or a bare string). These pin the mapping so imports
seed baselines from real history without silently mangling a field.
"""

from adapters.langfuse import (
    observation_to_canonical,
    observations_to_canonical,
)


def _generation(**overrides):
    obs = {
        "id": "obs_1",
        "traceId": "trace_1",
        "type": "GENERATION",
        "name": "extract-fields",
        "startTime": "2026-01-01T10:00:00.000Z",
        "endTime": "2026-01-01T10:00:01.500Z",   # → 1500ms
        "model": "claude-haiku-4-5",
        "input": [
            {"role": "system", "content": "Extract name and age as JSON."},
            {"role": "user", "content": "Bob is 30."},
        ],
        "output": {"role": "assistant", "content": '{"name": "Bob", "age": 30}'},
        "usage": {"input": 20, "output": 12, "total": 32, "unit": "TOKENS"},
        "calculatedTotalCost": 0.0006,
        "level": "DEFAULT",
        "promptVersion": 3,
    }
    obs.update(overrides)
    return obs


def test_generation_maps_all_fields():
    t = observation_to_canonical(_generation())
    assert t is not None
    assert t.run_id == "trace_1"          # trace groups the run
    assert t.external_id == "obs_1"       # observation id → idempotency key
    assert t.span_id == "obs_1"
    assert t.step_name == "extract-fields"
    assert t.model == "claude-haiku-4-5"
    assert t.source == "langfuse"
    assert t.timestamp == "2026-01-01T10:00:00.000Z"   # backdated
    assert t.latency_ms == 1500
    assert t.input_tokens == 20 and t.output_tokens == 12 and t.total_tokens == 32
    assert t.cost == 0.0006
    assert t.status_success is True
    assert t.prompt_version == "3"


def test_system_message_is_hoisted():
    t = observation_to_canonical(_generation())
    assert t.system == "Extract name and age as JSON."
    # Only the user message remains in messages.
    assert [m.role for m in t.messages] == ["user"]
    assert t.output_text == '{"name": "Bob", "age": 30}'


def test_non_generation_returns_none():
    assert observation_to_canonical(_generation(type="SPAN")) is None
    assert observation_to_canonical({"id": "x", "type": "EVENT"}) is None


def test_old_usage_shape():
    obs = _generation(usage={"promptTokens": 7, "completionTokens": 5, "totalTokens": 12})
    t = observation_to_canonical(obs)
    assert (t.input_tokens, t.output_tokens, t.total_tokens) == (7, 5, 12)


def test_total_tokens_computed_when_missing():
    obs = _generation(usage={"input": 10, "output": 4})
    t = observation_to_canonical(obs)
    assert t.total_tokens == 14


def test_zero_tokens_preserved_not_dropped():
    # A legitimate 0 must survive — `a or b` would wrongly skip it.
    obs = _generation(usage={"input": 0, "output": 5, "total": 5})
    t = observation_to_canonical(obs)
    assert t.input_tokens == 0


def test_error_level_sets_failure():
    obs = _generation(level="ERROR", statusMessage="rate limited")
    t = observation_to_canonical(obs)
    assert t.status_success is False
    assert t.error == "rate limited"


def test_string_input_becomes_user_message():
    t = observation_to_canonical(_generation(input="just a raw prompt"))
    assert t.system is None
    assert [(m.role, m.content) for m in t.messages] == [("user", "just a raw prompt")]


def test_messages_wrapper_shape():
    obs = _generation(input={"messages": [{"role": "user", "content": "hi"}]})
    t = observation_to_canonical(obs)
    assert [(m.role, m.content) for m in t.messages] == [("user", "hi")]


def test_output_as_bare_string():
    t = observation_to_canonical(_generation(output="plain text answer"))
    assert t.output_text == "plain text answer"


def test_cost_falls_back_to_input_plus_output():
    obs = _generation(calculatedTotalCost=None, calculatedInputCost=0.0001, calculatedOutputCost=0.0002)
    t = observation_to_canonical(obs)
    assert abs(t.cost - 0.0003) < 1e-9


def test_batch_filters_non_generations():
    page = [_generation(id="a"), {"id": "b", "type": "SPAN"}, _generation(id="c")]
    traces = observations_to_canonical(page)
    assert [t.external_id for t in traces] == ["a", "c"]


def test_unparseable_time_yields_zero_latency():
    t = observation_to_canonical(_generation(startTime=None, endTime=None))
    assert t.latency_ms == 0
    assert t.timestamp is None
