import threading
from fastapi import APIRouter, Request, HTTPException

from schemas.trace import IngestPayload, IngestResponse
from services.trace_service import ingest_trace
from services.slack_service import (
    send_error_alert, send_rate_alert,
    RATE_THRESHOLD, RATE_WINDOW,
)
from services.anomaly_service import ingest_anomalies
from anomaly import evaluate_call, CallInput
from db import get_client

router = APIRouter(tags=["ingest"])


def _resolve_project(api_key: str) -> dict | None:
    """Return project row for the given API key, or None."""
    try:
        res = (
            get_client()
            .table("PROJECTS")
            .select("*")
            .eq("API_KEY", api_key)
            .maybe_single()
            .execute()
        )
        if not res.data:
            print(f"[ingest] no project found for key {api_key[:12]}…")
        return res.data if res.data else None
    except Exception as exc:
        print(f"[ingest] _resolve_project error for key {api_key[:12]}…: {exc}")
        return None


def _fire_slack(project: dict, payload: IngestPayload) -> None:
    """Run in a background thread so it never blocks the ingest response."""
    webhook = project.get("slack_webhook_url")
    if not webhook:
        return

    name = project.get("name", "Unknown")
    pid  = project["id"]

    alert_on_error     = project.get("alert_on_error", True)
    rate_threshold     = project.get("alert_error_rate_threshold") or 0.25
    rate_window        = project.get("alert_error_rate_window") or 20

    # Individual error alert
    if payload.status_success is False and alert_on_error:
        send_error_alert(
            webhook_url=webhook,
            project_name=name,
            project_id=pid,
            step_name=payload.step_name,
            model=payload.model,
            error=payload.error or "Unknown error",
            run_id=payload.run_id,
        )

    # Error rate check
    try:
        res = (
            get_client()
            .table("CALLS")
            .select("status_success")
            .eq("project_id", pid)
            .order("created_at", desc=True)
            .limit(rate_window)
            .execute()
        )
        rows = res.data or []
        if len(rows) >= 5:
            errors = sum(1 for r in rows if not r.get("status_success", True))
            rate = errors / len(rows)
            if rate >= rate_threshold:
                send_rate_alert(webhook, name, pid, rate, len(rows))
    except Exception as exc:
        print(f"[ingest] error rate check failed: {exc}")


def _run_anomaly_detection(payload: IngestPayload, project_id: int | None) -> None:
    """Run in a background thread — score the call and persist any anomalies."""
    try:
        call_input = CallInput.model_validate(payload.model_dump())
        result = evaluate_call(call_input)
        if result.triggered:
            from schemas.anomaly import AnomalyInput
            ingest_anomalies(
                [AnomalyInput(
                    step_name=payload.step_name,
                    run_id=payload.run_id,
                    bad_scores={str(code): int(penalty) for code, penalty in result.error_map.items()},
                )],
                project_id,
            )
    except Exception as exc:
        print(f"[ingest] anomaly detection failed for run {payload.run_id}: {exc}")


@router.post("/ingest", response_model=IngestResponse)
def ingest(request: Request, payload: IngestPayload) -> IngestResponse:
    auth = request.headers.get("Authorization", "")
    api_key = auth.removeprefix("Bearer ").strip()

    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    project = _resolve_project(api_key)
    payload.project_id = project["id"] if project else None

    trace_id = ingest_trace(payload)

    project_id = project["id"] if project else None
    threading.Thread(target=_run_anomaly_detection, args=(payload, project_id), daemon=True).start()

    if project:
        threading.Thread(target=_fire_slack, args=(project, payload), daemon=True).start()

    return IngestResponse(trace_id=trace_id)
