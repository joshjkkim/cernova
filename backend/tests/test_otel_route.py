"""Route-level tests for POST /v1/traces.

Exercises auth, OTLP/JSON decoding, and dispatch into the shared pipeline with
the DB-touching bits (_resolve_project, process_canonical) patched out — so this
verifies wiring, not Supabase.
"""

import json

import pytest
from fastapi.testclient import TestClient

import routers.otel as otel_route
from tests.test_otel import OPENLLMETRY_PAYLOAD


@pytest.fixture
def client(monkeypatch):
    processed = []
    monkeypatch.setattr(otel_route, "_resolve_project",
                        lambda key: {"id": "proj-1"} if key == "good-key" else None)
    monkeypatch.setattr(otel_route, "process_canonical",
                        lambda trace, project: processed.append(trace) or "row-1")
    import main
    c = TestClient(main.app)
    c._processed = processed
    return c


def _post(client, payload, key="good-key"):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return client.post("/v1/traces", data=json.dumps(payload), headers=headers)


def test_missing_key_401(client):
    r = _post(client, OPENLLMETRY_PAYLOAD, key=None)
    assert r.status_code == 401


def test_invalid_key_401(client):
    r = _post(client, OPENLLMETRY_PAYLOAD, key="bad-key")
    assert r.status_code == 401


def test_genai_span_dispatched(client):
    r = _post(client, OPENLLMETRY_PAYLOAD)
    assert r.status_code == 200
    assert r.json() == {}
    assert len(client._processed) == 1
    trace = client._processed[0]
    assert trace.source == "otel"
    assert trace.model == "claude-haiku-4-5-20251001"


def test_malformed_json_400(client):
    r = client.post("/v1/traces", data="not json",
                    headers={"Content-Type": "application/json", "Authorization": "Bearer good-key"})
    assert r.status_code == 400


def test_empty_payload_accepted(client):
    r = _post(client, {"resourceSpans": []})
    assert r.status_code == 200
    assert client._processed == []
