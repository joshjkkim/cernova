"""Route-level tests for POST /import/langfuse.

Auth, credential validation, and background dispatch are exercised with the
Langfuse-touching bits (validate_credentials, import_langfuse) and the DB lookup
(_resolve_project) patched out. Thread is made synchronous so the dispatch is
observable in-test.
"""

import pytest
from fastapi.testclient import TestClient

import routers.imports as imports_route
from services.importer import ImportError_


class _SyncThread:
    """Run the target inline so the background dispatch is deterministic in tests."""
    def __init__(self, target=None, daemon=None, **kw):
        self._target = target

    def start(self):
        if self._target:
            self._target()


@pytest.fixture
def client(monkeypatch):
    calls = []
    monkeypatch.setattr(imports_route, "_resolve_project",
                        lambda key: {"id": "proj-1"} if key == "good-key" else None)
    monkeypatch.setattr(imports_route, "validate_credentials",
                        lambda host, pk, sk: None)
    monkeypatch.setattr(imports_route, "import_langfuse",
                        lambda project, pk, sk, host: calls.append((project["id"], pk, sk, host)))
    monkeypatch.setattr(imports_route.threading, "Thread", _SyncThread)
    import main
    c = TestClient(main.app)
    c._calls = calls
    return c


def _post(client, key="good-key", body=None):
    headers = {}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    body = body or {"public_key": "pk", "secret_key": "sk"}
    return client.post("/import/langfuse", json=body, headers=headers)


def test_missing_key_401(client):
    assert _post(client, key=None).status_code == 401


def test_invalid_key_401(client):
    assert _post(client, key="bad-key").status_code == 401


def test_bad_credentials_400(client, monkeypatch):
    def reject(host, pk, sk):
        raise ImportError_("Langfuse rejected the credentials (401/403)")
    monkeypatch.setattr(imports_route, "validate_credentials", reject)
    r = _post(client)
    assert r.status_code == 400
    assert "credentials" in r.json()["detail"]
    assert client._calls == []          # import never dispatched


def test_valid_request_dispatches_import(client):
    r = _post(client)
    assert r.status_code == 200
    assert r.json()["status"] == "started"
    assert client._calls == [("proj-1", "pk", "sk", "https://cloud.langfuse.com")]


def test_custom_host_forwarded(client):
    _post(client, body={"public_key": "pk", "secret_key": "sk", "host": "https://lf.internal"})
    assert client._calls[0][3] == "https://lf.internal"


# --- LangSmith -------------------------------------------------------------

@pytest.fixture
def ls_client(monkeypatch):
    calls = []
    monkeypatch.setattr(imports_route, "_resolve_project",
                        lambda key: {"id": "proj-1"} if key == "good-key" else None)
    monkeypatch.setattr(imports_route, "validate_langsmith_credentials",
                        lambda host, api_key, session_ids: None)
    monkeypatch.setattr(imports_route, "import_langsmith",
                        lambda project, api_key, host, session_ids:
                            calls.append((project["id"], api_key, host, session_ids)))
    monkeypatch.setattr(imports_route.threading, "Thread", _SyncThread)
    import main
    c = TestClient(main.app)
    c._calls = calls
    return c


def _post_ls(client, key="good-key", body=None):
    headers = {}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    body = body or {"api_key": "ls-key"}
    return client.post("/import/langsmith", json=body, headers=headers)


def test_ls_invalid_key_401(ls_client):
    assert _post_ls(ls_client, key="bad-key").status_code == 401


def test_ls_bad_credentials_400(ls_client, monkeypatch):
    def reject(host, api_key, session_ids):
        raise ImportError_("LangSmith rejected the API key (401/403)")
    monkeypatch.setattr(imports_route, "validate_langsmith_credentials", reject)
    r = _post_ls(ls_client)
    assert r.status_code == 400
    assert ls_client._calls == []       # import never dispatched


def test_ls_valid_request_dispatches_import(ls_client):
    r = _post_ls(ls_client)
    assert r.status_code == 200
    assert r.json()["status"] == "started"
    assert ls_client._calls == [("proj-1", "ls-key", "https://api.smith.langchain.com", None)]


def test_ls_session_ids_forwarded(ls_client):
    _post_ls(ls_client, body={"api_key": "ls-key", "session_ids": ["proj-uuid"]})
    assert ls_client._calls[0][3] == ["proj-uuid"]
