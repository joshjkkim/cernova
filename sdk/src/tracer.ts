import type { TraceConfig, TracePayload } from './types';
import { wrapAnthropic, type TracedAnthropic, type AnthropicClientLike } from './wrappers/anthropic';
import { wrapOpenAI, type TracedOpenAI, type OpenAIClientLike } from './wrappers/openai';
import { resolveSourceRoot, detectCommitSha } from './callsite';
import { uuid } from './uuid';

const DEFAULT_API_URL = 'https://trace-production-940c.up.railway.app';

/** Version of the ingest wire format this SDK speaks. */
const SCHEMA_VERSION = 1;

export class Tracer {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  readonly runId: string;
  /** Resolved once; used to relativize captured call-site paths. */
  readonly sourceRoot: string;
  /** Commit the running code was built from; anchors captured line numbers. */
  readonly commitSha: string | undefined;

  constructor(config: TraceConfig) {
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.runId = config.runId ?? uuid();
    this.commitSha = config.commitSha ?? detectCommitSha();
    const resolved = resolveSourceRoot(config.sourceRoot);
    this.sourceRoot = resolved.root;
    if (process.env.CERNOVA_CALLSITE_DEBUG) {
      console.log(`[cernova] sourceRoot = ${resolved.root} (via ${resolved.how})`);
    }
  }

  ingest(payload: TracePayload): Promise<string | null> {
    return fetch(`${this.apiUrl}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ schema_version: SCHEMA_VERSION, ...payload }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { trace_id: string }) => data.trace_id ?? null)
      .catch((err: unknown) => {
        console.warn('[cernova] ingest failed:', err);
        return null;
      });
  }

  wrapAnthropic(client: AnthropicClientLike): TracedAnthropic {
    return wrapAnthropic(client, this);
  }

  wrapOpenAI(client: OpenAIClientLike): TracedOpenAI {
    return wrapOpenAI(client, this);
  }
}
