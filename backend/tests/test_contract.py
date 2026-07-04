"""Proves the learned-contract core: feed a step's output history in, get a
contract out, then catch violations against it — with nobody having written a
schema by hand.
"""

import json

from services.contract_learner import learn_contract
from services.contract_checker import check_output


def _history(n=60):
    """A classifier step's output history: JSON with a stable enum + numeric +
    bool. Exactly the regularity the learner should discover on its own."""
    cats = ["billing", "technical", "general"]
    outs = []
    for i in range(n):
        outs.append(json.dumps({
            "category": cats[i % 3],
            "confidence": round(0.5 + (i % 5) * 0.1, 2),  # 0.5–0.9
            "urgent": (i % 2 == 0),
        }))
    return outs


# ── Induction ───────────────────────────────────────────────────────────────

def test_learns_structure_from_history():
    c = learn_contract(_history())
    assert c.format == "json"
    assert c.status == "proposed"
    assert set(c.required_keys) == {"category", "confidence", "urgent"}


def test_learns_enum_domain():
    c = learn_contract(_history())
    assert c.keys["category"].enum_values == ["billing", "general", "technical"]
    assert c.keys["confidence"].enum_values is None          # numeric, not an enum
    assert c.keys["confidence"].types == ["number"]
    assert c.keys["urgent"].types == ["boolean"]


def test_small_history_stays_observing():
    c = learn_contract(_history(n=10))
    assert c.status == "observing"          # below MIN_SAMPLES, don't enforce yet


def test_rare_key_not_required():
    outs = _history(50)
    outs.append(json.dumps({"category": "billing", "confidence": 0.7, "urgent": True, "note": "x"}))
    c = learn_contract(outs)
    assert "note" in c.keys                  # observed…
    assert "note" not in c.required_keys     # …but only once, so not required


# ── Checking ─────────────────────────────────────────────────────────────────

def test_good_output_passes():
    c = learn_contract(_history())
    r = check_output(json.dumps({"category": "billing", "confidence": 0.8, "urgent": False}), c)
    assert r.passed
    assert r.violations == []


def test_missing_required_key_is_hard_fail():
    c = learn_contract(_history())
    r = check_output(json.dumps({"category": "billing"}), c)
    assert not r.passed
    codes = {v.code for v in r.violations}
    assert "missing_required_key" in codes   # confidence + urgent absent


def test_non_json_is_hard_fail():
    c = learn_contract(_history())
    r = check_output("Sure! The category is billing.", c)
    assert not r.passed
    assert r.violations[0].code == "format_not_json"


def test_wrong_type_is_hard_fail():
    c = learn_contract(_history())
    r = check_output(json.dumps({"category": "billing", "confidence": "high", "urgent": False}), c)
    assert not r.passed
    assert any(v.code == "wrong_type" and v.key == "confidence" for v in r.violations)


def test_new_enum_value_is_soft():
    # A 4th category never seen before — candidate evolution, not a breach.
    c = learn_contract(_history())
    r = check_output(json.dumps({"category": "refund", "confidence": 0.8, "urgent": False}), c)
    assert r.passed                          # soft only — doesn't fail the call
    assert r.soft_only
    assert any(v.code == "enum_new_value" and v.severity == "soft" for v in r.violations)


def test_observing_contract_enforces_nothing():
    c = learn_contract(_history(n=5))        # observing
    r = check_output("literally anything", c)
    assert r.passed
