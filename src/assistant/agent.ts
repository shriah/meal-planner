// The assistant's agent loop: local guardrails first, then Gemini with tools, under a hard step cap.
// Never writes to the database: drafts and comparisons leave as effect events for the user to review.
import { GeminiError, type GeminiCall, type GeminiContent, type GeminiPart } from './gemini';
import { HISTORY_TURNS, MAX_OUTPUT_TOKENS, MAX_TOOL_CALLS, clampMessage } from './limits';
import { REFUSAL, SYSTEM_PROMPT, looksOffTopic, wrapData } from './prompt';
import { buildSlice, type AssistantData } from './retrieve';
import { TOOL_DECLARATIONS, runTool } from './tools';
import type { AssistantEffect, CompareFn } from './types';

export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'effect'; effect: AssistantEffect }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface AgentDeps {
  gemini: GeminiCall;
  limiter: { tryAcquire(): boolean };
  compare: CompareFn;
}

export const RATE_LIMITED_TEXT = 'You are asking too quickly; wait a minute and try again.';
export const TOO_MANY_STEPS_TEXT = 'That took too many steps. Try asking a simpler question.';
export const NO_CHANGE_TEXT = 'This rule would not change the week.';
export const ERROR_MESSAGES: Record<GeminiError['kind'], string> = {
  auth: 'Check your Gemini key.',
  rate: 'Gemini is rate limiting, try again shortly.',
  network: "Couldn't reach Gemini.",
  other: 'Something went wrong talking to Gemini.',
};

const TOOL_RESULT_LABEL = 'tool result';

/** A turn starts at a user content carrying the user's own text, never at a functionResponse. */
const startsTurn = (c: GeminiContent) =>
  c.role === 'user' && c.parts.some((p) => 'text' in p) && !c.parts.some((p) => 'functionResponse' in p);

/** Keeps the last `HISTORY_TURNS` whole turns, so a functionCall is never separated from its response. */
export function trimHistory(history: GeminiContent[], turns = HISTORY_TURNS): GeminiContent[] {
  const starts = history.flatMap((c, i) => (startsTurn(c) ? [i] : []));
  if (starts.length === 0 || turns <= 0) return [];
  const from = starts[Math.max(0, starts.length - turns)];
  return history.slice(from);
}

const isAbortError = (e: unknown) => e instanceof Error && e.name === 'AbortError';

type PendingCall = { name: string; args: unknown; thoughtSignature?: string };

export async function* runAssistant(
  input: { message: string; history: GeminiContent[]; data: AssistantData; apiKey: string; signal?: AbortSignal },
  deps: AgentDeps,
): AsyncGenerator<AssistantEvent> {
  const { data, apiKey, signal } = input;
  const aborted = () => signal?.aborted === true;
  if (aborted()) return;

  const message = clampMessage(input.message);
  if (!deps.limiter.tryAcquire()) {
    yield { type: 'error', message: RATE_LIMITED_TEXT };
    return;
  }

  const slice = buildSlice(message, data);
  if (looksOffTopic(message, slice)) {
    yield { type: 'text', text: REFUSAL };
    yield { type: 'done' };
    return;
  }

  const contents: GeminiContent[] = [
    ...trimHistory(input.history),
    { role: 'user', parts: [{ text: message }, { text: wrapData('context', slice) }] },
  ];
  const ctx = { data, compare: deps.compare };
  let toolCalls = 0;

  for (;;) {
    if (aborted()) return;
    const calls: PendingCall[] = [];
    let text = '';
    try {
      const stream = deps.gemini({
        apiKey,
        system: SYSTEM_PROMPT,
        contents: contents.map((c) => ({ ...c, parts: [...c.parts] })),
        tools: TOOL_DECLARATIONS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        signal,
      });
      for await (const ev of stream) {
        if (aborted()) return;
        if (ev.type === 'text') {
          text += ev.text;
          yield { type: 'text', text: ev.text };
        } else if (ev.type === 'toolCall') {
          calls.push({ name: ev.name, args: ev.args, ...(ev.thoughtSignature ? { thoughtSignature: ev.thoughtSignature } : {}) });
        }
      }
    } catch (e) {
      if (aborted() || isAbortError(e)) return;
      yield { type: 'error', message: e instanceof GeminiError ? ERROR_MESSAGES[e.kind] : ERROR_MESSAGES.other };
      return;
    }
    if (aborted()) return;

    if (calls.length === 0) {
      yield { type: 'done' };
      return;
    }

    const modelParts: GeminiPart[] = text ? [{ text }] : [];
    const responses: GeminiPart[] = [];
    for (const call of calls) {
      if (toolCalls >= MAX_TOOL_CALLS) {
        yield { type: 'text', text: TOO_MANY_STEPS_TEXT };
        yield { type: 'done' };
        return;
      }
      toolCalls++;
      const result = await runTool(call.name, call.args, ctx);
      if (aborted()) return;
      if (result.ok && result.effect) {
        yield { type: 'effect', effect: result.effect };
        if (result.effect.kind === 'comparison' && result.effect.comparison.identical) {
          yield { type: 'text', text: NO_CHANGE_TEXT };
          yield { type: 'done' };
          return;
        }
      }
      modelParts.push({
        functionCall: { name: call.name, args: call.args },
        ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
      });
      responses.push({
        functionResponse: {
          name: call.name,
          response: { result: wrapData(TOOL_RESULT_LABEL, result.ok ? result.data : { error: result.error }) },
        },
      });
    }
    contents.push({ role: 'model', parts: modelParts }, { role: 'user', parts: responses });
  }
}
