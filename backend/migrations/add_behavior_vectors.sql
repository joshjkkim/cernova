-- Behavioral embedding vectors for L3 drift detection.
-- Run in Supabase SQL editor (same process as add_step_profiles.sql).

ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS behavior_vector vector(778);

CREATE INDEX IF NOT EXISTS idx_calls_behavior_vector ON "CALLS" (step_profile_id)
  WHERE behavior_vector IS NOT NULL;

ALTER TABLE step_profiles ADD COLUMN IF NOT EXISTS goal_type text;
