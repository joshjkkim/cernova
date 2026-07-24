/**
 * Thin typed client over the Cernova Read API (backend/routers/read.py).
 *
 * Deliberately does no shaping beyond the HTTP call — the tool layer decides how
 * results are rendered for a model. Auth is the same project API key used to send
 * traces, passed as a bearer token.
 */

export interface TraceCall {
  id: string;
  run_id?: string | null;
  step_name?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  latency_ms?: number | null;
  cost?: number | null;
  status: string;
  error?: string | null;
  anomalous: boolean;
  source?: string | null;
  created_at?: string | null;
  // Call-site provenance — null for OTel imports and pre-0.1.6 SDKs.
  code_filepath?: string | null;
  code_lineno?: number | null;
  code_function?: string | null;
  commit_sha?: string | null;
}

export interface AnomalyCode {
  code: number;
  name: string;
  penalty: number;
  // Why it fired. `expected` is the rule that was violated; `observed` is the
  // actual value. Null for pre-migration rows, and `observed` is never recorded
  // for output_format codes (it would be model output text).
  observed?: unknown;
  expected?: unknown;
}

export interface AnomalyStep {
  step_name: string;
  score: number;
  codes: AnomalyCode[];
}

export interface AnomalyRunSummary {
  run_id: string;
  total_score: number;
  level: string;
  triggered: boolean;
  steps: AnomalyStep[];
  latest_at?: string | null;
}

export interface Page<T> {
  schema_version: number;
  object: string;
  data: T[];
  has_more: boolean;
  next_cursor?: string | null;
}

export interface RunDetail {
  schema_version: number;
  run_id: string;
  calls: TraceCall[];
  anomaly?: AnomalyRunSummary | null;
  cost_total: number;
  tokens_total: number;
  latency_total_ms: number;
}

/** Raised for any non-2xx; the message is what the model sees, so keep it actionable. */
export class ReadApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ReadApiError';
  }
}

export class CernovaClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  private async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = new URL(path, this.apiUrl.endsWith('/') ? this.apiUrl : this.apiUrl + '/');
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    } catch (cause) {
      // Network-level failure: almost always a wrong/unreachable CERNOVA_API_URL.
      throw new ReadApiError(0, `Could not reach Cernova at ${url.origin} — ${(cause as Error).message}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint =
        res.status === 401 ? ' (check CERNOVA_API_KEY)'
        : res.status === 404 ? ''
        : ` — ${body.slice(0, 200)}`;
      throw new ReadApiError(res.status, `Read API returned ${res.status}${hint}`);
    }
    return res.json() as Promise<T>;
  }

  listAnomalies(p: {
    limit?: number; cursor?: string; since?: string;
    level?: string; step_name?: string;
  }): Promise<Page<AnomalyRunSummary>> {
    return this.get('v1/anomalies', p);
  }

  listCalls(p: {
    limit?: number; cursor?: string; since?: string; step_name?: string;
    run_id?: string; model?: string; status?: string; anomalous?: boolean;
  }): Promise<Page<TraceCall>> {
    return this.get('v1/calls', p);
  }

  getRun(runId: string): Promise<RunDetail> {
    return this.get(`v1/runs/${encodeURIComponent(runId)}`);
  }
}
