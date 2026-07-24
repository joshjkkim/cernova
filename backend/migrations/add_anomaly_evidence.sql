-- Evidence for ANOMALIES — WHY a condition fired, not just that it did.
-- Run in Supabase SQL Editor.
--
-- Every detection layer already computes these (anomaly/schemas.py EvalHit), but
-- routers/ingest.py flattened each hit to {code: penalty} before persisting, so
-- a consumer saw "latency_spike, 100pts" with no way to know how far off it was.
--
--   observed   the actual value that fired the rule — 3400, false, "invalid x-api-key"
--   expected   what the rule wanted — "<= 240", true, ["billing","technical"],
--              or for the statistical layer the full fence description
--
-- jsonb, not text: observed/expected are heterogeneous (number, bool, string,
-- list, dict) and keeping them typed means a UI can format a number as a number.
--
-- PRIVACY: `observed` is deliberately NOT written for the output_format layer,
-- whose observed is an 80-char preview of the model's own output. Storing model
-- output remains a deferred decision — see services/anomaly_service.py.
--
-- Both nullable: contract codes (2010-2012) fold straight into error_map without
-- producing an EvalHit, so they carry no evidence and stay NULL.

ALTER TABLE "ANOMALIES" ADD COLUMN IF NOT EXISTS observed jsonb;
ALTER TABLE "ANOMALIES" ADD COLUMN IF NOT EXISTS expected jsonb;
