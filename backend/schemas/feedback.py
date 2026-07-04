"""Feedback / confirmation payloads.

A confirmation is a human verdict on a detection. The label is always stored;
some subject types also trigger a small mechanical effect (see feedback_service).
"""

from pydantic import BaseModel

SUBJECT_TYPES = {"contract", "anomaly", "diagnosis"}
VERDICTS = {"confirm", "reject"}


class FeedbackInput(BaseModel):
    subject_type: str          # contract | anomaly | diagnosis
    subject_id: str            # step_profile_id | anomaly id | run_id
    verdict: str               # confirm | reject
    detail: dict | None = None # optional structured context


class FeedbackResponse(BaseModel):
    id: str
    applied: str               # what mechanical effect ran, or "stored" if label-only
