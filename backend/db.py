from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from config import DATABASE_URL


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


def check_connection() -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone()
            cur.execute(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' ORDER BY tablename"
            )
            tables = [r["tablename"] for r in cur.fetchall()]
    return {"ok": row["ok"] == 1, "tables": tables}
