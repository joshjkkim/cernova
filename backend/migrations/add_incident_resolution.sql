-- Incident auto-resolve. Run in Supabase SQL Editor.
--
-- v1 opened incidents and never closed them: `status` was written 'open' at
-- insert and nothing ever moved it. A project that hit one incident kept a red
-- hero card on the Detections tab forever, and a recurrence months later would
-- re-alert the stale row instead of opening a new incident.
--
-- Resolution is derived, not reported: an incident's `updated_at` is refreshed
-- on every check while it is still systemic, so an `updated_at` that has stopped
-- moving for longer than the incident's own window means the failure stopped.
-- This column just records when we concluded that.
--
-- Additive and nullable — the service degrades to writing `status` alone if this
-- hasn't been run yet, so deploy order doesn't matter.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- The lazy sweep scans a project's OPEN incidents by recency on dashboard reads.
CREATE INDEX IF NOT EXISTS incidents_open_by_update
    ON incidents (project_id, status, updated_at);
