-- Core trace logging schema: metrics in traces, prompt in inputs, code in outputs.
-- Run in Supabase SQL Editor or via supabase db push.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER NOT NULL,
  cost_usd DOUBLE PRECISION,
  context_limit INTEGER,
  context_utilization DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  finish_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_traces_run_id ON traces (run_id);
CREATE INDEX idx_traces_created_at ON traces (created_at DESC);

CREATE TABLE inputs (
  trace_id UUID PRIMARY KEY REFERENCES traces (id) ON DELETE CASCADE,
  user_input TEXT NOT NULL,
  system_prompt TEXT,
  full_prompt TEXT NOT NULL
);

CREATE TABLE outputs (
  trace_id UUID PRIMARY KEY REFERENCES traces (id) ON DELETE CASCADE,
  code TEXT
);
