import json
import logging
import os
import time
from urllib.request import urlopen, Request as UrlRequest
from typing import Optional

log = logging.getLogger(__name__)

DASHBOARD_BASE = os.environ.get("DASHBOARD_BASE_URL", "http://localhost:3000")

# Per-project cooldown so a burst of errors doesn't spam the channel
_rate_cooldown:    dict[str, float] = {}
_anomaly_cooldown: dict[str, float] = {}
_budget_cooldown:  dict[str, float] = {}
RATE_COOLDOWN_SEC    = 300    # 5 minutes between error-rate pings
ANOMALY_COOLDOWN_SEC = 60     # 1 minute between anomaly pings per project
BUDGET_COOLDOWN_SEC  = 3600   # 1 hour between budget alerts
RATE_THRESHOLD       = 0.25  # 25% error rate triggers the alert
RATE_WINDOW          = 20    # look at last N calls


def _post(url: str, payload: dict) -> bool:
    try:
        data = json.dumps(payload).encode()
        req = UrlRequest(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        log.error("[slack] webhook failed", exc_info=True)
        return False


def send_systemic_alert(
    webhook_url: str,
    project_name: str,
    project_id: str,
    step_name: str,
    condition_name: str,
    error_code: int,
    run_count: int,
    window_min: int,
) -> bool:
    """A systemic incident: the same condition hit many runs in a short window.

    No per-project cooldown here — the incident record itself already dedups
    (one alert per incident open / cooldown, in systemic_service).
    """
    text = (f"🚨 Systemic incident in {project_name}: {run_count} runs of "
            f"`{step_name}` hit `{condition_name}` in {window_min} min")
    blocks = [
        {"type": "header",
         "text": {"type": "plain_text", "text": f"🚨 Systemic incident — {step_name}"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Project*\n{project_name}"},
            {"type": "mrkdwn", "text": f"*Runs affected*\n`{run_count}` in {window_min} min"},
            {"type": "mrkdwn", "text": f"*Step*\n`{step_name}`"},
            {"type": "mrkdwn", "text": f"*Condition*\n`{error_code}` {condition_name}"},
        ]},
        {"type": "context", "elements": [
            {"type": "mrkdwn", "text": "Not a one-off — the same failure is hitting many runs at once."}]},
        {"type": "actions", "elements": [{
            "type": "button",
            "text": {"type": "plain_text", "text": "View project →"},
            "url": f"{DASHBOARD_BASE}/dashboard/{project_id}",
        }]},
    ]
    return _post(webhook_url, {"text": text, "blocks": blocks})


def send_error_alert(
    webhook_url: str,
    project_name: str,
    project_id: str,
    step_name: str,
    model: str,
    error: str,
    run_id: str,
) -> bool:
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"🚨 Error — {step_name}"},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Project*\n{project_name}"},
                {"type": "mrkdwn", "text": f"*Model*\n`{model}`"},
                {"type": "mrkdwn", "text": f"*Error*\n{error[:200]}"},
                {"type": "mrkdwn", "text": f"*Run*\n`{run_id[:16]}…`"},
            ],
        },
        {
            "type": "actions",
            "elements": [{
                "type": "button",
                "text": {"type": "plain_text", "text": "View Trace →"},
                "url": f"{DASHBOARD_BASE}/dashboard/{project_id}",
            }],
        },
    ]
    return _post(webhook_url, {
        "text": f"🚨 Error in {project_name}: {step_name}",
        "blocks": blocks,
    })


def send_rate_alert(
    webhook_url: str,
    project_name: str,
    project_id: str,
    error_rate: float,
    window: int,
) -> bool:
    now = time.time()
    if _rate_cooldown.get(project_id, 0) > now - RATE_COOLDOWN_SEC:
        return False  # still cooling down
    _rate_cooldown[project_id] = now

    pct = int(error_rate * 100)
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"⚠️ High error rate — {project_name}"},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{pct}% error rate* across the last {window} calls"},
        },
        {
            "type": "actions",
            "elements": [{
                "type": "button",
                "text": {"type": "plain_text", "text": "View Dashboard →"},
                "url": f"{DASHBOARD_BASE}/dashboard/{project_id}",
            }],
        },
    ]
    return _post(webhook_url, {
        "text": f"⚠️ High error rate in {project_name}: {pct}%",
        "blocks": blocks,
    })


def send_anomaly_alert(
    webhook_url: str,
    project_name: str,
    project_id: str,
    step_name: str,
    run_id: str,
    total_score: float,
    error_map: dict,          # {code: penalty}
    condition_names: dict,    # {code: name} from CONDITION_REGISTRY
    triggered: bool,
) -> bool:
    now = time.time()
    if _anomaly_cooldown.get(project_id, 0) > now - ANOMALY_COOLDOWN_SEC:
        return False
    _anomaly_cooldown[project_id] = now

    emoji  = "🔴" if triggered else "🟡"
    label  = "Critical anomaly" if triggered else "Anomaly warning"
    codes_text = "\n".join(
        f"`{code}` {condition_names.get(code, '')}  *+{int(pts)}pts*"
        for code, pts in error_map.items()
    )
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{emoji} {label} — {step_name}"},
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Project*\n{project_name}"},
                {"type": "mrkdwn", "text": f"*Score*\n`{int(total_score)} pts`"},
                {"type": "mrkdwn", "text": f"*Run*\n`{run_id[:16]}…`"},
                {"type": "mrkdwn", "text": f"*Step*\n`{step_name}`"},
            ],
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Conditions fired*\n{codes_text}"},
        },
        {
            "type": "actions",
            "elements": [{
                "type": "button",
                "text": {"type": "plain_text", "text": "View Run →"},
                "url": f"{DASHBOARD_BASE}/dashboard/{project_id}",
            }],
        },
    ]
    return _post(webhook_url, {
        "text": f"{emoji} {label} in {project_name}: {step_name} scored {int(total_score)}pts",
        "blocks": blocks,
    })


def send_budget_alert(
    webhook_url: str,
    project_name: str,
    project_id: str,
    spent_usd: float,
    budget_usd: float,
) -> bool:
    now = time.time()
    if now - _budget_cooldown.get(project_id, 0) < BUDGET_COOLDOWN_SEC:
        return False
    _budget_cooldown[project_id] = now

    pct = round(spent_usd / budget_usd * 100, 1)
    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"💸 *Monthly budget exceeded — {project_name}*\n${spent_usd:.4f} spent of ${budget_usd:.2f} budget ({pct}%)",
            },
        },
        {
            "type": "actions",
            "elements": [{
                "type": "button",
                "text": {"type": "plain_text", "text": "View Usage →"},
                "url": f"{DASHBOARD_BASE}/dashboard/{project_id}",
            }],
        },
    ]
    return _post(webhook_url, {
        "text": f"💸 Budget exceeded for {project_name}: ${spent_usd:.4f} / ${budget_usd:.2f}",
        "blocks": blocks,
    })


def send_test_alert(webhook_url: str, project_name: str) -> bool:
    blocks = [{
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": f"✅ *Cernova webhook connected*\nAlerts for *{project_name}* will appear here.",
        },
    }]
    return _post(webhook_url, {
        "text": f"✅ Cernova connected to {project_name}",
        "blocks": blocks,
    })
