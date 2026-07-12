"""Public Read API — pull scored traces and detected anomalies.

The "data out" half of the platform, beside the outbound webhook. Bearer
API-key authed (the same key used to send traces), versioned under /v1, and
returns clean public projections (schemas/read.py), not raw DB rows.

  GET /v1/calls            — paginated, filterable list of scored calls
  GET /v1/runs/{run_id}    — one run's calls + its anomaly summary
  GET /v1/anomalies        — paginated anomalies, grouped by run
"""

import logging

from fastapi import APIRouter, Request, HTTPException, Query

from routers.ingest import _resolve_project
from schemas.read import CallPage, AnomalyPage, RunDetail
from services.read_service import list_calls, list_anomalies, get_run

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["read"])


def _project_from_auth(request: Request) -> dict:
    api_key = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")
    project = _resolve_project(api_key)
    if not project:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return project


@router.get("/calls", response_model=CallPage)
def get_calls(
    request: Request,
    limit: int | None = Query(None, ge=1, le=200),
    cursor: str | None = None,
    since: str | None = Query(None, description="ISO 8601 — only calls at or after this time"),
    step_name: str | None = None,
    run_id: str | None = None,
    model: str | None = None,
    status: str | None = Query(None, pattern="^(success|error)$"),
    anomalous: bool | None = None,
) -> CallPage:
    project = _project_from_auth(request)
    return list_calls(
        project["id"], limit=limit, cursor=cursor, since=since,
        step_name=step_name, run_id=run_id, model=model,
        status=status, anomalous=anomalous,
    )


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run_detail(request: Request, run_id: str) -> RunDetail:
    project = _project_from_auth(request)
    run = get_run(project["id"], run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"No run found: {run_id}")
    return run


@router.get("/anomalies", response_model=AnomalyPage)
def get_anomalies(
    request: Request,
    limit: int | None = Query(None, ge=1, le=200),
    cursor: str | None = None,
    since: str | None = Query(None, description="ISO 8601 — only anomalies at or after this time"),
    level: str | None = Query(None, pattern="^(critical|warning)$"),
    step_name: str | None = None,
) -> AnomalyPage:
    project = _project_from_auth(request)
    return list_anomalies(
        project["id"], limit=limit, cursor=cursor, since=since,
        level=level, step_name=step_name,
    )
