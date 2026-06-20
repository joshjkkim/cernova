from fastapi import FastAPI, HTTPException

from db import check_connection
from routers import ingest, traces

app = FastAPI(title="Trace API", version="0.1.0")

app.include_router(ingest.router)
app.include_router(traces.router)


@app.get("/health")
def health() -> dict:
    try:
        db = check_connection()
        return {"status": "ok", "database": "connected", **db}
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection failed: {exc}",
        ) from exc
