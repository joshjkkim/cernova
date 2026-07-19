"""User-level auth for the dashboard endpoints.

Two authentication surfaces exist, deliberately:

  * API key (`_resolve_project` in routers/ingest.py) — how the SDK, OTel, imports,
    contracts, feedback, and the Read API authenticate. A project-scoped secret.
  * User token (this module) — how the *browser dashboard* authenticates. The
    logged-in human already holds a Supabase access token; these guards verify it
    and check the user owns the project they're asking about.

Ownership is a single comparison: PROFILES.id == the Supabase auth uid ==
PROJECTS.owner, so a valid token that resolves to user X may only touch projects
where owner == X. No extra profile lookup needed.

Token verification reuses the existing Supabase client (`get_client().auth
.get_user`) — no new secret and no local JWT crypto.
"""

from __future__ import annotations

import logging
import os

from fastapi import HTTPException, Request

from db import get_client

log = logging.getLogger(__name__)


def _bearer(request: Request) -> str:
    return request.headers.get("Authorization", "").removeprefix("Bearer ").strip()


def require_user(request: Request) -> dict:
    """Validate the Supabase access token. Returns {'id', 'email'}; 401 otherwise."""
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    try:
        resp = get_client().auth.get_user(token)
        user = getattr(resp, "user", None)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"id": user.id, "email": getattr(user, "email", None)}


def _load_project(project_id: str) -> dict:
    res = get_client().table("PROJECTS").select("*").eq("id", project_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return res.data[0]


def _check_owner(user: dict, project_id: str) -> dict:
    project = _load_project(project_id)
    if project.get("owner") != user["id"]:
        raise HTTPException(status_code=403, detail="You don't have access to this project")
    return project


def require_owner(request: Request, project_id: str) -> dict:
    """Validate the user AND that they own project_id. Returns the project row."""
    return _check_owner(require_user(request), project_id)


def require_admin(request: Request) -> dict:
    """Validate the user AND that their email is listed in ADMIN_EMAILS.

    ADMIN_EMAILS is a comma-separated env var. Fail-closed: unset or empty
    means nobody is admin — the operator surface cannot be reached by accident
    on a deployment that never configured it.
    """
    user = require_user(request)
    allowed = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
    email = (user.get("email") or "").lower()
    if not email or email not in allowed:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_owner_of_run(request: Request, run_id: str) -> dict:
    """Authorize by the project a run belongs to (for run-scoped endpoints).

    Validates the token *first*, so an unauthenticated caller can't probe which
    run ids exist via the 404.
    """
    user = require_user(request)
    rows = (
        get_client().table("CALLS").select("project_id")
        .eq("run_id", run_id).limit(1).execute().data
    )
    if not rows or not rows[0].get("project_id"):
        raise HTTPException(status_code=404, detail="Run not found")
    return _check_owner(user, rows[0]["project_id"])
