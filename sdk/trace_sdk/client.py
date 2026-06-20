from __future__ import annotations

import time
import uuid

from .context_limits import compute_utilization, get_context_limit
from .emitter import emit_trace
from .models import (
    GenerateOptions,
    GenerateResponse,
    IngestPayload,
    TraceClientConfig,
)
from .pricing import compute_cost
from .providers import AnthropicProvider


def _full_prompt_text(system_prompt: str | None, user_input: str) -> str:
    if system_prompt:
        return f"{system_prompt}\n{user_input}"
    return user_input


class TraceClient:
    @classmethod
    def create(cls, config: TraceClientConfig) -> TraceClient:
        return cls(config)

    def __init__(self, config: TraceClientConfig) -> None:
        self.config = config
        self._provider = AnthropicProvider(config.api_key)
        self.provider_name = self._provider.name
        self._run_id = config.run_id or str(uuid.uuid4())

    def generate(
        self,
        user_input: str,
        options: GenerateOptions | None = None,
    ) -> GenerateResponse:
        opts = options or GenerateOptions()
        model = opts.model or self.config.model
        system_prompt = opts.system_prompt or self.config.system_prompt
        max_tokens = opts.max_tokens or self.config.max_tokens
        full_prompt = _full_prompt_text(system_prompt, user_input)
        context_limit = get_context_limit(model)

        start = time.perf_counter()
        try:
            result = self._provider.generate(
                model=model,
                user_input=user_input,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            trace_id = emit_trace(
                self.config.ingest_url,
                IngestPayload(
                    run_id=self._run_id,
                    step_name=opts.step_name,
                    model=model,
                    provider=self.provider_name,
                    prompt=user_input,
                    system_prompt=system_prompt,
                    full_prompt=full_prompt,
                    latency_ms=latency_ms,
                    context_limit=context_limit,
                    status="error",
                    error=str(exc),
                ),
            )
            return GenerateResponse(
                code="",
                trace_id=trace_id,
                model=model,
                provider=self.provider_name,
                prompt=user_input,
                latency_ms=latency_ms,
                context_limit=context_limit,
                status="error",
                error=str(exc),
            )

        latency_ms = int((time.perf_counter() - start) * 1000)
        context_utilization = compute_utilization(result.total_tokens, context_limit)
        cost_usd = compute_cost(model, result.input_tokens, result.output_tokens)

        trace_id = emit_trace(
            self.config.ingest_url,
            IngestPayload(
                run_id=self._run_id,
                step_name=opts.step_name,
                model=model,
                provider=self.provider_name,
                prompt=user_input,
                system_prompt=system_prompt,
                full_prompt=full_prompt,
                latency_ms=latency_ms,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                reasoning_tokens=result.reasoning_tokens,
                total_tokens=result.total_tokens,
                cost_usd=cost_usd,
                context_limit=context_limit,
                context_utilization=context_utilization,
                status="ok",
                error=None,
                finish_reason=result.finish_reason,
                code=result.code,
            ),
        )

        return GenerateResponse(
            code=result.code,
            trace_id=trace_id,
            model=model,
            provider=self.provider_name,
            prompt=user_input,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            reasoning_tokens=result.reasoning_tokens,
            total_tokens=result.total_tokens,
            latency_ms=latency_ms,
            cost_usd=cost_usd,
            context_limit=context_limit,
            context_utilization=context_utilization,
            status="ok",
            error=None,
            finish_reason=result.finish_reason,
        )
