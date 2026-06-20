from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProviderResult:
    """Normalized result from the LLM provider."""

    code: str
    input_tokens: int | None
    output_tokens: int | None
    reasoning_tokens: int | None
    total_tokens: int | None
    finish_reason: str | None


class AnthropicProvider:
    name = "anthropic"

    # Anthropic's Messages API requires max_tokens; use this when caller omits it.
    DEFAULT_MAX_TOKENS = 4096

    def __init__(self, api_key: str) -> None:
        from anthropic import Anthropic

        self._client = Anthropic(api_key=api_key)

    def generate(
        self,
        model: str,
        user_input: str,
        system_prompt: str | None,
        max_tokens: int | None,
    ) -> ProviderResult:
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens or self.DEFAULT_MAX_TOKENS,
            "messages": [{"role": "user", "content": user_input}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        response = self._client.messages.create(**kwargs)

        text_parts = [
            block.text for block in response.content if getattr(block, "type", None) == "text"
        ]
        code = "".join(text_parts)

        usage = response.usage
        input_tokens = usage.input_tokens if usage else None
        output_tokens = usage.output_tokens if usage else None
        total_tokens = None
        if input_tokens is not None and output_tokens is not None:
            total_tokens = input_tokens + output_tokens

        return ProviderResult(
            code=code,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=None,
            total_tokens=total_tokens,
            finish_reason=response.stop_reason,
        )
