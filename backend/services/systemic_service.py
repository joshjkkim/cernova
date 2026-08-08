"""Systemic-incident detection — one-off vs. macro trend.

Sits ON TOP of per-call anomalies. When the SAME failure (step + condition code)
hits many *distinct runs* inside a short window, that's not a fluke — it's an
incident. The point is to fire ONE high-severity event instead of N per-call
alerts, so systemic detection *reduces* alert noise rather than adding to it.

v1 is per-project (the alert unit). The `incidents` table is shaped so a fleet
tier (same failure across many projects, keyed on model) drops in without a
rewrite. Every DB path is defensive: a missing table/column never breaks ingest.
"""

from __future__ import annotations

import datetime as dt
import logging

from db import get_client
from schemas.incident import Incident

log = logging.getLogger(__name__)

WINDOW_MIN   = 10     # look-back window for the distinct-run count
MIN_RUNS     = 5      # distinct runs firing the same (step, code) to be an incident
COOLDOWN_MIN = 10     # don't re-alert an open incident more than once per this
RESOLVE_GRACE_MIN = 5 # quiet time past the window before an incident is closed
_SCAN_CAP    = 2000   # bound the window fetch (like read/trend services)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _iso(t: dt.datetime) -> str:
    return t.isoformat()


def _parse(ts: str | None) -> dt.datetime | None:
    if not ts:
        return None
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _is_stale(row: dict, now: dt.datetime) -> bool:
    """Has this open incident's failure stopped?

    `updated_at` is refreshed on every check while the (step, code) is still
    above min_runs, so a frozen `updated_at` means the incident stopped being
    systemic. We wait for its own window to fully roll off — the anomalies that
    supported it have aged out by then — plus a grace so a lull in traffic
    doesn't close a live incident.

    An undated row is never stale: we don't close what we can't date.
    """
    updated = _parse(row.get("updated_at"))
    if not updated:
        return False
    window = row.get("window_min") or WINDOW_MIN
    return now > updated + dt.timedelta(minutes=window + RESOLVE_GRACE_MIN)


def _resolve(db, ids: list[int], now: dt.datetime) -> None:
    """Close incidents whose failure has stopped. Best-effort — never raises."""
    if not ids:
        return
    try:
        db.table("incidents").update(
            {"status": "resolved", "resolved_at": _iso(now), "updated_at": _iso(now)}
        ).in_("id", ids).execute()
        log.info(f"[systemic] RESOLVED incidents={ids}")
    except Exception:
        # `resolved_at` may not exist yet (migration not run). `status` is what
        # the dashboard filters on, so close them regardless.
        try:
            db.table("incidents").update({"status": "resolved"}).in_("id", ids).execute()
            log.warning(f"[systemic] resolved incidents={ids} without resolved_at "
                        f"(run migrations/add_incident_resolution.sql)")
        except Exception:
            log.error(f"[systemic] resolve failed incidents={ids}", exc_info=True)


