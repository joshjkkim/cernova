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


def test_anomaly_feedback_is_label_only(client):
    r = _post(client, {"subject_type": "anomaly", "subject_id": "42", "verdict": "reject"})
    assert r.status_code == 200
    assert r.json()["applied"] == "stored"           # no mechanical effect yet
    assert client._calls["promoted"] == []
    assert client._calls["rejected"] == []
    assert len(client._calls["stored"]) == 1         # but the label is captured
