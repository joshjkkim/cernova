"""Check one output against a learned contract.

Returns structured violations, not a bool + a print. Hard violations (wrong
format, missing required key, wrong type) mean the contract was breached. Soft
violations (a new enum value, a number outside the observed range) are *candidate
evolution* — the output may be legitimately new — so they're surfaced without
failing the call, and are exactly the signal that feeds drift detection.
"""

from __future__ import annotations

import json

from schemas.contract import ContractCheckResult, ContractViolation, LearnedContract
from services.contract_learner import _json_type


def check_output(output: str | None, contract: LearnedContract) -> ContractCheckResult:
    violations: list[ContractViolation] = []

    # Enforce nothing while still observing, or once a human has rejected it.
    if contract.status in ("observing", "rejected"):
        return ContractCheckResult(passed=True)

    if contract.format == "json":
        try:
            obj = json.loads(output) if output is not None else None
        except (ValueError, TypeError):
            obj = None
        if not isinstance(obj, dict):
            return ContractCheckResult(passed=False, violations=[ContractViolation(
                code="format_not_json",
                detail="expected a JSON object, got unparseable or non-object output",
            )])

        for key in contract.required_keys:
            if key not in obj:
                violations.append(ContractViolation(
                    code="missing_required_key",
                    detail=f"required key '{key}' absent",
                    key=key,
                ))

        for key, val in obj.items():
            spec = contract.keys.get(key)
            if spec is None:
                continue  # unknown extra key — not a breach on its own
            t = _json_type(val)
            if spec.types and t not in spec.types:
                violations.append(ContractViolation(
                    code="wrong_type",
                    detail=f"key '{key}' was {t}, expected one of {spec.types}",
                    key=key,
                ))
                continue
            if spec.enum_values is not None and t == "string" and val not in spec.enum_values:
                violations.append(ContractViolation(
                    code="enum_new_value",
                    detail=f"key '{key}' value '{val}' never seen in {spec.enum_values}",
                    key=key,
                    severity="soft",   # possibly a legitimate new category → drift signal
                ))
            if t == "number" and spec.num_min is not None and spec.num_max is not None:
                if not (spec.num_min <= val <= spec.num_max):
                    violations.append(ContractViolation(
                        code="out_of_range",
                        detail=f"key '{key}' value {val} outside observed [{spec.num_min}, {spec.num_max}]",
                        key=key,
                        severity="soft",
                    ))

    passed = not any(v.severity == "hard" for v in violations)
    return ContractCheckResult(passed=passed, violations=violations)
