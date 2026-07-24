import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';

export interface TraceOptions {
  stepName?: string;
}

export interface TraceConfig {
  apiKey: string;
  runId?: string;
  /** Override the ingest endpoint. Defaults to cernova's servers. For local dev only. */
  apiUrl?: string;
  /**
   * Repo root used to make captured call-site paths repo-relative. Auto-detected
   * (nearest .git, then package marker, then cwd) when omitted; set this — or the
   * CERNOVA_SOURCE_ROOT env var — when running from a build dir or container where
   * auto-detection can't find the root.
   */
  sourceRoot?: string;
  /**
   * Commit SHA the running code was built from, used to anchor captured line
   * numbers. Auto-detected from CI/deploy env vars (Vercel/GitHub/Railway/…)
   * when omitted.
   */
  commitSha?: string;
}

export interface TracePayload {
  /** Wire-format version. Injected by Tracer.ingest — callers never set it. */
  schema_version?: number;
  run_id: string;
  step_name: string;
  step_index: number;
  model: string;
  prompt: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost: number;
  status_success: boolean;
  output_code?: string;
  error?: string;
  span_id?: string;
  parent_span_id?: string;
  // Call-site provenance — where in the user's code this call was made, so
  // downstream agents can jump straight to the source. Repo-relative path.
  code_filepath?: string;
  code_lineno?: number;
  code_function?: string;
  commit_sha?: string;
}

/** Minimal shape we need from a streaming response — the real MessageStream satisfies this. */
export interface MessageStreamLike {
  finalMessage(): Promise<Message>;
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
}

export interface AnthropicClientLike {
  messages: {
    create(params: MessageCreateParamsNonStreaming, options?: unknown): Promise<Message>;
    stream?(params: MessageCreateParamsNonStreaming, options?: unknown): MessageStreamLike;
  };
}

export type TracedMessageParams = MessageCreateParamsNonStreaming & {
  _trace?: TraceOptions;
};

export type TracedStreamParams = MessageCreateParamsNonStreaming & {
  _trace?: TraceOptions;
};
