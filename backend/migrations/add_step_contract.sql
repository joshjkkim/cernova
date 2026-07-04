-- Contract system (Pillar 3): store a learned output contract per step profile.
-- Run in Supabase SQL Editor.
--
-- The contract is induced from the step's own output history (see
-- services/contract_learner.py) and travels with the profile alongside its
-- anomaly baseline. Additive + nullable — existing reads are unaffected.

ALTER TABLE step_profiles
    ADD COLUMN IF NOT EXISTS contract jsonb;
