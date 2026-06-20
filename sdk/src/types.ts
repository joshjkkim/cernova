export interface TraceOptions {
  stepName?: string;
  projectId?: number;
}

export interface TraceConfig {
  apiKey: string;
  runId?: string;
  projectId?: number;
  /** Override the ingest endpoint. Defaults to trace-ai's servers. For local dev only. */
  apiUrl?: string;
}

export interface TracePayload {
  run_id: string;
  step_name: string;
  model: string;
  prompt: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost: number;
  status_success: boolean;
  output_code?: string;
  project_id?: number;
  error?: string;
}