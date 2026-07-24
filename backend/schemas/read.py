"""Public Read API contracts — the "data out" half of the platform.

The outbound webhook pushes one anomaly event when it fires; the Read API lets a
user *pull* their scored traces and detected anomalies on demand (dashboards,
notebooks, exports, their own automation). Same posture as the webhook payload:
versioned and additive — new fields are fine, renames/removals are a version bump.

These are deliberately a clean public projection of the internal rows, not the
raw DB shape: status is a string, ids are strings, and large/sensitive fields
(prompt, raw output) are omitted from list responses.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

READ_SCHEMA_VERSION = 1


class TraceCall(BaseModel):
    """One scored LLM call, as exposed publicly."""
    id: str
    run_id: str | None = None
    step_name: str | None = None
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: int | None = None
    cost: float | None = None
    status: str = "unknown"          # "success" | "error" | "unknown"
    error: str | None = None
    anomalous: bool = False          # flagged into an anomaly baseline exclusion
    step_profile_id: str | None = None
    source: str | None = None
    created_at: str | None = None

    # Call-site provenance — WHERE in the user's code this call was made. Lets an
    # agent jump to the source instead of grepping. NULL for OTel imports and
    # pre-0.1.6 SDKs; commit_sha is what anchors the line number to a revision.
    code_filepath: str | None = None
    code_lineno: int | None = None
    code_function: str | None = None
    commit_sha: str | None = None

    @classmethod
    def from_row(cls, row: dict) -> "TraceCall":
        ss = row.get("status_success")
        status = "success" if ss is True else "error" if ss is False else "unknown"
        return cls(
            id=str(row.get("id")),
            run_id=row.get("run_id"),
            step_name=row.get("step_name"),
            model=row.get("model"),
            input_tokens=row.get("input_tokens"),
            output_tokens=row.get("output_tokens"),
            total_tokens=row.get("total_tokens"),
            latency_ms=row.get("latency_ms"),
            cost=row.get("cost"),
            status=status,
            error=row.get("error"),
            anomalous=bool(row.get("anomaly_triggered")),
            step_profile_id=row.get("step_profile_id"),
            source=row.get("source"),
            created_at=row.get("created_at"),
            code_filepath=row.get("code_filepath"),
            code_lineno=row.get("code_lineno"),
            code_function=row.get("code_function"),
            commit_sha=row.get("commit_sha"),
        )


class CallPage(BaseModel):
    schema_version: int = READ_SCHEMA_VERSION
    object: str = "list"
    data: list[TraceCall] = Field(default_factory=list)
    has_more: bool = False
    next_cursor: str | None = None   # pass back as ?cursor= to fetch the next page


class AnomalyCode(BaseModel):
    code: int
    name: str
    penalty: float
    # Why it fired. `expected` is the rule ("<= 240", the enum domain, the
    # statistical fence); `observed` is the actual value. Both None for codes
    # recorded before the evidence migration, and `observed` is deliberately
    # never stored for output_format codes (it would be model output text).
    observed: object | None = None
    expected: object | None = None


class AnomalyStep(BaseModel):
    step_name: str
    score: float
    codes: list[AnomalyCode] = Field(default_factory=list)


class AnomalyRunSummary(BaseModel):
    """All anomaly conditions for one run, grouped like the dashboard shows them."""
    run_id: str
    total_score: float = 0.0
    level: str = "warning"           # "critical" (>= threshold) | "warning"
    triggered: bool = False
    steps: list[AnomalyStep] = Field(default_factory=list)
    latest_at: str | None = None


class AnomalyPage(BaseModel):
    schema_version: int = READ_SCHEMA_VERSION
    object: str = "list"
    data: list[AnomalyRunSummary] = Field(default_factory=list)
    has_more: bool = False
    next_cursor: str | None = None


class RunDetail(BaseModel):
    schema_version: int = READ_SCHEMA_VERSION
    run_id: str
    calls: list[TraceCall] = Field(default_factory=list)
    anomaly: AnomalyRunSummary | None = None
    cost_total: float = 0.0
    tokens_total: int = 0
    latency_total_ms: int = 0
