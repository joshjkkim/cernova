"""Prototype: unsupervised discovery of semantic trace/failure modes.

Embeds real stored outputs (CALLS.output_code) and clusters them with HDBSCAN to
see whether coherent behavioural modes emerge with zero labels — the core of
"ML-based trace classification and clustering". Read-only research spike.

    cd backend && .venv/bin/python -m research.trace_clustering
"""

from __future__ import annotations

import collections
import json

import numpy as np
from sklearn.cluster import HDBSCAN

from db import get_client
from services.fingerprinter import _embed


def user_msg(prompt: str | None) -> str:
    """Best-effort pull of the user's message from a stored prompt JSON."""
    if not prompt:
        return ""
    try:
        obj = json.loads(prompt)
        msgs = obj.get("messages", [])
        for m in reversed(msgs):
            if m.get("role") == "user":
                return " ".join(str(m.get("content", "")).split())
    except Exception:
        pass
    return " ".join(prompt.split())


def main() -> None:
    db = get_client()
    rows = (db.table("CALLS").select("id,step_name,prompt,output_code")
            .limit(2000).execute().data or [])
    rows = [r for r in rows if r.get("output_code")]
    print(f"{len(rows)} calls with output\n")

    # Embed the OUTPUT — what the model actually produced.
    texts = [r["output_code"] for r in rows]
    X = np.array([_embed(t) for t in texts])

    # HDBSCAN on normalized embeddings: dense regions = modes, -1 = noise/outliers.
    labels = HDBSCAN(min_cluster_size=6, min_samples=3, metric="euclidean").fit_predict(X)

    n_clusters = len({l for l in labels if l != -1})
    n_noise = int((labels == -1).sum())
    print(f"discovered {n_clusters} clusters | {n_noise} outliers (noise)\n")

    by_cluster: dict[int, list[int]] = collections.defaultdict(list)
    for i, l in enumerate(labels):
        by_cluster[int(l)].append(i)

    for cid in sorted(by_cluster, key=lambda c: (c == -1, -len(by_cluster[c]))):
        idxs = by_cluster[cid]
        steps = collections.Counter(rows[i].get("step_name") for i in idxs)
        head = "OUTLIERS" if cid == -1 else f"CLUSTER {cid}"
        print(f"── {head}  ({len(idxs)} calls)  steps={dict(steps.most_common(3))}")
        for i in idxs[:2]:
            out = " ".join(str(rows[i]["output_code"]).split())[:110]
            q   = user_msg(rows[i].get("prompt"))[:60]
            print(f"     q: {q!r}")
            print(f"     →  {out!r}")
        print()


if __name__ == "__main__":
    main()
