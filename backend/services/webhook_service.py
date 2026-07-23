"""Generic outbound webhook delivery.

The "alerts out to anywhere" sink alongside Slack and Sentry: POST the structured
anomaly event (schemas/webhook.py) to a project's webhook_url. Signed with a
per-project HMAC-SHA256 key (X-Cernova-Signature) so the receiver can verify it.

Mirrors slack_service — urllib, no extra deps, fire-and-forget from a background
thread. Delivery retries briefly on transient failures; sleeping is fine because
this only runs in the anomaly-detection thread, never on the ingest hot path.
"""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import logging
import time
import uuid
from urllib.request import Request as UrlRequest, urlopen

from anomaly import CONDITION_REGISTRY
from schemas.webhook import WebhookCode, WebhookEvent

log = logging.getLogger(__name__)

_TIMEOUT = 5
_RETRIES = 2  # total attempts = _RETRIES + 1


def sign(secret: str, body: bytes) -> str:
    """HMAC-SHA256 of the raw body, formatted as the X-Cernova-Signature value."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _deliver(url: str, secret: str | None, event: dict) -> bool:
    body = json.dumps(event).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "Cernova-Webhook/1"}
    if secret:
        headers["X-Cernova-Signature"] = sign(secret, body)

    for attempt in range(_RETRIES + 1):
        try:
            req = UrlRequest(url, data=body, headers=headers, method="POST")
            with urlopen(req, timeout=_TIMEOUT) as resp:
                if 200 <= resp.status < 300:
                    return True
                log.warning(f"[webhook] non-2xx {resp.status} from {url}")
        except Exception as exc:
            log.warning(f"[webhook] attempt {attempt + 1} to {url} failed: {exc}")
        if attempt < _RETRIES:
            time.sleep(0.5 * (attempt + 1))
    log.error(f"[webhook] delivery to {url} failed after {_RETRIES + 1} attempts")
    return False


def build_anomaly_event(payload, result, project: dict) -> dict:
    """Assemble the anomaly WebhookEvent dict from a scored call."""
    codes = [
        WebhookCode(
            code=code,
            name=CONDITION_REGISTRY[code].name if code in CONDITION_REGISTRY else "",
            penalty=penalty,
        )
        for code, penalty in result.error_map.items()
    ]
    event = WebhookEvent(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        project_id=str(project.get("id", "")),
        project_name=project.get("name", "unknown"),
        run_id=payload.run_id,
        step_name=payload.step_name,
        model=payload.model,
        total_score=float(result.total_score),
        threshold=float(result.threshold),
        triggered=bool(result.triggered),
        codes=codes,
    )
    return event.model_dump()


def send_anomaly_webhook(url: str, secret: str | None, payload, result, project: dict) -> bool:
    """Build and deliver an anomaly event. Returns True on 2xx."""
    return _deliver(url, secret, build_anomaly_event(payload, result, project))


def build_systemic_event(incident, project: dict) -> dict:
    """Assemble a systemic-incident WebhookEvent from an open Incident."""
    name = CONDITION_REGISTRY[incident.error_code].name if incident.error_code in CONDITION_REGISTRY else ""
    event = WebhookEvent(
        type="systemic_incident",
        event_id=str(uuid.uuid4()),
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        project_id=str(project.get("id", "")),
        project_name=project.get("name", "unknown"),
        step_name=incident.step_name,
        triggered=True,  # a systemic incident is, by definition, a fired event
        codes=[WebhookCode(code=incident.error_code, name=name, penalty=0.0)],
        run_count=incident.run_count,
        window_minutes=incident.window_min,
    )
    return event.model_dump()


def send_systemic_webhook(url: str, secret: str | None, incident, project: dict) -> bool:
    """Build and deliver a systemic-incident event. Returns True on 2xx."""
    return _deliver(url, secret, build_systemic_event(incident, project))


def send_test_webhook(url: str, secret: str | None, project_name: str) -> bool:
    """Deliver a synthetic event so a user can confirm their endpoint receives it."""
    event = WebhookEvent(
        type="test",
        event_id=str(uuid.uuid4()),
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        project_id="",
        project_name=project_name,
        run_id="test-run",
        step_name="test-step",
        model="test-model",
        total_score=120.0,
        threshold=100.0,
        triggered=True,
        codes=[WebhookCode(code=5001, name="latency_iqr_fence", penalty=30.0)],
    )
    return _deliver(url, secret, event.model_dump())
