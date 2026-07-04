"""
Step fingerprinting — semantic identity for LLM calls.

On every ingest, embed the stable instruction kernel (CanonicalTrace.kernel())
with a local sentence-transformers model, and match against known step profiles
for this project using pgvector cosine similarity.

Three outcomes:
  matched  — similarity > 0.92, same step, use existing profile
  evolved  — similarity 0.75–0.92, same step but drifting, keep profile + log
  new      — similarity < 0.75, genuinely new step, create profile
"""

import threading

from db import get_client
from services.embedding_service import embed

MATCH_THRESHOLD = 0.92
EVOLVED_THRESHOLD = 0.75

# Serialize match-or-create per process: concurrent ingest threads that embed
# the same kernel would otherwise all miss the RPC before any INSERT commits
# and create duplicate profiles (thundering herd on cold start).
_profile_lock = threading.Lock()


def _derive_step_name(system_text: str | None) -> str | None:
    """Auto-generate a readable step name from the system prompt if no name was given."""
    if not system_text:
        return None
    words = system_text.split()[:4]
    slug = "-".join(words).lower()
    slug = "".join(c if c.isalnum() or c == "-" else "" for c in slug)
    return slug[:40] or None


def match_or_create_profile(
    project_id: str,
    step_name: str,
    kernel: str,
    system_text: str | None = None,
) -> tuple[str | None, str]:
    """
    Match the pre-extracted instruction kernel (CanonicalTrace.kernel()) against
    this project's step profiles.

    Returns (step_profile_id, status) where status is 'matched', 'evolved', or 'new'.
    Returns (None, 'error') if anything fails — ingest should continue regardless.
    """
    try:
        embedding = embed(kernel)
        db = get_client()

        with _profile_lock:
            return _match_or_create_locked(db, embedding, project_id, step_name, system_text)
    except Exception as exc:
        print(f"[fingerprint] failed for project={project_id} step={step_name}: {exc}")
        return None, "error"


def _match_or_create_locked(
    db, embedding: list[float], project_id: str, step_name: str, system_text: str | None
) -> tuple[str | None, str]:
        result = db.rpc("match_step_profile", {
            "p_project_id": project_id,
            "p_embedding": embedding,
            "p_threshold": EVOLVED_THRESHOLD,
        }).execute()

        if result.data:
            match = result.data[0]
            similarity = match["similarity"]
            profile_id = match["id"]

            status = "matched" if similarity >= MATCH_THRESHOLD else "evolved"

            updates: dict = {"step_name": step_name, "last_seen_at": "now()"}
            if status == "evolved":
                updates["last_evolved_at"] = "now()"
                print(f"[fingerprint] step evolved: {step_name} similarity={similarity:.3f} — baseline reset")

            db.table("step_profiles").update(updates).eq("id", profile_id).execute()
            return profile_id, status

        display_name = step_name if not step_name.startswith("step_") else (
            _derive_step_name(system_text) or step_name
        )
        res = db.table("step_profiles").insert({
            "project_id": project_id,
            "fingerprint": embedding,
            "step_name": display_name,
        }).execute()

        profile_id = res.data[0]["id"]
        print(f"[fingerprint] new step profile: {display_name} id={profile_id}")
        return profile_id, "new"
