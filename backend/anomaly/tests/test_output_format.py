"""Tests for the output_format (regex) layer, focused on the contract-defer rule.

When an enforced learned contract governs a step's shape, the regex JSON checks
(2001/2002) must defer — otherwise a single non-JSON output double-counts as both
2001 (prompt-inferred) and 2010 (contract). The enum/yes-no checks have no scoring
contract twin, so they must keep firing regardless.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from anomaly.config import EvalConfig
from anomaly.layers.output_format import run_output_format
from anomaly.schemas import CallInput


def _call(prompt: str, output: str) -> CallInput:
    return CallInput(step_name="s", model="m", prompt=prompt, latency_ms=10,
                     run_id="r", output_code=output)


def _codes(prompt: str, output: str, **cfg) -> set[int]:
    hits = run_output_format(_call(prompt, output), EvalConfig(**cfg))
    return {h.condition_code for h in hits}


def test_json_prompt_prose_output_fires_2001_by_default():
    assert 2001 in _codes("Respond in JSON.", "The user seems upset.")


def test_json_check_deferred_when_contract_governs_format():
    # Same violation, but an enforced contract owns shape → regex JSON check is silent.
    assert _codes("Respond in JSON.", "The user seems upset.",
                  contract_governs_format=True) == set()


def test_whole_json_branch_defers():
    # A fenced block isn't parseable JSON, so it trips 2001 by default; under an
    # enforced contract the entire JSON branch (2001/2002) goes silent.
    prompt = "Return valid JSON only."
    fenced = "```json\n{\"a\": 1}\n```"
    assert _codes(prompt, fenced) == {2001}
    assert _codes(prompt, fenced, contract_governs_format=True) == set()


def test_enum_check_still_fires_when_contract_governs_format():
    # Enum has no scoring contract twin, so deferring JSON must not silence it.
    codes = _codes("Answer with one of: yes, no, maybe.", "absolutely",
                   contract_governs_format=True)
    assert 2003 in codes


def test_yes_no_check_still_fires_when_contract_governs_format():
    codes = _codes("Answer yes/no.", "perhaps", contract_governs_format=True)
    assert 2004 in codes


def test_valid_json_is_clean():
    assert _codes("Respond in JSON.", '{"ok": true}') == set()
