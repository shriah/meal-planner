// Browser-side streaming client for the Gemini REST API. Plain fetch, no SDK.
// The API key travels in the x-goog-api-key header, never in the URL.

export const GEMINI_MODEL = 'gemini-3.8-flash';

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: unknown }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: unknown } };

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export type ToolDeclaration = { name: string; description: string; parameters?: object };

export type GeminiEvent =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; name: string; args: unknown; thoughtSignature?: string }
  | { type: 'done'; finishReason?: string };

export class GeminiError extends Error {
  kind: 'auth' | 'rate' | 'network' | 'model' | 'other';
  constructor(kind: GeminiError['kind'], message: string) {
    super(message);
    this.name = 'GeminiError';
    this.kind = kind;
  }
}

export type GeminiCall = (req: {
  apiKey: string;
  system: string;
  contents: GeminiContent[];
  tools: ToolDeclaration[];
  maxOutputTokens: number;
  signal?: AbortSignal;
}) => AsyncGenerator<GeminiEvent>;

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

/** How long to wait for Gemini to start answering before giving up (an overloaded model can hang). */
export const FIRST_BYTE_TIMEOUT_MS = 30_000;

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

const BLOCK_REASONS = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

/** Events in one SSE data line; the candidate's finishReason, if any, is recorded on `seen`. */
function eventsFromData(json: string, seen: { finishReason?: string }): GeminiEvent[] {
  let parsed: {
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: (GeminiPart & { thoughtSignature?: string })[] } }[];
  };
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (parsed.error) {
    throw new GeminiError('other', parsed.error.message || 'Gemini returned an error.');
  }
  const out: GeminiEvent[] = [];
  const candidate = parsed.candidates?.[0];
  if (candidate?.finishReason) seen.finishReason = candidate.finishReason;
  for (const part of candidate?.content?.parts ?? []) {
    if ('functionCall' in part && part.functionCall) {
      const ev: GeminiEvent = { type: 'toolCall', name: part.functionCall.name, args: part.functionCall.args };
      if (part.thoughtSignature) ev.thoughtSignature = part.thoughtSignature;
      out.push(ev);
    } else if ('text' in part && part.text) {
      out.push({ type: 'text', text: part.text });
    }
  }
  const blocked =
    parsed.promptFeedback?.blockReason ||
    (candidate?.finishReason && BLOCK_REASONS.has(candidate.finishReason));
  if (blocked && out.length === 0) throw new GeminiError('other', 'Gemini blocked this response.');
  return out;
}

export async function* streamGemini(
  req: Parameters<GeminiCall>[0],
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<GeminiEvent> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    generationConfig: { maxOutputTokens: req.maxOutputTokens },
  };
  if (req.tools.length > 0) body.tools = [{ functionDeclarations: req.tools }];

  // Aborts on the caller's signal, or when no response headers arrive in time.
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  req.signal?.addEventListener('abort', onAbort);
  if (req.signal?.aborted) ac.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, FIRST_BYTE_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    if (timedOut) throw new GeminiError('rate', 'Gemini took too long to answer.');
    if (isAbort(e)) return;
    throw new GeminiError('network', 'Could not reach Gemini.');
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onAbort);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GeminiError('auth', 'Gemini rejected the API key.');
    }
    if (res.status === 400) {
      const text = await res.text().catch(() => '');
      if (/API_KEY_INVALID|API key/i.test(text)) {
        throw new GeminiError('auth', 'Gemini rejected the API key.');
      }
      throw new GeminiError('other', 'Gemini rejected the request.');
    }
    if (res.status === 404) throw new GeminiError('model', "The Gemini model isn't available to this key.");
    if (res.status === 429 || res.status === 503) throw new GeminiError('rate', 'Gemini rate limit reached.');
    throw new GeminiError('other', `Gemini returned HTTP ${res.status}.`);
  }
  if (!res.body) throw new GeminiError('other', 'Gemini returned no body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const seen: { finishReason?: string } = {};
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data:')) yield* eventsFromData(line.slice(5).trim(), seen);
      }
    }
    buffer += decoder.decode();
    if (buffer.startsWith('data:')) yield* eventsFromData(buffer.slice(5).trim(), seen);
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if (isAbort(e)) return;
    throw new GeminiError('network', 'Connection to Gemini was interrupted.');
  } finally {
    reader.cancel().catch(() => {});
  }
  yield seen.finishReason ? { type: 'done', finishReason: seen.finishReason } : { type: 'done' };
}
