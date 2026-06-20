from datetime import datetime

from pydantic import BaseModel, Field


class IngestPayload(BaseModel):
    run_id: str
    step_name: str
    model: str
    provider: str = "anthropic"
    prompt: str = Field(..., description="Exact user prompt string")
    system_prompt: str | None = None
    full_prompt: str | None = None
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


class IngestResponse(BaseModel):
    trace_id: str


class TraceRecord(BaseModel):
    id: str
    run_id: str
    step_name: str | None = None
    model: str | None = None
    prompt: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: int | None = None
    cost: float | None = None
    status: str
    error: str | None = None
    output_code: str | None = None
    created_at: datetime
