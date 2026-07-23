-- Systemic-incident detector (v1). Run in Supabase SQL Editor.
--
-- An incident = the SAME failure (step + condition code) hitting many distinct
-- runs inside a short window. This table records open/resolved incidents and
-- gates alerting (one alert per incident, not per contributing call).
--
-- Shaped fleet-ready from day one: a project-incident is keyed (project, step,
-- code); a future fleet-event is the same row keyed (model, code) with scope
-- 'fleet' and project_id/step_name NULL. No rewrite needed for v2.

CREATE TABLE IF NOT EXISTS incidents (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scope           text        NOT NULL DEFAULT 'project',  -- 'project' (v1) | 'fleet' (v2)
    project_id      uuid,                                    -- NULL for fleet events
    step_name       text,                                    -- NULL for fleet events
    model           text,                                    -- NULL in v1; fleet grouping key later
    error_code      int         NOT NULL,
    run_count       int         NOT NULL,
    window_min      int         NOT NULL,
    status          text        NOT NULL DEFAULT 'open',     -- 'open' | 'resolved'
    opened_at       timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    last_alerted_at timestamptz
);

-- Fast dedup lookup of an open incident for a (project, step, code).
CREATE INDEX IF NOT EXISTS incidents_open_key
    ON incidents (project_id, step_name, error_code, status);

-- Make the windowed distinct-run count over ANOMALIES cheap: v1 checks it on
-- every fired code (sub-threshold warnings included), so this index matters.
CREATE INDEX IF NOT EXISTS anomalies_window
    ON "ANOMALIES" (project_id, error_code, created_at);
