-- Per-project tuning for the systemic-incident detector. Run in Supabase SQL Editor.
--
-- systemic_enabled     — turn incident detection on/off (like every other sink).
-- systemic_window_min  — look-back window (minutes) for the distinct-run count.
-- systemic_min_runs    — distinct runs firing the same (step, code) to open one.
--
-- Defaults match services/systemic_service constants (10 min, 5 runs), so
-- behaviour is unchanged until a project overrides them. Additive + defaulted.
--
-- NOTE: an absolute min_runs is volume-sensitive (5 is noise for a busy project,
-- never fires for a quiet one). A future rate-based threshold removes the guess.

ALTER TABLE "PROJECTS"
    ADD COLUMN IF NOT EXISTS systemic_enabled    boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS systemic_window_min  int    NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS systemic_min_runs    int    NOT NULL DEFAULT 5;
