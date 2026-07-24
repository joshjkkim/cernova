"""Evidence persistence — the WHY behind a fired condition.

Every layer computes observed/expected on its EvalHit; these tests pin that the
values survive to the ANOMALIES rows, that model output text never does, and
that codes with no hit (contract codes) still persist as before.
"""

import pytest

import services.anomaly_service as svc
from schemas.anomaly import AnomalyInput, Evidence
from services.anomaly_service import build_anomaly_rows, ingest_anomalies, redact_observed


def _input(bad_scores, evidence=None):
    return AnomalyInput(
        step_name="classify-intent",
        run_id="run-a",
        bad_scores=bad_scores,
        evidence=evidence or {},
    )


# ── redaction rule ────────────────────────────────────────────────────────────

def test_redacts_only_output_format_codes():
    assert redact_observed(2001) is True       # json_contract_violation — observed is output text
    assert redact_observed(2003) is True       # enum_contract_violation
    assert redact_observed(1001) is False      # status_failure — observed is a bool
    assert redact_observed(4001) is False      # latency_threshold — observed is a number
    assert redact_observed(5001) is False      # latency_iqr_fence — observed is a number


def test_redact_unknown_code_is_not_redacted():
    """An unregistered code has no layer to judge by; don't silently drop data."""
    assert redact_observed(9999) is False


# ── row construction ──────────────────────────────────────────────────────────

def test_evidence_lands_on_the_row():
    rows = build_anomaly_rows(
        [_input({"4001": 100}, {"4001": Evidence(observed=3400, expected="<= 240")})],
        "proj-1",
    )
    assert rows[0]["observed"] == 3400
    assert rows[0]["expected"] == "<= 240"
    assert rows[0]["error_code"] == 4001
    assert rows[0]["penalty_score"] == 100


def test_output_text_is_dropped_but_expected_survives():
    """The privacy line: an output preview must never reach the DB."""
    rows = build_anomaly_rows(
        [_input({"2003": 35}, {"2003": Evidence(
            observed="Well, it sounds like the customer is asking about…",
            expected=["billing", "technical"],
        )})],
        "proj-1",
    )
    assert "observed" not in rows[0]
    assert rows[0]["expected"] == ["billing", "technical"]


def test_code_without_evidence_still_persists():
    """Contract codes fold into error_map without an EvalHit — they must not vanish."""
    rows = build_anomaly_rows([_input({"2011": 30})], "proj-1")
    assert len(rows) == 1
    assert rows[0]["error_code"] == 2011
    assert "observed" not in rows[0] and "expected" not in rows[0]


def test_rows_stay_valid_without_the_migration():
    """No evidence keys at all when a hit carried neither value."""
    rows = build_anomaly_rows(
        [_input({"1002": 100}, {"1002": Evidence(observed=None, expected=None)})],
        "proj-1",
    )
    assert set(rows[0]) == {"step_name", "run_id", "project_id", "error_code", "penalty_score"}


# ── pre-migration fallback ────────────────────────────────────────────────────

class _FailsOnEvidence:
    """Rejects an insert carrying evidence columns, like a DB without the migration."""

    def __init__(self):
        self.attempts: list[list[dict]] = []

    def table(self, _name):
        return self

    def insert(self, rows):
        self.attempts.append(rows)
        self._rows = rows
        return self

    def execute(self):
        if any("observed" in r or "expected" in r for r in self._rows):
            raise RuntimeError('column "observed" of relation "ANOMALIES" does not exist')
        return type("R", (), {"data": []})()


def test_falls_back_to_evidence_free_insert(monkeypatch):
    """Deploying before the migration must degrade, not silently lose anomalies."""
    db = _FailsOnEvidence()
    monkeypatch.setattr(svc, "get_client", lambda: db)

    ingest_anomalies(
        [_input({"4001": 100}, {"4001": Evidence(observed=3400, expected="<= 240")})],
        "proj-1",
    )
    assert len(db.attempts) == 2                      # tried with evidence, then without
    assert "observed" in db.attempts[0][0]
    assert "observed" not in db.attempts[1][0]
    assert db.attempts[1][0]["error_code"] == 4001    # the anomaly itself still lands


def test_failure_without_evidence_is_not_swallowed(monkeypatch):
    """A genuine DB error must still surface rather than retry forever."""
    class AlwaysFails(_FailsOnEvidence):
        def execute(self):
            raise RuntimeError("connection refused")

    monkeypatch.setattr(svc, "get_client", lambda: AlwaysFails())
    with pytest.raises(RuntimeError, match="connection refused"):
        ingest_anomalies([_input({"2011": 30})], "proj-1")


def test_heterogeneous_evidence_types_pass_through():
    """observed/expected are jsonb — numbers, bools, lists and dicts all survive."""
    rows = build_anomaly_rows(
        [_input(
            {"1001": 100, "1007": 60},
            {
                "1001": Evidence(observed=False, expected=True),
                "1007": Evidence(observed=150, expected={"input": 100, "output": 40}),
            },
        )],
        "proj-1",
    )
    by_code = {r["error_code"]: r for r in rows}
    assert by_code[1001]["observed"] is False and by_code[1001]["expected"] is True
    assert by_code[1007]["expected"] == {"input": 100, "output": 40}
