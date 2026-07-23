"""Dashboard read path for systemic incidents.

User-token authed (require_owner) like the other dashboard endpoints — the
machine-facing /v1 Read API is separate. Incidents are written by
services/systemic_service during ingest; this just surfaces them.
"""

from fastapi import APIRouter, Request

from auth import require_owner
from services.systemic_service import list_incidents

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/project/{project_id}")
def get_for_project(request: Request, project_id: str) -> list[dict]:
    require_owner(request, project_id)
    return list_incidents(project_id)
