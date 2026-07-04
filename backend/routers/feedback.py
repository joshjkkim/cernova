"""Feedback / confirmation endpoints.

POST /feedback  — record a human verdict on a detection (always stored; contract
                  verdicts also enforce/reject the contract).
GET  /contracts — list a project's learned contracts so you can see what's
                  proposed and worth confirming, without a DB shell.
"""

from fastapi import APIRouter, Request, HTTPException

from db import get_client
from routers.ingest import _resolve_project
from schemas.feedback import FeedbackInput, FeedbackResponse, SUBJECT_TYPES, VERDICTS
from services.feedback_service import store_feedback, apply_feedback

router = APIRouter(tags=["feedback"])


def _project_from_auth(request: Request) -> dict:
    api_key = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")
    project = _resolve_project(api_key)
    if not project:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return project


@router.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(request: Request, payload: FeedbackInput) -> FeedbackResponse:
    project = _project_from_auth(request)

    if payload.subject_type not in SUBJECT_TYPES:
        raise HTTPException(status_code=400, detail=f"subject_type must be one of {sorted(SUBJECT_TYPES)}")
    if payload.verdict not in VERDICTS:
        raise HTTPException(status_code=400, detail=f"verdict must be one of {sorted(VERDICTS)}")

    feedback_id = store_feedback(project["id"], payload)
    applied = apply_feedback(payload)
    print(f"[feedback] project={project['id']} {payload.subject_type}/{payload.verdict} "
          f"subject={payload.subject_id} → {applied}")
    return FeedbackResponse(id=feedback_id, applied=applied)


@router.get("/contracts")
def list_contracts(request: Request) -> dict:
    project = _project_from_auth(request)
    res = (
        get_client()
        .table("step_profiles")
        .select("id,step_name,contract")
        .eq("project_id", project["id"])
        .execute()
    )
    contracts = []
    for row in res.data or []:
        c = row.get("contract")
        if not c:
            continue
        contracts.append({
            "step_profile_id": row["id"],
            "step_name":       row.get("step_name"),
            "status":          c.get("status"),
            "format":          c.get("format"),
            "required_keys":   c.get("required_keys", []),
            "sample_count":    c.get("sample_count"),
        })
    return {"contracts": contracts}
