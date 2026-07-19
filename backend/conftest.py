"""Shared pytest setup for the backend suite.

Placing this at the backend root also puts the backend directory on sys.path
for every test, replacing the per-file sys.path.insert hacks (existing ones are
harmless and can be deleted opportunistically).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# The suite must run without real credentials (fresh clone, CI). Setdefault so
# a developer's .env still wins locally, but nothing *requires* it. Tests never
# execute real queries — anything that tries fails loudly against these dummies.
os.environ.setdefault("SUPABASE_URL", "https://ci-dummy.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "ci-dummy-key")

import pytest


class FakeSupabase:
    """Minimal chainable stand-in for the supabase client used across services.

    Reads come from `tables` (table name -> list of row dicts); every filter /
    order / limit call is a no-op returning the same query, mirroring how our
    tests stub queries today. Writes are recorded in `writes` as
    (table, op, payload) tuples for assertion.

        db = FakeSupabase({"CALLS": [{"id": 1}]})
        db.table("CALLS").select("*").eq("x", 1).execute().data  # -> [{"id": 1}]
        db.table("incidents").insert({...}).execute()
        assert db.writes == [("incidents", "insert", {...})]

    New tests should prefer the `fake_db` fixture over hand-rolling stubs
    (there are four bespoke copies in older test files — consolidation welcome).
    """

    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables = tables or {}
        self.writes: list[tuple[str, str, dict]] = []

    def table(self, name: str):
        return _FakeQuery(self, name)

    def rpc(self, name: str, params: dict):
        return _FakeQuery(self, f"rpc:{name}")


class _Result:
    def __init__(self, data):
        self.data = data
        self.count = len(data) if isinstance(data, list) else None


class _FakeQuery:
    def __init__(self, db: FakeSupabase, table: str):
        self._db, self._table = db, table
        self._op, self._payload = "select", None

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def __getattr__(self, _name):
        # select/eq/gte/lte/or_/order/limit/single/in_/... — chainable no-ops.
        return lambda *a, **k: self

    def execute(self):
        if self._op != "select":
            self._db.writes.append((self._table, self._op, self._payload))
            return _Result([self._payload] if self._payload else [])
        return _Result(list(self._db.tables.get(self._table, [])))


@pytest.fixture
def fake_db():
    """Factory fixture: build a FakeSupabase preloaded with table rows.

        def test_x(fake_db):
            db = fake_db({"CALLS": [...]})
            with patch("services.foo.get_client", return_value=db): ...
    """
    return FakeSupabase
