-- Provenance + idempotency for CALLS.
-- Run in Supabase SQL Editor.
--
-- Adds where a call came from (source) and its stable id in the origin system
-- (external_id). Importers set external_id to the Langfuse/LangSmith trace id so
-- re-running an import can't duplicate rows; live SDK/OTel ingest leaves it NULL.
--
-- The partial unique index only covers rows that carry an external_id, so live
-- ingest (external_id IS NULL) is never constrained — only imports are deduped.

ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'cernova-sdk';
ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_external
    ON "CALLS" (project_id, source, external_id)
    WHERE external_id IS NOT NULL;
