"""Route-level tests for POST /feedback — auth, validation, and that verdicts
dispatch to the right mechanical effect. DB (store_feedback, promote/reject) is
patched out."""

import json

import pytest
from fastapi.testclient import TestClient

import routers.feedback as fb


@pytest.fixture
def client(monkeypatch):
    calls = {"stored": [], "promoted": [], "rejected": []}
    monkeypatch.setattr(fb, "_resolve_project",
                        lambda key: {"id": "proj-1"} if key == "good-key" else None)
    monkeypatch.setattr(fb, "store_feedback",
                        lambda pid, inp: calls["stored"].append((pid, inp)) or "fb-1")
    # apply_feedback is imported into the router module; patch the contract effects
    # it calls, via the service module it lives in.
    import services.feedback_service as svc
    monkeypatch.setattr(svc, "promote_contract",
                        lambda sid: calls["promoted"].append(sid) or True)
    monkeypatch.setattr(svc, "reject_contract",
                        lambda sid: calls["rejected"].append(sid) or True)
    import main
    c = TestClient(main.app)
    c._calls = calls
    return c


def _post(client, body, key="good-key"):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return client.post("/feedback", data=json.dumps(body), headers=headers)


def test_missing_key_401(client):
    r = _post(client, {"subject_type": "contract", "subject_id": "sp1", "verdict": "confirm"}, key=None)
    assert r.status_code == 401


def test_invalid_subject_type_400(client):
    r = _post(client, {"subject_type": "banana", "subject_id": "x", "verdict": "confirm"})
    assert r.status_code == 400


def test_invalid_verdict_400(client):
    r = _post(client, {"subject_type": "contract", "subject_id": "x", "verdict": "maybe"})
    assert r.status_code == 400


def test_contract_confirm_enforces_and_stores(client):
    r = _post(client, {"subject_type": "contract", "subject_id": "sp1", "verdict": "confirm"})
    assert r.status_code == 200
    assert r.json()["applied"] == "contract_enforced"
    assert client._calls["promoted"] == ["sp1"]
    assert len(client._calls["stored"]) == 1        # label always captured


def test_contract_reject_marks_rejected(client):
    r = _post(client, {"subject_type": "contract", "subject_id": "sp2", "verdict": "reject"})
    assert r.json()["applied"] == "contract_rejected"
    assert client._calls["rejected"] == ["sp2"]


def test_anomaly_confirm_is_label_only(client):
    r = _post(client, {"subject_type": "anomaly", "subject_id": "run-9", "verdict": "confirm"})
    assert r.status_code == 200
    assert r.json()["applied"] == "stored"           # real issue: no mechanical effect
    assert len(client._calls["stored"]) == 1         # but the label is captured


def test_anomaly_reject_reincludes_run(client, monkeypatch):
    import services.feedback_service as svc
    seen = []
    monkeypatch.setattr(svc, "_reinclude_run_in_baseline",
                        lambda pid, rid: seen.append((pid, rid)) or 3)
    r = _post(client, {"subject_type": "anomaly", "subject_id": "run-9", "verdict": "reject"})
    assert r.status_code == 200
    assert r.json()["applied"] == "baseline_reincluded:3"
    assert seen == [("proj-1", "run-9")]             # scoped to the authed project
    assert len(client._calls["stored"]) == 1


def test_reinclude_flips_calls_and_counts(fake_db, monkeypatch):
    import services.feedback_service as svc
    db = fake_db()
    monkeypatch.setattr(svc, "get_client", lambda: db)
    n = svc._reinclude_run_in_baseline("proj-1", "run-9")
    assert n == 1                                    # fake update echoes one row
    assert db.writes == [("CALLS", "update", {"anomaly_triggered": False})]


def test_anomaly_reject_effect_failure_keeps_label(client, monkeypatch):
    import services.feedback_service as svc
    def boom(pid, rid):
        raise RuntimeError("db down")
    monkeypatch.setattr(svc, "_reinclude_run_in_baseline", boom)
    r = _post(client, {"subject_type": "anomaly", "subject_id": "run-9", "verdict": "reject"})
    assert r.status_code == 200                      # label stored, effect degraded
    assert r.json()["applied"] == "baseline_reinclusion_failed"
    assert len(client._calls["stored"]) == 1
