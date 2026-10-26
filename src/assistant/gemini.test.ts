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

  it.each([[400], [403]])('maps HTTP %i to auth', async (status) => {
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
});
