"""Tests for the public Read API (/v1).

Pure grouping/cursor logic is tested directly; the routes are exercised with
_resolve_project and the service functions patched, so no DB is required.
"""

import pytest
from fastapi.testclient import TestClient

import routers.read as read_route
from services.read_service import (
    encode_cursor, decode_cursor, group_anomalies, CRITICAL_THRESHOLD,
)
from schemas.read import CallPage, AnomalyPage, RunDetail, TraceCall, AnomalyRunSummary


# ── cursor ────────────────────────────────────────────────────────────────────

def test_cursor_roundtrip():
    assert decode_cursor(encode_cursor(150)) == 150
    assert decode_cursor(encode_cursor(0)) == 0


def test_cursor_bad_input_is_zero():
    assert decode_cursor(None) == 0
    assert decode_cursor("not-base64!!") == 0
    assert decode_cursor("") == 0


# ── call projection ───────────────────────────────────────────────────────────

def test_from_row_projects_call_site_provenance():
    call = TraceCall.from_row({
        "id": 7, "status_success": True,
        "code_filepath": "sample-app/chatbot.ts",
        "code_lineno": 256,
        "code_function": "runWorkflow",
        "commit_sha": "6de62be",
    })
    assert call.code_filepath == "sample-app/chatbot.ts"
    assert call.code_lineno == 256
    assert call.code_function == "runWorkflow"
    assert call.commit_sha == "6de62be"


def test_from_row_provenance_absent_is_none():
    """OTel imports and pre-0.1.6 SDKs write no provenance — must not blow up."""
    call = TraceCall.from_row({"id": 7, "status_success": True})
    assert call.code_filepath is None
    assert call.code_lineno is None
    assert call.code_function is None
    assert call.commit_sha is None


# ── anomaly grouping ──────────────────────────────────────────────────────────

def _arow(run_id, step, code, score, at):
    return {"run_id": run_id, "step_name": step, "error_code": code,
            "penalty_score": score, "created_at": at}


def test_group_folds_rows_into_runs_and_steps():
    rows = [
        _arow("run-a", "extract", 1007, 60, "2026-07-10T10:00:00Z"),
        _arow("run-a", "extract", 2011, 40, "2026-07-10T10:00:01Z"),
        _arow("run-a", "respond", 5001, 30, "2026-07-10T10:00:02Z"),
        _arow("run-b", "extract", 1007, 20, "2026-07-11T09:00:00Z"),
    ]
    out = group_anomalies(rows)
    assert [r.run_id for r in out] == ["run-b", "run-a"]        # newest run first

    a = next(r for r in out if r.run_id == "run-a")
    assert a.total_score == 130
    assert a.triggered is True and a.level == "critical"
    assert a.latest_at == "2026-07-10T10:00:02Z"
    steps = {s.step_name: s for s in a.steps}
    assert steps["extract"].score == 100
    assert len(steps["extract"].codes) == 2

    b = next(r for r in out if r.run_id == "run-b")
    assert b.total_score == 20
    assert b.level == "warning" and b.triggered is False


def test_group_threshold_boundary():
    rows = [_arow("r", "s", 1, CRITICAL_THRESHOLD, "t")]
    assert group_anomalies(rows)[0].level == "critical"       # >= is critical
    rows = [_arow("r", "s", 1, CRITICAL_THRESHOLD - 1, "t")]
    assert group_anomalies(rows)[0].level == "warning"


def test_group_skips_rows_without_run_id():
    assert group_anomalies([_arow(None, "s", 1, 10, "t")]) == []


# ── routes ────────────────────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch):
    captured = {}
    monkeypatch.setattr(read_route, "_resolve_project",
                        lambda key: {"id": "proj-1"} if key == "good-key" else None)

    def fake_list_calls(project_id, **kw):
        captured["calls"] = {"project_id": project_id, **kw}
        return CallPage(data=[TraceCall(id="1", status="success")],
                        has_more=True, next_cursor="abc")

    def fake_list_anomalies(project_id, **kw):
        captured["anoms"] = {"project_id": project_id, **kw}
        return AnomalyPage(data=[AnomalyRunSummary(run_id="run-a", total_score=120,
                                                   level="critical", triggered=True)])

    def fake_get_run(project_id, run_id):
        captured["run"] = {"project_id": project_id, "run_id": run_id}
        if run_id == "missing":
            return None
        return RunDetail(run_id=run_id, calls=[TraceCall(id="1", status="error")],
                         cost_total=0.01, tokens_total=42, latency_total_ms=900)

    monkeypatch.setattr(read_route, "list_calls", fake_list_calls)
    monkeypatch.setattr(read_route, "list_anomalies", fake_list_anomalies)
    monkeypatch.setattr(read_route, "get_run", fake_get_run)

    import main
    c = TestClient(main.app)
    c._captured = captured
    return c


def _hdr(key="good-key"):
    return {"Authorization": f"Bearer {key}"} if key else {}


def test_calls_requires_key(client):
    assert client.get("/v1/calls").status_code == 401


def test_calls_invalid_key(client):
    assert client.get("/v1/calls", headers=_hdr("bad")).status_code == 401


def test_calls_ok_shape_and_pagination(client):
    r = client.get("/v1/calls", headers=_hdr())
    assert r.status_code == 200
    body = r.json()
    assert body["object"] == "list" and body["schema_version"] == 1
    assert body["data"][0]["status"] == "success"
    assert body["has_more"] is True and body["next_cursor"] == "abc"


def test_calls_filters_passed_through(client):
    client.get("/v1/calls?limit=10&step_name=extract&status=error&anomalous=true&model=gpt-4o",
               headers=_hdr())
    c = client._captured["calls"]
    assert c["project_id"] == "proj-1"
    assert c["limit"] == 10 and c["step_name"] == "extract"
    assert c["status"] == "error" and c["anomalous"] is True and c["model"] == "gpt-4o"


def test_calls_rejects_bad_status(client):
    assert client.get("/v1/calls?status=weird", headers=_hdr()).status_code == 422


def test_run_detail_ok(client):
    r = client.get("/v1/runs/run-a", headers=_hdr())
    assert r.status_code == 200
    body = r.json()
    assert body["run_id"] == "run-a" and body["tokens_total"] == 42
    assert body["calls"][0]["status"] == "error"


def test_run_detail_missing_404(client):
    assert client.get("/v1/runs/missing", headers=_hdr()).status_code == 404


def test_anomalies_ok_and_level_filter(client):
    r = client.get("/v1/anomalies?level=critical&since=2026-07-01T00:00:00Z", headers=_hdr())
    assert r.status_code == 200
    assert r.json()["data"][0]["run_id"] == "run-a"
    a = client._captured["anoms"]
    assert a["level"] == "critical" and a["since"] == "2026-07-01T00:00:00Z"


def test_anomalies_rejects_bad_level(client):
    assert client.get("/v1/anomalies?level=nope", headers=_hdr()).status_code == 422
