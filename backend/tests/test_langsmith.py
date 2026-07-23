"""Golden tests for the LangSmith import adapter.

Payloads mirror what the LangSmith /runs/query API returns for `llm` runs across
LangChain versions: inputs as serialized constructor messages, the older dumpd
{type,data} form, plain {role,content}, and {prompts:[...]}; tokens at the run
top level vs nested in outputs.llm_output; model name in metadata vs invocation
params. These pin the mapping so imports seed baselines from real history without
silently mangling a field.
"""

from adapters.langsmith import run_to_canonical, runs_to_canonical


def _lc_msg(cls, content):
    """A LangChain-serialized constructor message, as LangSmith stores it."""
    return {
        "lc": 1, "type": "constructor",
        "id": ["langchain", "schema", "messages", cls],
        "kwargs": {"content": content},
    }


def _run(**overrides):
    run = {
        "id": "run_1",
        "trace_id": "trace_1",
        "parent_run_id": "trace_1",
        "run_type": "llm",
        "name": "extract-fields",
        "start_time": "2026-01-01T10:00:00.000000",
        "end_time": "2026-01-01T10:00:01.500000",   # → 1500ms
        "inputs": {"messages": [[
            _lc_msg("SystemMessage", "Extract name and age as JSON."),
            _lc_msg("HumanMessage", "Bob is 30."),
        ]]},
        "outputs": {"generations": [[{
            "text": '{"name": "Bob", "age": 30}',
            "message": _lc_msg("AIMessage", '{"name": "Bob", "age": 30}'),
        }]]},
        "prompt_tokens": 20,
        "completion_tokens": 12,
        "total_tokens": 32,
        "total_cost": 0.0006,
        "error": None,
        "extra": {"metadata": {"ls_model_name": "claude-haiku-4-5"}},
    }
    run.update(overrides)
    return run


def test_run_maps_all_fields():
    t = run_to_canonical(_run())
    assert t is not None
    assert t.run_id == "trace_1"          # trace groups the run
    assert t.external_id == "run_1"       # run id → idempotency key
    assert t.span_id == "run_1"
    assert t.parent_span_id == "trace_1"
    assert t.step_name == "extract-fields"
    assert t.model == "claude-haiku-4-5"
    assert t.source == "langsmith"
    assert t.timestamp == "2026-01-01T10:00:00.000000"   # backdated
    assert t.latency_ms == 1500
    assert t.input_tokens == 20 and t.output_tokens == 12 and t.total_tokens == 32
    assert t.cost == 0.0006
    assert t.status_success is True


def test_system_message_is_hoisted():
    t = run_to_canonical(_run())
    assert t.system == "Extract name and age as JSON."
    assert [m.role for m in t.messages] == ["user"]
    assert t.output_text == '{"name": "Bob", "age": 30}'


def test_non_llm_run_returns_none():
    assert run_to_canonical(_run(run_type="chain")) is None
    assert run_to_canonical({"id": "x", "run_type": "tool"}) is None
    assert run_to_canonical({"id": "x", "run_type": "retriever"}) is None


def test_dumpd_message_form():
    # Older LangChain dump: {"type": "human", "data": {"content": ...}}.
    run = _run(inputs={"messages": [[
        {"type": "system", "data": {"content": "You summarize."}},
        {"type": "human", "data": {"content": "Summarize this."}},
    ]]})
    t = run_to_canonical(run)
    assert t.system == "You summarize."
    assert [(m.role, m.content) for m in t.messages] == [("user", "Summarize this.")]


def test_plain_role_content_messages():
    run = _run(inputs={"messages": [{"role": "user", "content": "hi"}]})
    t = run_to_canonical(run)
    assert [(m.role, m.content) for m in t.messages] == [("user", "hi")]


def test_prompts_list_becomes_user_message():
    run = _run(inputs={"prompts": ["just a raw prompt"]})
    t = run_to_canonical(run)
    assert t.system is None
    assert [(m.role, m.content) for m in t.messages] == [("user", "just a raw prompt")]


def test_string_inputs_becomes_user_message():
    t = run_to_canonical(_run(inputs="raw string prompt"))
    assert [(m.role, m.content) for m in t.messages] == [("user", "raw string prompt")]


def test_output_from_message_when_text_absent():
    # Some generations carry only the message, no top-level text.
    run = _run(outputs={"generations": [[{
        "message": _lc_msg("AIMessage", "answer via message"),
    }]]})
    t = run_to_canonical(run)
    assert t.output_text == "answer via message"


def test_tokens_fall_back_to_llm_output_token_usage():
    run = _run(prompt_tokens=None, completion_tokens=None, total_tokens=None,
               outputs={"generations": [[{"text": "ok"}]],
                        "llm_output": {"token_usage": {
                            "prompt_tokens": 7, "completion_tokens": 5, "total_tokens": 12}}})
    t = run_to_canonical(run)
    assert (t.input_tokens, t.output_tokens, t.total_tokens) == (7, 5, 12)


def test_tokens_fall_back_to_usage_metadata():
    run = _run(prompt_tokens=None, completion_tokens=None, total_tokens=None,
               outputs={"usage_metadata": {"input_tokens": 3, "output_tokens": 4}})
    t = run_to_canonical(run)
    assert (t.input_tokens, t.output_tokens, t.total_tokens) == (3, 4, 7)


def test_zero_tokens_preserved_not_dropped():
    run = _run(prompt_tokens=0, completion_tokens=5, total_tokens=5)
    t = run_to_canonical(run)
    assert t.input_tokens == 0


def test_model_from_invocation_params_fallback():
    run = _run(extra={"invocation_params": {"model_name": "gpt-4o-mini"}})
    t = run_to_canonical(run)
    assert t.model == "gpt-4o-mini"


def test_model_from_serialized_fallback():
    run = _run(extra={}, serialized={"kwargs": {"model": "gpt-4-turbo"}})
    t = run_to_canonical(run)
    assert t.model == "gpt-4-turbo"


def test_missing_model_is_unknown():
    run = _run(extra={}, serialized={})
    t = run_to_canonical(run)
    assert t.model == "unknown"


def test_cost_falls_back_to_prompt_plus_completion():
    run = _run(total_cost=None, prompt_cost=0.0001, completion_cost=0.0002)
    t = run_to_canonical(run)
    assert abs(t.cost - 0.0003) < 1e-9


def test_error_sets_failure():
    run = _run(error="rate limited")
    t = run_to_canonical(run)
    assert t.status_success is False
    assert t.error == "rate limited"


def test_unparseable_time_yields_zero_latency():
    t = run_to_canonical(_run(start_time=None, end_time=None))
    assert t.latency_ms == 0
    assert t.timestamp is None


def test_batch_filters_non_llm_runs():
    page = [_run(id="a"), {"id": "b", "run_type": "chain"}, _run(id="c")]
    traces = runs_to_canonical(page)
    assert [t.external_id for t in traces] == ["a", "c"]
