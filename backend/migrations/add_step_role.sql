-- Step-role classifier (Phase 1): store the predicted role + variance tolerance
-- per step profile. Run in Supabase SQL Editor.
--
-- The role is inferred once, when a step profile is first created, from its
-- system-prompt embedding (see services/step_classifier.py). variance_tolerance
-- is derived from the role and sets the Tukey fence width k in the statistical
-- baseline layer (low=2.0, medium=2.5, high=3.5). Both additive + nullable —
-- existing reads are unaffected, and NULL means "not yet classified" (the engine
-- falls back to the default fence).

ALTER TABLE step_profiles
    ADD COLUMN IF NOT EXISTS role text,
    ADD COLUMN IF NOT EXISTS variance_tolerance text;
