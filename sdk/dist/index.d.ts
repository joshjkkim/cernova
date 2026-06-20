import { MessageCreateParamsNonStreaming, Message } from '@anthropic-ai/sdk/resources/messages';

interface TraceOptions {
    stepName?: string;
    projectId?: number;
}
interface TraceConfig {
    apiKey: string;
    runId?: string;
    projectId?: number;
    /** Override the ingest endpoint. Defaults to trace-ai's servers. For local dev only. */
    apiUrl?: string;
}
interface TracePayload {
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

interface AnthropicClientLike {
    messages: {
        create(params: MessageCreateParamsNonStreaming, options?: unknown): Promise<Message>;
    };
}
type TracedMessageParams = MessageCreateParamsNonStreaming & {
    _trace?: TraceOptions;
};
interface TracedAnthropicMessages {
    create(params: TracedMessageParams): Promise<Message>;
}
interface TracedAnthropic {
    messages: TracedAnthropicMessages;
}

declare class Tracer {
    private readonly apiUrl;
    private readonly apiKey;
    readonly runId: string;
    readonly projectId: number | undefined;
    constructor(config: TraceConfig);
    ingest(payload: TracePayload): void;
    wrapAnthropic(client: AnthropicClientLike): TracedAnthropic;
}

declare function getCost(model: string, inputTokens: number, outputTokens: number): number;

export { type TraceConfig, type TraceOptions, type TracePayload, type TracedAnthropic, type TracedMessageParams, Tracer, getCost };
