"""Central logging setup. Call configure_logging() once at startup (main.py).

Everywhere else, do `log = logging.getLogger(__name__)` and use log.info /
log.warning / log.error. Keep the existing `[tag]` prefixes in messages so
Railway logs read the same — the tags mark the pipeline stage (ingest,
anomaly, contract, fingerprint, …), the level marks severity.

Level is controlled by the LOG_LEVEL env var (default INFO).
"""

import logging
import os


def configure_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    # uvicorn installs its own handlers; keep ours from being double-silenced.
    logging.getLogger("cernova").setLevel(getattr(logging, level, logging.INFO))
