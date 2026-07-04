-- Feedback / confirmation store: human judgments on Cernova's detections.
-- Run in Supabase SQL Editor.
--
-- Every confirmation (a contract enforced, an anomaly marked a false alarm, a
-- diagnosis rated) is captured here as a structured label — the raw material for
-- per-user tuning now and a proprietary detection model later. Capture-now data:
-- it can't be backfilled.

CREATE TABLE IF NOT EXISTS feedback (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid REFERENCES "PROJECTS"(id) ON DELETE CASCADE,
    subject_type text        NOT NULL,   -- contract | anomaly | diagnosis
    subject_id   text        NOT NULL,   -- step_profile_id | anomaly id | run_id
    verdict      text        NOT NULL,   -- confirm | reject
    detail       jsonb,                  -- optional structured context (which rule, why)
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback (project_id);
CREATE INDEX IF NOT EXISTS idx_feedback_subject ON feedback (subject_type, subject_id);
