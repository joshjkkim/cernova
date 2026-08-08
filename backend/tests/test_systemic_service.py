"""Tests for systemic-incident detection.

A small fake Supabase client drives the (step, code) → distinct-run count and the
open/dedup/cooldown logic without a DB. Also checks the webhook event shape.

    cd backend && pytest tests/test_systemic_service.py
"""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import services.systemic_service as sysmod
from schemas.incident import Incident

MOD = "services.systemic_service"


class _Result:
    def __init__(self, data):
        self.data = data


class _Q:
    """Chainable query stub — ignores filters, returns preset data / records writes."""
    def __init__(self, data, capture, table):
        self._data, self._capture, self._table = data, capture, table
        self._mode, self._payload = "select", None

    def select(self, *a, **k): self._mode = "select"; return self
    def insert(self, row):     self._mode = "insert"; self._payload = row; return self
    def update(self, row):     self._mode = "update"; self._payload = row; return self
    def eq(self, *a, **k):     return self
    def gte(self, *a, **k):    return self
    def in_(self, *a, **k):    return self
    def limit(self, *a, **k):  return self
    def order(self, *a, **k):  return self

    def execute(self):
        if self._mode == "insert":
            self._capture["insert"] = self._payload
            return _Result([{"id": 1}])
        if self._mode == "update":
            self._capture["update"] = self._payload
            return _Result([])
        return _Result(self._data)


class FakeDB:
    def __init__(self, run_ids, existing_incident=None):
        self.anomalies = [{"run_id": r} for r in run_ids]
        self.existing = [existing_incident] if existing_incident else []
        self.capture: dict = {}

    def table(self, name):
        data = self.anomalies if name == "ANOMALIES" else self.existing
        return _Q(data, self.capture, name)


def _run(db):
    with patch(f"{MOD}.get_client", return_value=db):
        return sysmod.maybe_open_incident("proj", "generate-reply", 5001)


# --- threshold -------------------------------------------------------------

def test_below_threshold_no_incident():
    db = FakeDB(run_ids=["r1", "r2", "r3"])           # 3 distinct < MIN_RUNS(5)
    assert _run(db) is None
    assert "insert" not in db.capture


def test_crossing_threshold_opens_incident():
    db = FakeDB(run_ids=[f"r{i}" for i in range(6)])  # 6 distinct >= 5
    inc = _run(db)
    assert inc is not None
    assert inc.run_count == 6
    assert inc.error_code == 5001
    assert "insert" in db.capture            # a new incident row was written


def test_distinct_runs_not_raw_rows():
    # 7 anomaly rows but only 4 distinct runs -> below threshold.
    db = FakeDB(run_ids=["r1", "r1", "r1", "r2", "r3", "r4", "r4"])
    assert _run(db) is None


def test_no_project_id_is_noop():
    with patch(f"{MOD}.get_client") as gc:
        assert sysmod.maybe_open_incident(None, "step", 5001) is None
        gc.assert_not_called()


# --- dedup / cooldown ------------------------------------------------------

def test_open_incident_within_cooldown_stays_silent():
    recent = dt.datetime.now(dt.timezone.utc).isoformat()
    existing = {"id": 9, "status": "open", "last_alerted_at": recent}
    db = FakeDB(run_ids=[f"r{i}" for i in range(8)], existing_incident=existing)
    inc = _run(db)
    assert inc is None                       # no re-alert
    assert db.capture.get("update", {}).get("run_count") == 8   # count refreshed


def test_open_incident_past_cooldown_realerts():
    old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=30)).isoformat()
    existing = {"id": 9, "status": "open", "last_alerted_at": old}
    db = FakeDB(run_ids=[f"r{i}" for i in range(8)], existing_incident=existing)
    inc = _run(db)
    assert inc is not None
    assert inc.id == 9
    assert "last_alerted_at" in db.capture["update"]


# --- auto-resolve ----------------------------------------------------------

def _ago(minutes: float) -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes)).isoformat()


def _incident(**over) -> dict:
    row = {"id": 9, "status": "open", "window_min": 10, "updated_at": _ago(1),
           "last_alerted_at": _ago(1)}
    row.update(over)
    return row


def _list(db):
    with patch(f"{MOD}.get_client", return_value=db):
        return sysmod.list_incidents("proj")


def test_stale_incident_resolves_on_read():
    # window 10 + grace 5 = 15; no refresh for 40 minutes -> the failure stopped.
    db = FakeDB(run_ids=[], existing_incident=_incident(updated_at=_ago(40)))
    rows = _list(db)
    assert rows[0]["status"] == "resolved"
    assert db.capture["update"]["status"] == "resolved"
    assert "resolved_at" in db.capture["update"]


def test_active_incident_survives_the_sweep():
    db = FakeDB(run_ids=[], existing_incident=_incident(updated_at=_ago(2)))
    rows = _list(db)
    assert rows[0]["status"] == "open"
    assert "update" not in db.capture          # nothing written


def test_sweep_respects_the_incidents_own_window():
    # A 60-minute window is still inside its grace at 40 minutes quiet.
    db = FakeDB(run_ids=[], existing_incident=_incident(window_min=60, updated_at=_ago(40)))
    assert _list(db)[0]["status"] == "open"


def test_undated_incident_is_never_resolved():
    db = FakeDB(run_ids=[], existing_incident=_incident(updated_at=None))
    assert _list(db)[0]["status"] == "open"


def test_already_resolved_is_left_alone():
    db = FakeDB(run_ids=[], existing_incident=_incident(status="resolved", updated_at=_ago(40)))
    _list(db)
    assert "update" not in db.capture


def test_recurrence_opens_a_new_incident():
    # A stale open row must be closed and replaced, not re-alerted: a fresh
    # outbreak deserves its own opened_at and its own alert.
    db = FakeDB(run_ids=[f"r{i}" for i in range(7)],
                existing_incident=_incident(updated_at=_ago(120), last_alerted_at=_ago(120)))
    inc = _run(db)
    assert db.capture["update"]["status"] == "resolved"   # old episode closed
    assert "insert" in db.capture                          # new incident opened
    assert inc is not None and inc.run_count == 7


class _RaisesOnResolvedAt(_Q):
    """Stands in for a DB where add_incident_resolution.sql hasn't been run."""
    def execute(self):
        if self._mode == "update" and "resolved_at" in (self._payload or {}):
            raise RuntimeError('column "resolved_at" does not exist')
        return super().execute()


def test_resolve_degrades_without_the_migration():
    db = FakeDB(run_ids=[], existing_incident=_incident(updated_at=_ago(40)))
    db.table = lambda name: _RaisesOnResolvedAt(db.existing, db.capture, name)
    rows = _list(db)
    assert db.capture["update"] == {"status": "resolved"}   # retried without it
    assert rows[0]["status"] == "resolved"


# --- webhook event shape ---------------------------------------------------

def test_build_systemic_event_shape():
    from services.webhook_service import build_systemic_event
    inc = Incident(id=1, project_id="p", step_name="generate-reply",
                   error_code=5001, run_count=7, window_min=10)
    ev = build_systemic_event(inc, {"id": "p", "name": "Acme"})
    assert ev["type"] == "systemic_incident"
    assert ev["run_count"] == 7
    assert ev["window_minutes"] == 10
    assert ev["step_name"] == "generate-reply"
    assert ev["triggered"] is True
    assert ev["codes"][0]["code"] == 5001
    assert ev["run_id"] == ""                # aggregate event, no single run
