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
    type: str = "anomaly"          # anomaly | systemic_incident | test | future: contract_proposed | drift
    event_id: str
    timestamp: str                 # ISO 8601, UTC
    project_id: str
    project_name: str
    run_id: str = ""               # a single call for 'anomaly'; empty for aggregate 'systemic_incident'
    step_name: str | None = None
    model: str | None = None
    total_score: float = 0.0
    threshold: float = 0.0
    triggered: bool = False
    codes: list[WebhookCode] = Field(default_factory=list)

    # Populated for type == 'systemic_incident' only: how many distinct runs hit
    # the same condition, and over what window. None for per-call events.
    run_count: int | None = None
    window_minutes: int | None = None
