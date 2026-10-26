// Browser-side streaming client for the Gemini REST API. Plain fetch, no SDK.
// The API key travels in the x-goog-api-key header, never in the URL.

export const GEMINI_MODEL = 'gemini-3.8-flash';

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: unknown } };

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export type ToolDeclaration = { name: string; description: string; parameters: object };

export type GeminiEvent =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; name: string; args: unknown }
  | { type: 'done' };

export class GeminiError extends Error {
  kind: 'auth' | 'rate' | 'network' | 'other';
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

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

function eventsFromData(json: string): GeminiEvent[] {
  let parsed: { candidates?: { content?: { parts?: GeminiPart[] } }[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const out: GeminiEvent[] = [];
  for (const part of parsed.candidates?.[0]?.content?.parts ?? []) {
    if ('functionCall' in part && part.functionCall) {
      out.push({ type: 'toolCall', name: part.functionCall.name, args: part.functionCall.args });
    } else if ('text' in part && part.text) {
      out.push({ type: 'text', text: part.text });
    }
  }
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

  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if (isAbort(e)) return;
    throw new GeminiError('network', 'Could not reach Gemini.');
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new GeminiError('auth', 'Gemini rejected the API key.');
    }
    if (res.status === 429) throw new GeminiError('rate', 'Gemini rate limit reached.');
    throw new GeminiError('other', `Gemini returned HTTP ${res.status}.`);
  }
  if (!res.body) throw new GeminiError('other', 'Gemini returned no body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data:')) yield* eventsFromData(line.slice(5).trim());
      }
    }
    buffer += decoder.decode();
    if (buffer.startsWith('data:')) yield* eventsFromData(buffer.slice(5).trim());
  } catch (e) {
    if (isAbort(e)) return;
    throw new GeminiError('network', 'Connection to Gemini was interrupted.');
  }
  yield { type: 'done' };
}
