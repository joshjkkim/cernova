from pydantic import BaseModel, Field


class Evidence(BaseModel):
    """Why one condition fired — the values behind the code.

    Populated from the EvalHit the layers already produce. `observed` is the
    actual value ("3400", the error string); `expected` is what the rule wanted
    ("<= 240", the enum domain, the statistical fence description).

    `observed` is None whenever it would be model output text — see
    anomaly_service.redact_observed.
    """

    observed: object | None = None
    expected: object | None = None


class AnomalyInput(BaseModel):
    step_name: str
    run_id: str
    bad_scores: dict[str, int]                              # { "error_code": penalty_score }
    evidence: dict[str, Evidence] = Field(default_factory=dict)  # { "error_code": Evidence }


class AnomalyRecord(BaseModel):
    id: int
    step_name: str
    run_id: str
    project_id: str | None = None
    error_code: int
    penalty_score: int
    created_at: str
    observed: object | None = None
    expected: object | None = None
