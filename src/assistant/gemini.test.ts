import { describe, expect, it } from 'vitest';
import { GeminiError, streamGemini, type GeminiEvent } from './gemini';

const enc = new TextEncoder();

function sseResponse(chunks: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status });
}

const data = (o: unknown) => `data: ${JSON.stringify(o)}\r\n\r\n`;
const textChunk = (t: string) => data({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });

const req = {
  apiKey: 'SECRET-KEY',
  system: 'sys',
  contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
  tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
  maxOutputTokens: 64,
};

async function collect(gen: AsyncGenerator<GeminiEvent>) {
  const out: GeminiEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('streamGemini', () => {
  it('yields text events then done, handling chunks split mid-line', async () => {
    const full = textChunk('Hel') + textChunk('lo');
    const f = async () => sseResponse([full.slice(0, 20), full.slice(20)]);
    expect(await collect(streamGemini(req, f as typeof fetch))).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done' },
    ]);
  });

  it('yields a toolCall for functionCall parts', async () => {
    const chunk = data({ candidates: [{ content: { parts: [{ functionCall: { name: 'x', args: { a: 1 } } }] } }] });
    const f = async () => sseResponse([chunk]);
    expect(await collect(streamGemini(req, f as typeof fetch))).toEqual([
      { type: 'toolCall', name: 'x', args: { a: 1 } },
      { type: 'done' },
    ]);
  });

  it.each([[401], [403]])('maps HTTP %i to auth', async (status) => {
    const f = async () => new Response('no', { status });
    await expect(collect(streamGemini(req, f as typeof fetch))).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps 429 to rate', async () => {
    const f = async () => new Response('slow', { status: 429 });
    await expect(collect(streamGemini(req, f as typeof fetch))).rejects.toMatchObject({ kind: 'rate' });
  });

  it('maps other statuses to other', async () => {
    const f = async () => new Response('boom', { status: 500 });
    const p = collect(streamGemini(req, f as typeof fetch));
    await expect(p).rejects.toBeInstanceOf(GeminiError);
    await expect(collect(streamGemini(req, f as typeof fetch))).rejects.toMatchObject({ kind: 'other' });
  });

  it('maps 404 to model, saying the model is not available to this key', async () => {
    const f = async () => new Response('not found', { status: 404 });
    await expect(collect(streamGemini(req, f as typeof fetch))).rejects.toMatchObject({ kind: 'model' });
  });

  it('carries the last finishReason on the done event', async () => {
    const f = async () => sseResponse([textChunk('a'), data({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })]);
    expect(await collect(streamGemini(req, f as typeof fetch))).toEqual([
      { type: 'text', text: 'a' },
      { type: 'done', finishReason: 'MAX_TOKENS' },
    ]);
  });

  it('maps a rejected fetch to network', async () => {
    const f = async () => {
      throw new TypeError('failed');
    };
    await expect(collect(streamGemini(req, f as typeof fetch))).rejects.toMatchObject({ kind: 'network' });
  });

  it('stops quietly when the signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const f = async (_u: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return sseResponse([textChunk('x')]);
    };
    expect(await collect(streamGemini({ ...req, signal: ac.signal }, f as typeof fetch))).toEqual([]);
  });

  it('keeps the key out of the URL and sends the expected body', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const f = async (u: unknown, i?: RequestInit) => {
      url = String(u);
      init = i;
      return sseResponse([]);
    };
    await collect(streamGemini(req, f as typeof fetch));
    expect(url).not.toContain('SECRET-KEY');
    expect(url).toContain('alt=sse');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET-KEY');
    const body = JSON.parse(String(init?.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(body.tools).toEqual([{ functionDeclarations: req.tools }]);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 64 });
  });

  it('omits tools when empty', async () => {
    let init: RequestInit | undefined;
    const f = async (_u: unknown, i?: RequestInit) => {
      init = i;
      return sseResponse([]);
    };
    await collect(streamGemini({ ...req, tools: [] }, f as typeof fetch));
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('tools');
  });

  it('maps 400 to auth only when the body says the API key is invalid', async () => {
    const bad = async () => new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 });
    await expect(collect(streamGemini(req, bad as typeof fetch))).rejects.toMatchObject({ kind: 'auth' });
    const other = async () => new Response('{"error":{"message":"bad schema"}}', { status: 400 });
    await expect(collect(streamGemini(req, other as typeof fetch))).rejects.toMatchObject({ kind: 'other' });
  });

  it('passes thoughtSignature through on toolCall events', async () => {
    const chunk = data({
      candidates: [{ content: { parts: [{ functionCall: { name: 'x', args: {} }, thoughtSignature: 'sig' }] } }],
    });
    const f = async () => sseResponse([chunk]);
    expect(await collect(streamGemini(req, f as typeof fetch))).toEqual([
      { type: 'toolCall', name: 'x', args: {}, thoughtSignature: 'sig' },
      { type: 'done' },
    ]);
  });

  it('throws other on an error chunk in a 200 stream', async () => {
    const f = async () => sseResponse([data({ error: { message: 'overloaded' } })]);
    await expect(collect(streamGemini(req, f as typeof fetch))).rejects.toMatchObject({
      kind: 'other',
      message: 'overloaded',
    });
  });

  it('throws other on blocked chunks', async () => {
    const pf = async () => sseResponse([data({ promptFeedback: { blockReason: 'SAFETY' } })]);
    await expect(collect(streamGemini(req, pf as typeof fetch))).rejects.toMatchObject({ kind: 'other' });
    const fr = async () => sseResponse([data({ candidates: [{ finishReason: 'SAFETY' }] })]);
    await expect(collect(streamGemini(req, fr as typeof fetch))).rejects.toMatchObject({ kind: 'other' });
  });

  it('skips malformed data lines', async () => {
    const f = async () => sseResponse(['data: {oops\n\n', textChunk('ok')]);
    expect(await collect(streamGemini(req, f as typeof fetch))).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'done' },
    ]);
  });

  it('handles a multi-byte character split across chunks and two events in one chunk', async () => {
    const bytes = enc.encode(textChunk('caf\u00e9') + textChunk('!'));
    const cut = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const f = async () => new Response(body);
    expect(await collect(streamGemini(req, f as typeof fetch))).toEqual([
      { type: 'text', text: 'caf\u00e9' },
      { type: 'text', text: '!' },
      { type: 'done' },
    ]);
  });

  it('stops without GeminiError when aborted mid-stream', async () => {
    const ac = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(textChunk('a')));
        ac.signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
      },
    });
    const f = async () => new Response(body);
    const out: GeminiEvent[] = [];
    for await (const e of streamGemini({ ...req, signal: ac.signal }, f as typeof fetch)) {
      out.push(e);
      ac.abort();
    }
    expect(out).toEqual([{ type: 'text', text: 'a' }]);
  });
});
