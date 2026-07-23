// Shared data-model types for the project dashboard. Kept in one place so the
// page, its tab components, and the onboarding/demo module all agree on shapes.

export type Tab = 'overview' | 'logs' | 'runs' | 'anomalies' | 'steps' | 'usage' | 'settings';

export interface Call {
  id: string | number;
  run_id?: string;
  step_index?: number;
  step_name?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
  cost?: number;
  status_success?: boolean;
  prompt?: string;
  output_code?: string;
  error?: string;
  created_at?: string;
  project_id?: string;
}

export interface KeySpec {
  name: string;
  presence: number;            // fraction of JSON outputs containing this key
  types: string[];             // JSON types seen for this key
  enum_values?: string[] | null;
  num_min?: number | null;
  num_max?: number | null;
}

export interface ContractRow {
  step_profile_id: string;
  step_name: string | null;
  status: 'observing' | 'proposed' | 'enforced' | 'rejected';
  format: string | null;
  json_rate?: number | null;
  required_keys: string[];
  keys?: Record<string, KeySpec>;
  sample_count: number | null;
}

export interface MetricTrend {
  metric: string;
  baseline_mean: number;
  recent_mean: number;
  sigma: number;
  direction: 'up' | 'down';
}

export interface StepHealthRow {
  step_profile_id: string;
  step_name: string;
  status: 'warming' | 'healthy' | 'degrading' | 'critical';
  sample_count: number;
  trends: MetricTrend[];
}

export interface AnomalyRow {
  id: number;
  step_name: string;
  run_id: string;
  project_id: string | null;
  error_code: number;
  penalty_score: number;
  created_at: string;
}

// A systemic incident: the same condition hit many runs at once (backend
// services/systemic_service). The macro-scale sibling of a per-run anomaly.
export interface Incident {
  id: number;
  step_name: string | null;
  error_code: number;
  run_count: number;
  window_min: number;
  status: string;
  opened_at: string;
}
