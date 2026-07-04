"""Learned output contracts.

A contract is the structural regularity of a step's outputs, *induced* from that
step's own history rather than hand-written. It attaches to a step_profile — the
same unit that already holds the anomaly baseline — so identity, baseline, and
contract travel together.

The representation is frequency-annotated (every rule carries how often it held),
which is richer than plain JSON Schema: it lets the checker treat a never-before-
seen enum value as a *candidate evolution* rather than a hard failure. A
LearnedContract can be rendered down to standard JSON Schema for enforcement or
display (see CONTRACT_SYSTEM.md) — the annotations are what plain JSON Schema
can't carry.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# JSON value types, named as they appear in JSON Schema.
JsonType = str  # "object" | "array" | "string" | "number" | "boolean" | "null"


class KeySpec(BaseModel):
    """What was observed about one top-level key across a step's output history."""
    name: str
    presence: float                      # fraction of JSON outputs containing this key
    types: list[JsonType]                # every JSON type seen for this key
    enum_values: list[str] | None = None # small, stable string domain, if any
    num_min: float | None = None         # observed numeric range (soft signal)
    num_max: float | None = None


class LearnedContract(BaseModel):
    """Induced structural contract for a step profile."""
    format: str                          # "json" | "text" | "mixed"
    json_rate: float                     # fraction of outputs that parsed as JSON
    sample_count: int
    required_keys: list[str] = Field(default_factory=list)
    keys: dict[str, KeySpec] = Field(default_factory=dict)

    # Lifecycle: observing (too little history) → proposed (learned, awaiting a
    # human OK) → enforced (violations count). See design doc.
    status: str = "proposed"


class ContractViolation(BaseModel):
    code: str          # format_not_json | missing_required_key | wrong_type | enum_new_value | out_of_range
    detail: str
    key: str | None = None
    severity: str = "hard"   # hard = contract breach; soft = candidate drift/evolution


class ContractCheckResult(BaseModel):
    passed: bool                         # False iff any hard violation
    violations: list[ContractViolation] = Field(default_factory=list)

    @property
    def soft_only(self) -> bool:
        return self.passed and bool(self.violations)
