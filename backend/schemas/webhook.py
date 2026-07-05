"""Outbound webhook event — the public payload contract.

This is what Cernova POSTs to a project's webhook_url when an anomaly fires. It
is versioned (schema_version) because receivers depend on its shape — the same
envelope a read API and future event types (contract_proposed, drift) will reuse.
Keep it additive: new fields are fine, renames/removals are a version bump.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

WEBHOOK_SCHEMA_VERSION = 1


class WebhookCode(BaseModel):
    code: int
    name: str
    penalty: float


class WebhookEvent(BaseModel):
    schema_version: int = WEBHOOK_SCHEMA_VERSION
    type: str = "anomaly"          # future: contract_proposed | drift
    event_id: str
    timestamp: str                 # ISO 8601, UTC
    project_id: str
    project_name: str
    run_id: str
    step_name: str | None = None
    model: str | None = None
    total_score: float = 0.0
    threshold: float = 0.0
    triggered: bool = False
    codes: list[WebhookCode] = Field(default_factory=list)
