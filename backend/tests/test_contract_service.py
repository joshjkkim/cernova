"""Tests for the pure contract-evaluation logic — the mapping from a check
result to anomaly codes, and the proposed-vs-enforced gating. DB glue
(load/store/learn from Supabase) is intentionally not unit-tested here."""

import json

from anomaly import CONDITION_REGISTRY
from services.contract_learner import learn_contract
from services.contract_service import evaluate_contract, hard_violation_codes
from services.contract_checker import check_output


def _contract(status="enforced"):
    outs = [json.dumps({"category": ["billing", "technical", "general"][i % 3],
                        "confidence": 0.8, "urgent": i % 2 == 0}) for i in range(60)]
    c = learn_contract(outs)
    c.status = status
    return c


def test_hard_violations_map_to_registered_codes():
    c = _contract()
    result = check_output(json.dumps({"category": "billing"}), c)  # missing keys
    codes = hard_violation_codes(result)
    assert 2011 in codes                                  # contract_missing_required_key
    assert codes[2011] == CONDITION_REGISTRY[2011].penalty  # penalty from registry


def test_format_and_type_codes():
    c = _contract()
    assert 2010 in hard_violation_codes(check_output("not json", c))       # format_not_json
    bad_type = json.dumps({"category": "billing", "confidence": "hi", "urgent": True})
    assert 2012 in hard_violation_codes(check_output(bad_type, c))         # wrong_type


def test_soft_violations_do_not_score():
    c = _contract()
    # new enum value → soft → no anomaly code
    result = check_output(json.dumps({"category": "refund", "confidence": 0.8, "urgent": True}), c)
    assert hard_violation_codes(result) == {}


def test_enforced_contract_yields_codes():
    c = _contract(status="enforced")
    _, codes = evaluate_contract(c, json.dumps({"category": "billing"}))
    assert codes                                          # enforced → scores


def test_proposed_contract_yields_no_codes():
    c = _contract(status="proposed")
    check, codes = evaluate_contract(c, json.dumps({"category": "billing"}))
    assert not check.passed        # the violation is still detected…
    assert codes == {}             # …but a proposed contract never scores


def test_all_contract_codes_registered():
    # Every code the service can emit must exist in the registry (names/penalties)
    from services.contract_service import _VIOLATION_TO_CODE
    for code in _VIOLATION_TO_CODE.values():
        assert code in CONDITION_REGISTRY
