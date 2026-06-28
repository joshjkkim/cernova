"""Shared sentence-transformer embedding for fingerprinter and behavior vectors.

Model loads once (~80MB, ~1s cold start) and is reused across all callers.
"""

from __future__ import annotations

import threading
from functools import lru_cache

_model_lock = threading.Lock()


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


def embed(text: str) -> list[float]:
    """Return a 384-dim L2-normalized embedding for the given text."""
    with _model_lock:
        model = _get_model()
    return model.encode(text, normalize_embeddings=True).tolist()
