"""Contract system — DB glue tying the learner/checker into the live pipeline.

Responsibilities:
  - load_contract / store_contract — persist a LearnedContract on step_profiles
  - maybe_learn_contract — induce a contract from a step's real output history
    once it has enough, storing it as 'proposed'
  - evaluate_contract — pure: check one output, return hard-violation anomaly
    codes ONLY when the contract is 'enforced'
  - promote_contract — proposed → enforced (the dashboard confirm button; also
    callable directly)

Lifecycle safety: induced contracts start 'proposed'. They are checked and
logged on live traffic but do NOT affect anomaly scores until promoted to
'enforced' — so this never silently fabricates anomalies on production output.

Every DB path is defensive: if the `contract` column doesn't exist yet (migration
not run) or any query fails, the functions no-op rather than break ingest.
"""

from __future__ import annotations

from anomaly import CONDITION_REGISTRY
from db import get_client
from schemas.contract import ContractCheckResult, LearnedContract
from services.contract_checker import check_output
from services.contract_learner import MIN_SAMPLES, learn_contract

# Map a checker violation code → the registered anomaly condition code.
# Only hard, structural violations score; soft ones (enum_new_value, out_of_range)
# are drift signals, logged but not scored.
_VIOLATION_TO_CODE: dict[str, int] = {
    "format_not_json": 2010,
    "missing_required_key": 2011,
    "wrong_type": 2012,
}

_OUTPUT_HISTORY_LIMIT = 200


# ── Pure evaluation (no DB — unit tested) ──────────────────────────────────────

def hard_violation_codes(result: ContractCheckResult) -> dict[int, float]:
    """Translate hard contract violations into {anomaly_code: penalty}, pulling
    penalties from the shared CONDITION_REGISTRY so there's one source of truth."""
    codes: dict[int, float] = {}
    for v in result.violations:
        if v.severity != "hard":
            continue
        code = _VIOLATION_TO_CODE.get(v.code)
        if code is not None:
            codes[code] = CONDITION_REGISTRY[code].penalty
    return codes


def evaluate_contract(
    contract: LearnedContract, output_text: str | None
) -> tuple[ContractCheckResult, dict[int, float]]:
    """Check an output against a contract. Returns the full result (for logging)
    and the anomaly codes to fold into scoring — empty unless the contract is
    'enforced'."""
    result = check_output(output_text, contract)
    codes = hard_violation_codes(result) if contract.status == "enforced" else {}
    return result, codes


# ── Persistence ────────────────────────────────────────────────────────────────

def load_contract(step_profile_id: str) -> LearnedContract | None:
    try:
        res = (
            get_client()
            .table("step_profiles")
            .select("contract")
            .eq("id", step_profile_id)
            .maybe_single()
            .execute()
        )
        data = res.data if res else None
        if not data or not data.get("contract"):
            return None
        return LearnedContract(**data["contract"])
    except Exception as exc:
        print(f"[contract] load failed for profile={step_profile_id}: {exc}")
        return None


def store_contract(step_profile_id: str, contract: LearnedContract) -> None:
    try:
        get_client().table("step_profiles").update(
            {"contract": contract.model_dump()}
        ).eq("id", step_profile_id).execute()
    except Exception as exc:
        print(f"[contract] store failed for profile={step_profile_id}: {exc}")


def _fetch_output_history(step_profile_id: str) -> list[str]:
    """Recent successful outputs for a profile — the material a contract is
    induced from. Successful only, so the contract learns the healthy shape."""
    res = (
        get_client()
        .table("CALLS")
        .select("output_code")
        .eq("step_profile_id", step_profile_id)
        .eq("status_success", True)
        .order("created_at", desc=True)
        .limit(_OUTPUT_HISTORY_LIMIT)
        .execute()
    )
    return [r["output_code"] for r in (res.data or []) if r.get("output_code")]


def maybe_learn_contract(step_profile_id: str) -> LearnedContract | None:
    """Induce and store a contract once a profile has enough history. No-op if a
    non-observing contract already exists (re-learn on prompt evolution is a
    later addition). Returns the stored contract, or None if still observing."""
    try:
        existing = load_contract(step_profile_id)
        if existing and existing.status != "observing":
            return existing

        outputs = _fetch_output_history(step_profile_id)
        if len(outputs) < MIN_SAMPLES:
            return None  # stay observing — not enough to learn from yet

        contract = learn_contract(outputs)  # status → 'proposed'
        store_contract(step_profile_id, contract)
        print(
            f"[contract] learned profile={step_profile_id} format={contract.format} "
            f"required={contract.required_keys} n={contract.sample_count} status={contract.status}"
        )
        return contract
    except Exception as exc:
        print(f"[contract] induction failed for profile={step_profile_id}: {exc}")
        return None


def promote_contract(step_profile_id: str) -> bool:
    """proposed → enforced. Called when a user confirms a contract in the
    dashboard (or manually). Returns True on success."""
    contract = load_contract(step_profile_id)
    if not contract:
        return False
    contract.status = "enforced"
    store_contract(step_profile_id, contract)
    print(f"[contract] enforced profile={step_profile_id}")
    return True


def reject_contract(step_profile_id: str) -> bool:
    """Mark a contract rejected — it enforces nothing and won't be re-proposed.
    Called when a user says the learned contract is wrong. (Relaxing an
    individual rule rather than the whole contract is a later refinement.)"""
    contract = load_contract(step_profile_id)
    if not contract:
        return False
    contract.status = "rejected"
    store_contract(step_profile_id, contract)
    print(f"[contract] rejected profile={step_profile_id}")
    return True
