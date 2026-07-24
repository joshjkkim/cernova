import { MessageCreateParamsNonStreaming, Message } from '@anthropic-ai/sdk/resources/messages';

interface TraceOptions {
    stepName?: string;
}
interface TraceConfig {
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
interface TracePayload {
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
    code_filepath?: string;
    code_lineno?: number;
    code_function?: string;
    commit_sha?: string;
}
/** Minimal shape we need from a streaming response — the real MessageStream satisfies this. */
interface MessageStreamLike {
    finalMessage(): Promise<Message>;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
}
interface AnthropicClientLike {
    messages: {
        create(params: MessageCreateParamsNonStreaming, options?: unknown): Promise<Message>;
        stream?(params: MessageCreateParamsNonStreaming, options?: unknown): MessageStreamLike;
    };
}
type TracedMessageParams = MessageCreateParamsNonStreaming & {
    _trace?: TraceOptions;
};
type TracedStreamParams = MessageCreateParamsNonStreaming & {
    _trace?: TraceOptions;
};

declare class TracedRun {
    private readonly client;
    private readonly tracer;
    readonly runId: string;
    readonly messages: {
        create(params: TracedMessageParams): Promise<Message>;
        stream(params: TracedStreamParams): MessageStreamLike;
    };
    private stepIndex;
    constructor(client: AnthropicClientLike, tracer: Tracer);
    private _create;
    private _stream;
}

interface TracedAnthropicMessages {
    create(params: TracedMessageParams): Promise<Message>;
    stream(params: TracedStreamParams): MessageStreamLike;
}
interface TracedAnthropic {
    messages: TracedAnthropicMessages;
    /** Start a new run — fresh run_id, step_index resets to 0. */
    run(): TracedRun;
}

interface OpenAIMessage {
    role: string;
    content: string | null;
}
interface OpenAIChatParams {
    model: string;
    messages: OpenAIMessage[];
    [key: string]: unknown;
    _trace?: {
        stepName?: string;
    };
}
interface OpenAIChatResponse {
    id: string;
    model: string;
    choices: Array<{
        message: OpenAIMessage;
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
interface OpenAIClientLike {
    chat: {
        completions: {
            create(params: Omit<OpenAIChatParams, '_trace'>, options?: unknown): Promise<OpenAIChatResponse>;
        };
    };
}
interface TracedOpenAIChat {
    completions: {
        create(params: OpenAIChatParams): Promise<OpenAIChatResponse>;
    };
}
interface TracedOpenAI {
    chat: TracedOpenAIChat;
}

declare class Tracer {
    private readonly apiUrl;
    private readonly apiKey;
    readonly runId: string;
    /** Resolved once; used to relativize captured call-site paths. */
    readonly sourceRoot: string;
    /** Commit the running code was built from; anchors captured line numbers. */
    readonly commitSha: string | undefined;
    constructor(config: TraceConfig);
    ingest(payload: TracePayload): Promise<string | null>;
    wrapAnthropic(client: AnthropicClientLike): TracedAnthropic;
    wrapOpenAI(client: OpenAIClientLike): TracedOpenAI;
}

declare function getCost(model: string, inputTokens: number, outputTokens: number): number;

/**
 * Call-site capture — records WHERE in the user's code a traced LLM call was made
 * (repo-relative file, line, column, function) so downstream agents (an MCP, a
 * GitHub PR bot) can jump straight to the source instead of grepping the repo.
 *
 * Uses V8's structured stack API (Error.prepareStackTrace + captureStackTrace),
 * which yields typed CallSite objects — no fragile string parsing. Must be called
 * SYNCHRONOUSLY at the entry of a wrapper method, before any `await`: after the
 * first await the caller's frame is gone and only an async reconstruction remains.
 */
interface CallSite {
    /** Repo-relative when a source root is resolvable, else the raw absolute path. */
    file: string;
    line: number;
    column: number;
    function: string;
}
/**
 * Resolve the repo root to strip off captured paths, most-explicit-wins:
 * explicit config → env → nearest .git → nearest package marker → cwd.
 * Called ONCE at Tracer construction.
 */
declare function resolveSourceRoot(explicit?: string): {
    root: string;
    how: string;
};
/** The first stack frame outside the SDK (and node_modules), relativized to `sourceRoot`. */
declare function captureCallSite(sourceRoot: string): CallSite | null;

export { type AnthropicClientLike, type CallSite, type MessageStreamLike, type OpenAIClientLike, type TraceConfig, type TraceOptions, type TracePayload, type TracedAnthropic, type TracedMessageParams, type TracedOpenAI, TracedRun, type TracedStreamParams, Tracer, captureCallSite, getCost, resolveSourceRoot };
