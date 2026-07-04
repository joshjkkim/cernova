"""Tests for the Langfuse importer service.

The HTTP fetch (_fetch_page), the dedup lookup (_existing_external_ids), and the
pipeline entry (process_canonical) are patched, so these verify the import logic
— pagination, chronological ordering, dedup, error tallying — not Langfuse or the DB.
"""

import pytest

import services.importer as imp
from services.importer import ImportError_, import_langfuse


def _gen(obs_id, start, **kw):
    o = {
        "id": obs_id, "traceId": "t", "type": "GENERATION", "name": "step",
        "model": "claude-haiku-4-5", "startTime": start, "endTime": start,
        "input": "hi", "output": "ok", "usage": {"input": 1, "output": 1, "total": 2},
    }
    o.update(kw)
    return o


@pytest.fixture
def processed(monkeypatch):
    """Capture traces handed to process_canonical; default: no prior imports."""
    seen = []
    monkeypatch.setattr(
        "routers.ingest.process_canonical",
        lambda trace, project, suppress_alerts=False, synchronous=False: seen.append(trace) or "row",
    )
    monkeypatch.setattr(imp, "_existing_external_ids", lambda pid: set())
    return seen


def _single_page(*observations):
    return lambda host, pk, sk, page: (
        {"data": list(observations), "meta": {"totalPages": 1}} if page == 1 else {"data": []}
    )


def test_imports_in_chronological_order(monkeypatch, processed):
    # Page returns newest-first; importer must process oldest-first for baselines.
    monkeypatch.setattr(imp, "_fetch_page", _single_page(
        _gen("b", "2026-01-02T00:00:00Z"),
        _gen("a", "2026-01-01T00:00:00Z"),
    ))
    result = import_langfuse({"id": "p"}, "pk", "sk")
    assert result.imported == 2
    assert [t.external_id for t in processed] == ["a", "b"]


def test_dedup_skips_already_imported(monkeypatch, processed):
    monkeypatch.setattr(imp, "_existing_external_ids", lambda pid: {"a"})
    monkeypatch.setattr(imp, "_fetch_page", _single_page(
        _gen("a", "2026-01-01T00:00:00Z"),
        _gen("b", "2026-01-02T00:00:00Z"),
    ))
    result = import_langfuse({"id": "p"}, "pk", "sk")
    assert result.skipped == 1
    assert result.imported == 1
    assert [t.external_id for t in processed] == ["b"]


def test_paginates_until_totalpages(monkeypatch, processed):
    def fetch(host, pk, sk, page):
        return {
            1: {"data": [_gen("a", "2026-01-01T00:00:00Z")], "meta": {"totalPages": 2}},
            2: {"data": [_gen("b", "2026-01-02T00:00:00Z")], "meta": {"totalPages": 2}},
        }.get(page, {"data": []})
    monkeypatch.setattr(imp, "_fetch_page", fetch)
    result = import_langfuse({"id": "p"}, "pk", "sk")
    assert result.fetched == 2 and result.imported == 2


def test_per_observation_error_is_counted_not_fatal(monkeypatch):
    monkeypatch.setattr(imp, "_existing_external_ids", lambda pid: set())

    def flaky(trace, project, suppress_alerts=False, synchronous=False):
        if trace.external_id == "b":
            raise RuntimeError("boom")
        return "row"
    monkeypatch.setattr("routers.ingest.process_canonical", flaky)
    monkeypatch.setattr(imp, "_fetch_page", _single_page(
        _gen("a", "2026-01-01T00:00:00Z"),
        _gen("b", "2026-01-02T00:00:00Z"),
    ))
    result = import_langfuse({"id": "p"}, "pk", "sk")
    assert result.imported == 1 and result.errors == 1


def test_auth_failure_propagates(monkeypatch, processed):
    def boom(host, pk, sk, page):
        raise ImportError_("Langfuse rejected the credentials (401/403)")
    monkeypatch.setattr(imp, "_fetch_page", boom)
    with pytest.raises(ImportError_):
        import_langfuse({"id": "p"}, "pk", "sk")
