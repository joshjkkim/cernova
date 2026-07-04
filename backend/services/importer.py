"""Langfuse import — fetch a project's history and replay it through the pipeline.

Paginates the Langfuse observations API, maps each GENERATION to a
CanonicalTrace, drops any already imported (dedup on external_id), and runs the
rest through process_canonical with alerts suppressed. Backfilling old traffic is
silent but still seeds step profiles + baselines, so a new user sees signal
immediately instead of waiting to accrue live calls.

Observations are processed oldest-first so baselines and evolution cutoffs build
in real chronological order, matching how live traffic would have arrived.
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from adapters.langfuse import observation_to_canonical
from db import get_client

log = logging.getLogger(__name__)

SOURCE = "langfuse"
DEFAULT_HOST = "https://cloud.langfuse.com"
_PAGE_LIMIT = 100
_MAX_PAGES = 200          # safety cap: up to 20k observations per import
_FETCH_TIMEOUT = 30


@dataclass
class ImportResult:
    fetched: int = 0      # generations seen across all pages
    imported: int = 0     # newly ingested
    skipped: int = 0      # already imported (dedup on external_id)
    errors: int = 0       # per-observation ingest failures

    def as_dict(self) -> dict[str, int]:
        return {"fetched": self.fetched, "imported": self.imported,
                "skipped": self.skipped, "errors": self.errors}


class ImportError_(Exception):
    """Raised for a whole-import failure (bad credentials, host unreachable)."""


def _existing_external_ids(project_id: str) -> set[str]:
    """external_ids already imported for this project, so a re-run is a no-op."""
    try:
        res = (
            get_client()
            .table("CALLS")
            .select("external_id")
            .eq("project_id", project_id)
            .eq("source", SOURCE)
            .not_.is_("external_id", "null")
            .execute()
        )
        return {r["external_id"] for r in (res.data or []) if r.get("external_id")}
    except Exception:
        log.error(f"[import] existing-id lookup failed for project={project_id}", exc_info=True)
        return set()


def _fetch_page(host: str, public_key: str, secret_key: str, page: int) -> dict:
    query = urllib.parse.urlencode({"type": "GENERATION", "page": page, "limit": _PAGE_LIMIT})
    url = f"{host.rstrip('/')}/api/public/observations?{query}"
    auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}"})
    try:
        with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise ImportError_("Langfuse rejected the credentials (401/403)") from exc
        raise ImportError_(f"Langfuse returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise ImportError_(f"could not reach Langfuse at {host}: {exc.reason}") from exc


def validate_credentials(host: str, public_key: str, secret_key: str) -> None:
    """Fetch page 1 to fail fast on bad keys / unreachable host before a long
    background import is kicked off. Raises ImportError_ on failure."""
    _fetch_page(host, public_key, secret_key, page=1)


def _fetch_all_generations(host: str, public_key: str, secret_key: str) -> list[dict]:
    """Page through the observations API and collect every GENERATION."""
    observations: list[dict] = []
    page = 1
    while page <= _MAX_PAGES:
        payload = _fetch_page(host, public_key, secret_key, page)
        data = payload.get("data") or []
        if not data:
            break
        observations.extend(data)
        total_pages = (payload.get("meta") or {}).get("totalPages")
        if total_pages and page >= total_pages:
            break
        page += 1
    return observations


def import_langfuse(project: dict, public_key: str, secret_key: str,
                    host: str = DEFAULT_HOST) -> ImportResult:
    """Import a project's Langfuse history. Raises ImportError_ on a whole-import
    failure (auth/host); per-observation failures are counted, not fatal."""
    # Local import avoids a router import cycle (ingest imports adapters/services).
    from routers.ingest import process_canonical

    result = ImportResult()
    seen = _existing_external_ids(project["id"])

    observations = _fetch_all_generations(host, public_key, secret_key)
    # Oldest-first so baselines/evolution cutoffs build in chronological order.
    observations.sort(key=lambda o: o.get("startTime") or "")

    for obs in observations:
        result.fetched += 1
        ext = str(obs["id"]) if obs.get("id") else None
        if ext and ext in seen:
            result.skipped += 1
            continue
        trace = observation_to_canonical(obs)
        if trace is None:
            continue  # not a generation (shouldn't happen — API filtered — but safe)
        try:
            process_canonical(trace, project, suppress_alerts=True, synchronous=True)
            result.imported += 1
            if ext:
                seen.add(ext)
        except Exception:
            result.errors += 1
            log.error(f"[import] failed to ingest observation {ext}", exc_info=True)

    log.info(f"[import] project={project['id']} {result.as_dict()}")
    return result
