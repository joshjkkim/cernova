"""Query layer for the public Read API.

Keyset-free, offset-based pagination via an opaque base64 cursor (just the next
offset). Simple and stable enough for v1; the cursor is deliberately opaque so we
can switch to keyset later without changing the contract.

Anomalies are stored one row per (run, step, code). Callers want them grouped by
run (as the dashboard shows), so we fetch a bounded window and group in Python —
anomalies are rare by construction, so this stays cheap.
"""

from __future__ import annotations

import base64
import logging

from anomaly import CONDITION_REGISTRY
from anomaly.config import EvalConfig
from db import get_client
from schemas.read import (
    AnomalyCode, AnomalyPage, AnomalyRunSummary, AnomalyStep,
    CallPage, RunDetail, TraceCall,
)

log = logging.getLogger(__name__)

MAX_LIMIT = 200
DEFAULT_LIMIT = 50
_ANOMALY_SCAN_CAP = 2000            # rows scanned when grouping anomalies
CRITICAL_THRESHOLD = EvalConfig().threshold


# ── cursor ────────────────────────────────────────────────────────────────────

def encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
    except Exception:
        return 0


def _clamp(limit: int | None) -> int:
    if not limit or limit < 1:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


# ── calls ───────────────────────────────────────────────────────────────────--

def list_calls(
    project_id: str,
    *,
    limit: int | None = None,
    cursor: str | None = None,
    since: str | None = None,
    step_name: str | None = None,
    run_id: str | None = None,
    model: str | None = None,
    status: str | None = None,        # "success" | "error"
    anomalous: bool | None = None,
) -> CallPage:
    lim = _clamp(limit)
    offset = decode_cursor(cursor)

    q = get_client().table("CALLS").select("*").eq("project_id", project_id)
    if since:
        q = q.gte("created_at", since)
    if step_name:
        q = q.eq("step_name", step_name)
    if run_id:
        q = q.eq("run_id", run_id)
    if model:
        q = q.eq("model", model)
    if status == "success":
        q = q.eq("status_success", True)
    elif status == "error":
        q = q.eq("status_success", False)
    if anomalous is True:
        q = q.eq("anomaly_triggered", True)
    elif anomalous is False:
        q = q.neq("anomaly_triggered", True)

    # fetch one extra to learn whether another page exists
    q = q.order("created_at", desc=True).range(offset, offset + lim)
    rows = q.execute().data or []

    has_more = len(rows) > lim
    rows = rows[:lim]
    return CallPage(
        data=[TraceCall.from_row(r) for r in rows],
        has_more=has_more,
        next_cursor=encode_cursor(offset + lim) if has_more else None,
    )


def get_run(project_id: str, run_id: str) -> RunDetail | None:
    client = get_client()
    call_rows = (
        client.table("CALLS").select("*")
        .eq("project_id", project_id).eq("run_id", run_id)
        .order("step_index", desc=False).execute().data or []
    )
    if not call_rows:
        return None

    anomaly_rows = (
        client.table("ANOMALIES").select("*").eq("run_id", run_id).execute().data or []
    )
    summaries = group_anomalies(anomaly_rows)
    anomaly = summaries[0] if summaries else None

    calls = [TraceCall.from_row(r) for r in call_rows]
    return RunDetail(
        run_id=run_id,
        calls=calls,
        anomaly=anomaly,
        cost_total=round(sum(c.cost or 0 for c in calls), 6),
        tokens_total=sum(c.total_tokens or 0 for c in calls),
        latency_total_ms=sum(c.latency_ms or 0 for c in calls),
    )


# ── anomalies ─────────────────────────────────────────────────────────────────

def group_anomalies(rows: list[dict]) -> list[AnomalyRunSummary]:
    """Fold per-(run, step, code) rows into per-run summaries, newest run first."""
    runs: dict[str, AnomalyRunSummary] = {}
    steps: dict[tuple[str, str], AnomalyStep] = {}
    for row in rows:
        rid = row.get("run_id")
        if not rid:
            continue
        created = row.get("created_at")
        if rid not in runs:
            runs[rid] = AnomalyRunSummary(run_id=rid, latest_at=created)
        run = runs[rid]
        if created and (run.latest_at is None or created > run.latest_at):
            run.latest_at = created

        score = float(row.get("penalty_score") or 0)
        run.total_score += score

        sname = row.get("step_name") or "unknown"
        key = (rid, sname)
        if key not in steps:
            step = AnomalyStep(step_name=sname, score=0.0)
            steps[key] = step
            run.steps.append(step)
        step = steps[key]
        step.score += score

        code = int(row.get("error_code") or 0)
        info = CONDITION_REGISTRY.get(code)
        step.codes.append(AnomalyCode(
            code=code,
            name=info.name if info else f"code_{code}",
            penalty=score,
        ))

    for run in runs.values():
        run.total_score = round(run.total_score, 4)
        run.triggered = run.total_score >= CRITICAL_THRESHOLD
        run.level = "critical" if run.triggered else "warning"

    return sorted(runs.values(), key=lambda r: (r.latest_at or ""), reverse=True)


def list_anomalies(
    project_id: str,
    *,
    limit: int | None = None,
    cursor: str | None = None,
    since: str | None = None,
    level: str | None = None,          # "critical" | "warning"
    step_name: str | None = None,
) -> AnomalyPage:
    lim = _clamp(limit)
    offset = decode_cursor(cursor)

    q = get_client().table("ANOMALIES").select("*").eq("project_id", project_id)
    if since:
        q = q.gte("created_at", since)
    if step_name:
        q = q.eq("step_name", step_name)
    rows = q.order("created_at", desc=True).limit(_ANOMALY_SCAN_CAP).execute().data or []

    summaries = group_anomalies(rows)
    if level in ("critical", "warning"):
        summaries = [s for s in summaries if s.level == level]

    page = summaries[offset:offset + lim]
    has_more = len(summaries) > offset + lim
    return AnomalyPage(
        data=page,
        has_more=has_more,
        next_cursor=encode_cursor(offset + lim) if has_more else None,
    )
