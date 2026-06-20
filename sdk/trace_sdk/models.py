from pydantic import BaseModel, Field


class TraceClientConfig(BaseModel):
    api_key: str
    model: str
    ingest_url: str = "http://localhost:8000/ingest"
    run_id: str | None = None
    system_prompt: str | None = None
    max_tokens: int | None = None


class GenerateOptions(BaseModel):
    step_name: str = "generate"
    model: str | None = None
    system_prompt: str | None = None
    max_tokens: int | None = None


class GenerateResponse(BaseModel):
    code: str
    trace_id: str
    model: str
    provider: str
    prompt: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: int
    cost_usd: float | None = None
    context_limit: int | None = None
    context_utilization: float | None = None
    status: str = "ok"
    error: str | None = None
    finish_reason: str | None = None


class IngestPayload(BaseModel):
    run_id: str
    step_name: str
    model: str
    provider: str = "anthropic"
    prompt: str = Field(..., description="Exact user prompt string")
    system_prompt: str | None = None
    full_prompt: str
    latency_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None
    context_limit: int | None = None
    context_utilization: float | None = None
    status: str = "ok"
    error: str | None = None
    finish_reason: str | None = None
    code: str | None = None
