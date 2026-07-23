"""Incident — a systemic failure: the same condition hitting many runs at once.

Pure data shape. A project-incident is keyed (project_id, step_name, error_code);
the same model serves a future fleet-event keyed (model, error_code) with scope
'fleet'. Mirrors the `incidents` table (migrations/add_incidents.sql).
"""

from __future__ import annotations

from pydantic import BaseModel


class Incident(BaseModel):
    id: int | None = None
    scope: str = "project"
    project_id: str | None = None
    step_name: str | None = None
    model: str | None = None
    error_code: int
    run_count: int          # distinct runs firing this (step, code) in the window
    window_min: int
    status: str = "open"
