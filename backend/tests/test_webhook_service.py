"""Tests for the outbound webhook service — signing, delivery, event shape.

urlopen is patched so nothing leaves the process.
"""

import services.webhook_service as wh
from anomaly import EvalResult
from schemas.canonical import CanonicalTrace


class _Resp:
    def __init__(self, status): self.status = status
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_sign_is_deterministic_hmac():
    s1 = wh.sign("secret", b"body")
    assert s1.startswith("sha256=")
    assert s1 == wh.sign("secret", b"body")
    assert wh.sign("other-secret", b"body") != s1


def test_deliver_signs_and_succeeds(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["headers"] = {k.lower(): v for k, v in req.headers.items()}
        captured["body"] = req.data
        return _Resp(200)

    monkeypatch.setattr(wh, "urlopen", fake_urlopen)
    ok = wh._deliver("https://example.com/hook", "sec", {"a": 1})
    assert ok is True
    assert captured["url"] == "https://example.com/hook"
    assert captured["headers"]["x-cernova-signature"] == wh.sign("sec", captured["body"])


def test_deliver_no_secret_omits_signature(monkeypatch):
    captured = {}
    monkeypatch.setattr(wh, "urlopen", lambda req, timeout=None: captured.update(
        headers={k.lower() for k in req.headers}) or _Resp(204))
    assert wh._deliver("https://x", None, {}) is True
    assert "x-cernova-signature" not in captured["headers"]


def test_deliver_retries_then_gives_up(monkeypatch):
    calls = {"n": 0}

    def boom(req, timeout=None):
        calls["n"] += 1
        raise OSError("connection refused")

    monkeypatch.setattr(wh, "urlopen", boom)
    monkeypatch.setattr(wh.time, "sleep", lambda s: None)
    assert wh._deliver("https://x", None, {}) is False
    assert calls["n"] == wh._RETRIES + 1


def test_build_anomaly_event_shape():
    payload = CanonicalTrace(run_id="r1", step_name="generate-reply", model="claude-haiku-4-5",
                             raw_prompt="hi", latency_ms=10)
    result = EvalResult(triggered=True, total_score=110.0, threshold=100.0, stopped_at_layer=None,
                        hits=[], error_map={5001: 30.0}, prompt_shape="prose", output_shape="prose")
    ev = wh.build_anomaly_event(payload, result, {"id": "p1", "name": "proj"})
    assert ev["schema_version"] == 1
    assert ev["type"] == "anomaly"
    assert ev["triggered"] is True
    assert ev["total_score"] == 110.0 and ev["threshold"] == 100.0
    assert ev["project_id"] == "p1" and ev["project_name"] == "proj"
    assert ev["step_name"] == "generate-reply"
    assert ev["codes"][0]["code"] == 5001
    assert isinstance(ev["codes"][0]["name"], str)
    assert "event_id" in ev and "timestamp" in ev


def test_send_test_webhook_uses_test_type(monkeypatch):
    sent = {}
    monkeypatch.setattr(wh, "_deliver", lambda url, secret, event: sent.update(event) or True)
    assert wh.send_test_webhook("https://x", "sec", "proj") is True
    assert sent["type"] == "test" and sent["project_name"] == "proj" and sent["triggered"] is True
