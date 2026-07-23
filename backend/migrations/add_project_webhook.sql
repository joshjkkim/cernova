-- Generic outbound webhook per project.
-- Run in Supabase SQL Editor.
--
-- webhook_url          — where to POST the anomaly event payload (any endpoint).
-- webhook_secret       — per-project HMAC-SHA256 signing key; sent as the
--                        X-Cernova-Signature header so the receiver can verify.
-- webhook_anomaly_level — critical | warning | none, mirroring slack_anomaly_level.
--
-- This is the "alerts out to anywhere" sink alongside Slack and Sentry: when an
-- anomaly fires, the structured event is delivered to webhook_url.

ALTER TABLE "PROJECTS" ADD COLUMN IF NOT EXISTS webhook_url           text;
ALTER TABLE "PROJECTS" ADD COLUMN IF NOT EXISTS webhook_secret        text;
ALTER TABLE "PROJECTS" ADD COLUMN IF NOT EXISTS webhook_anomaly_level text DEFAULT 'critical';
