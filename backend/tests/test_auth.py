"""Tests for the dashboard auth guards (auth.py) and that routes enforce them."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import auth


# ── fakes ─────────────────────────────────────────────────────────────────────

class _Resp:
    def __init__(self, data): self.data = data

class _Query:
    def __init__(self, data): self._data = data
    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def order(self, *a, **k): return self
    def execute(self): return _Resp(self._data)

class _User:
    def __init__(self, uid, email): self.id, self.email = uid, email

class _UserResp:
    def __init__(self, user): self.user = user

class _Auth:
    def __init__(self, users): self._users = users
    def get_user(self, token):
        if token in self._users:
            return _UserResp(self._users[token])
        raise Exception("invalid token")

class FakeClient:
    def __init__(self, users, tables):
        self.auth = _Auth(users)
        self._tables = tables
    def table(self, name):
        return _Query(self._tables.get(name, []))

class _Req:
    def __init__(self, token=None):
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}


def _install(monkeypatch, users, tables):
    monkeypatch.setattr(auth, "get_client", lambda: FakeClient(users, tables))


# ── require_user ──────────────────────────────────────────────────────────────

def test_require_user_missing_token(monkeypatch):
    _install(monkeypatch, {}, {})
    with pytest.raises(HTTPException) as e:
        auth.require_user(_Req(None))
    assert e.value.status_code == 401


def test_require_user_invalid_token(monkeypatch):
    _install(monkeypatch, {"good": _User("u1", "a@b.c")}, {})
    with pytest.raises(HTTPException) as e:
        auth.require_user(_Req("bad"))
    assert e.value.status_code == 401


def test_require_user_valid(monkeypatch):
    _install(monkeypatch, {"good": _User("u1", "a@b.c")}, {})
    assert auth.require_user(_Req("good")) == {"id": "u1", "email": "a@b.c"}


# ── require_owner ─────────────────────────────────────────────────────────────

def _tables(owner="u1"):
    return {"PROJECTS": [{"id": "p1", "owner": owner, "name": "x"}],
            "CALLS": [{"project_id": "p1"}]}

def test_require_owner_match(monkeypatch):
    _install(monkeypatch, {"good": _User("u1", "a@b.c")}, _tables())
    proj = auth.require_owner(_Req("good"), "p1")
    assert proj["id"] == "p1"

def test_require_owner_wrong_user_403(monkeypatch):
    _install(monkeypatch, {"good": _User("intruder", "x@y.z")}, _tables(owner="u1"))
    with pytest.raises(HTTPException) as e:
        auth.require_owner(_Req("good"), "p1")
    assert e.value.status_code == 403

def test_require_owner_missing_project_404(monkeypatch):
    _install(monkeypatch, {"good": _User("u1", "a@b.c")}, {"PROJECTS": []})
    with pytest.raises(HTTPException) as e:
        auth.require_owner(_Req("good"), "nope")
    assert e.value.status_code == 404


# ── require_owner_of_run ──────────────────────────────────────────────────────

def test_require_owner_of_run_ok(monkeypatch):
    _install(monkeypatch, {"good": _User("u1", "a@b.c")}, _tables())
    assert auth.require_owner_of_run(_Req("good"), "run-1")["id"] == "p1"

def test_require_owner_of_run_missing_404(monkeypatch):
    _install(monkeypatch, {"good": _User("u1", "a@b.c")}, {"CALLS": []})
    with pytest.raises(HTTPException) as e:
        auth.require_owner_of_run(_Req("good"), "run-x")
    assert e.value.status_code == 404


# ── routes reject unauthenticated requests ────────────────────────────────────

@pytest.fixture
def client():
    import main
    return TestClient(main.app)

@pytest.mark.parametrize("method,path", [
    ("get",    "/projects/p1"),
    ("get",    "/projects/owner/u1"),
    ("get",    "/projects/p1/usage"),
    ("get",    "/projects/p1/step-health"),
    ("patch",  "/projects/p1/webhook"),
    ("delete", "/projects/p1"),
    ("get",    "/calls/project/p1"),
    ("get",    "/anomalies/project/p1"),
    ("post",   "/analyze/run/run-1"),
])
def test_guarded_routes_401_without_token(client, method, path):
    kwargs = {"json": {}} if method in ("patch", "post") else {}
    resp = getattr(client, method)(path, **kwargs)
    assert resp.status_code == 401, f"{method} {path} was {resp.status_code}, expected 401"


def test_list_all_projects_route_is_gone(client):
    # The wide-open GET /projects/ (every project + API key) was removed; only
    # POST /projects/ remains, so a GET is now 405 (no handler), never 200.
    assert client.get("/projects/").status_code == 405
