import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import type { Tracer } from '../tracer';
import type { TraceOptions } from '../types';
import { getCost } from '../cost';

export interface AnthropicClientLike {
  messages: {
    create(params: MessageCreateParamsNonStreaming, options?: unknown): Promise<Message>;
  };
}

export type TracedMessageParams = MessageCreateParamsNonStreaming & {
  _trace?: TraceOptions;
};

export interface TracedAnthropicMessages {
  create(params: TracedMessageParams): Promise<Message>;
}

export interface TracedAnthropic {
  messages: TracedAnthropicMessages;
}

function extractOutputCode(response: Message): string | undefined {
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
  return text.length > 0 ? text : undefined;
}

export function wrapAnthropic(client: AnthropicClientLike, tracer: Tracer): TracedAnthropic {
  return {
    messages: {
      async create(params: TracedMessageParams): Promise<Message> {
        const { _trace, ...cleanParams } = params;
        const stepName  = _trace?.stepName  ?? 'anthropic.messages.create';
        const projectId = _trace?.projectId ?? tracer.projectId;
        const start     = Date.now();

        try {
          const response = await client.messages.create(
            cleanParams as MessageCreateParamsNonStreaming,
          );

          const latency_ms    = Date.now() - start;
          const input_tokens  = response.usage?.input_tokens  ?? 0;
          const output_tokens = response.usage?.output_tokens ?? 0;
          const total_tokens  = input_tokens + output_tokens;
          const model         = response.model ?? cleanParams.model;

          tracer.ingest({
            run_id: tracer.runId,
            step_name: stepName,
            model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens,
            output_tokens,
            total_tokens,
            latency_ms,
            cost: getCost(model, input_tokens, output_tokens),
            status_success: true,
            output_code: extractOutputCode(response),
            project_id: projectId,
          });

          return response;
        } catch (err: unknown) {
          const latency_ms = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);

          tracer.ingest({
            run_id: tracer.runId,
            step_name: stepName,
            model: cleanParams.model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            latency_ms,
            cost: 0,
            status_success: false,
            project_id: projectId,
            error: message,
          });

          throw err;
        }
      },
    },
  };
}