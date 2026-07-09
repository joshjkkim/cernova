"""Import endpoints — warm-start baselines from an existing observability tool.

POST /import/langfuse — pull a project's Langfuse GENERATION history, and
POST /import/langsmith — pull a project's LangSmith llm-run history, and replay
it through the pipeline (alerts suppressed) so step profiles + baselines exist on
day one instead of waiting to accrue live calls.

Credentials are validated synchronously (fast auth feedback); the full paginated
import then runs in a background thread and reports its tally to the logs.
"""

import logging
import threading

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from routers.ingest import _resolve_project
from services.importer import (
    DEFAULT_HOST,
    LANGSMITH_DEFAULT_HOST,
    ImportError_,
    import_langfuse,
    import_langsmith,
    validate_credentials,
    validate_langsmith_credentials,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["import"])


class LangfuseImportRequest(BaseModel):
    public_key: str
    secret_key: str
    host: str = DEFAULT_HOST


def _project_from_auth(request: Request) -> dict:
    api_key = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")
    project = _resolve_project(api_key)
    if not project:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return project


@router.post("/import/langfuse")
def import_from_langfuse(request: Request, body: LangfuseImportRequest) -> dict:
    project = _project_from_auth(request)

    # Fail fast on bad Langfuse credentials before backgrounding the import.
    try:
        validate_credentials(body.host, body.public_key, body.secret_key)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _run() -> None:
        try:
            import_langfuse(project, body.public_key, body.secret_key, body.host)
        except ImportError_ as exc:
            log.error(f"[import] langfuse import failed for project={project['id']}: {exc}")
        except Exception:
            log.error(f"[import] langfuse import crashed for project={project['id']}", exc_info=True)

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started", "source": "langfuse", "project_id": project["id"]}


class LangSmithImportRequest(BaseModel):
    api_key: str
    host: str = LANGSMITH_DEFAULT_HOST
    session_ids: list[str] | None = None   # LangSmith project ids; None = all


@router.post("/import/langsmith")
def import_from_langsmith(request: Request, body: LangSmithImportRequest) -> dict:
    project = _project_from_auth(request)

    # Fail fast on a bad LangSmith key before backgrounding the import.
    try:
        validate_langsmith_credentials(body.host, body.api_key, body.session_ids)
    except ImportError_ as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _run() -> None:
        try:
            import_langsmith(project, body.api_key, body.host, body.session_ids)
        except ImportError_ as exc:
            log.error(f"[import] langsmith import failed for project={project['id']}: {exc}")
        except Exception:
            log.error(f"[import] langsmith import crashed for project={project['id']}", exc_info=True)

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started", "source": "langsmith", "project_id": project["id"]}