def list_incidents(project_id: str, limit: int = 100) -> list[dict]:
    """Recent incidents for a project, newest first — for the dashboard read path.

    Sweeps stale open incidents to 'resolved' on the way out. There is no
    scheduler in this deployment, and the read path is both the only reliable
    tick and the exact moment the answer has to be true — the dashboard filters
    on status, so an incident left open is an incident shown as ongoing.

    Returns raw rows (defensive: empty list if the table doesn't exist yet).
    """
    try:
        res = (
            get_client()
            .table("incidents")
            .select("*")
            .eq("project_id", project_id)
            .order("opened_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = res.data or []
    except Exception:
        log.error(f"[systemic] list_incidents failed project={project_id}", exc_info=True)
        return []

    try:
        now = _now()
        stale = [r["id"] for r in rows if r.get("status") == "open" and _is_stale(r, now)]
        if stale:
            _resolve(get_client(), stale, now)
            done = set(stale)
            for r in rows:
                if r.get("id") in done:
                    r["status"], r["resolved_at"] = "resolved", _iso(now)
    except Exception:
        log.error(f"[systemic] resolve sweep failed project={project_id}", exc_info=True)

    return rows


def _distinct_run_count(db, project_id: str, step_name: str, error_code: int, since_iso: str) -> int:
    """Distinct runs that fired (project, step, code) since the window start."""
    res = (
        db.table("ANOMALIES")
        .select("run_id")
        .eq("project_id", project_id)
        .eq("step_name", step_name)
        .eq("error_code", error_code)
        .gte("created_at", since_iso)
        .limit(_SCAN_CAP)
        .execute()
    )
    return len({r["run_id"] for r in (res.data or []) if r.get("run_id")})


def maybe_open_incident(
    project_id: str | None,
    step_name: str,
    error_code: int,
    window_min: int = WINDOW_MIN,
    min_runs: int = MIN_RUNS,
) -> Incident | None:
    """Open (or re-alert) a systemic incident for one fired condition.

    Returns an Incident to ALERT ON when the (step, code) has crossed min_runs in
    the window AND we haven't alerted within COOLDOWN. Returns None when it's not
    yet systemic, or when an open incident is still within its cooldown (the count
    is refreshed silently). window_min/min_runs come from per-project settings
    (defaults match the module constants). Never raises — must not break ingest.
    """
    if not project_id:
        return None
    try:
        db = get_client()
        now = _now()
        since = _iso(now - dt.timedelta(minutes=window_min))
        count = _distinct_run_count(db, project_id, step_name, error_code, since)
        if count < min_runs:
            return None

        existing = (
            db.table("incidents")
            .select("*")
            .eq("project_id", project_id)
            .eq("step_name", step_name)
            .eq("error_code", error_code)
            .eq("status", "open")
            .limit(1)
            .execute()
        ).data

        row = existing[0] if existing else None
        if row and _is_stale(row, now):
            # The earlier episode ended and this is a fresh outbreak. Close the
            # old incident so the recurrence opens (and alerts as) a new one
            # rather than silently re-alerting a row opened days ago.
            _resolve(db, [row["id"]], now)
            row = None

        if row:
            updates: dict = {"run_count": count, "updated_at": _iso(now)}
            last_alerted = _parse(row.get("last_alerted_at"))
            if last_alerted and last_alerted >= now - dt.timedelta(minutes=COOLDOWN_MIN):
                # Still hot and recently alerted — refresh the count, stay silent.
                db.table("incidents").update(updates).eq("id", row["id"]).execute()
                return None
            # Cooldown elapsed — re-alert this ongoing incident.
            updates["last_alerted_at"] = _iso(now)
            db.table("incidents").update(updates).eq("id", row["id"]).execute()
            log.info(f"[systemic] RE-ALERT incident={row['id']} project={project_id} "
                     f"step={step_name} code={error_code} runs={count}")
            return Incident(id=row["id"], project_id=project_id, step_name=step_name,
                            error_code=error_code, run_count=count, window_min=window_min)

        ins = db.table("incidents").insert({
            "scope": "project",
            "project_id": project_id,
            "step_name": step_name,
            "error_code": error_code,
            "run_count": count,
            "window_min": window_min,
            "status": "open",
            "opened_at": _iso(now),
            "updated_at": _iso(now),
            "last_alerted_at": _iso(now),
        }).execute()
        new_id = ins.data[0]["id"] if ins.data else None
        log.info(f"[systemic] OPENED incident={new_id} project={project_id} "
                 f"step={step_name} code={error_code} runs={count}/{window_min}min")
        return Incident(id=new_id, project_id=project_id, step_name=step_name,
                        error_code=error_code, run_count=count, window_min=window_min)
    except Exception:
        log.error(f"[systemic] check failed project={project_id} step={step_name} code={error_code}",
                  exc_info=True)
        return None
