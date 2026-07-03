"""Canonical internal trace model.

Every ingest source (Cernova SDKs, OTel, imports) is mapped into CanonicalTrace
by an adapter in backend/adapters/ before touching the pipeline. The engine —
fingerprinter, anomaly layers, baselines — consumes only this shape and never
sees wire-format quirks.
"""

from pydantic import BaseModel, Field

# Kernel truncation limits — the fingerprint embedding only needs the head of
# the instruction, and capping keeps embedding time flat on giant prompts.
_KERNEL_SYSTEM_CHARS = 500
_KERNEL_FALLBACK_CHARS = 200


class CanonicalMessage(BaseModel):
    role: str
    content: str


class CanonicalTrace(BaseModel):
    # Identity
    run_id: str
    step_name: str
    step_index: int | None = None
    project_id: str | None = None
    span_id: str | None = None
    parent_span_id: str | None = None

    # Model
    model: str
    response_model: str | None = None  # model the provider actually served, when reported

    # Prompt — structured. raw_prompt is the original wire string and is what
    # gets persisted to CALLS.prompt; system/messages are the parsed view.
    raw_prompt: str
    prompt_parsed: bool = False  # False → raw_prompt was not structured JSON
    system: str | None = None
    messages: list[CanonicalMessage] = Field(default_factory=list)

    # Metrics
    input_tokens: int | None = None
    output_tokens: int | None = None
    reasoning_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: int
    cost: float | None = None

    # Outcome
    status_success: bool = True
    error: str | None = None
    output_text: str | None = None

    # Provenance
    source: str = "cernova-sdk"
    schema_version: int = 1
    commit_sha: str | None = None      # persisted once CALLS grows provenance columns
    prompt_version: str | None = None  # persisted once CALLS grows provenance columns

    def kernel(self) -> str:
        """The stable instruction part of the prompt — the step's semantic identity.

        System prompt when present; otherwise the first user message; otherwise
        the raw prompt. User messages vary per call, so the fallbacks use a
        shorter cap to limit noise in the embedding.
        """
        if self.system:
            return self.system[:_KERNEL_SYSTEM_CHARS]
        for msg in self.messages:
            if msg.role == "user":
                return msg.content[:_KERNEL_FALLBACK_CHARS]
        return self.raw_prompt[:_KERNEL_FALLBACK_CHARS]

    def instruction_text(self) -> str:
        """Readable instruction text (system + user messages) for L2/L3 format
        checks — keeps JSON wrapper keys out of contract detection. Falls back
        to the raw prompt when it wasn't structured JSON."""
        if not self.prompt_parsed:
            return self.raw_prompt
        parts = []
        if self.system:
            parts.append(self.system)
        parts.extend(msg.content for msg in self.messages if msg.role == "user")
        return "\n".join(parts)
