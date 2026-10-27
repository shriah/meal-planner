/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { runSeed } from '@/db/seed';
import { is, TRUE } from '@/planner';
import { GeminiError, type GeminiCall, type GeminiEvent } from '@/assistant/gemini';
import { getApiKey, setApiKey } from '@/assistant/key-store';
import { MAX_INPUT_CHARS } from '@/assistant/limits';
import { AssistantPanel } from './AssistantPanel';

type Req = Parameters<GeminiCall>[0];

/** Scripted fake: each call plays the next script; records every request. Never touches the network. */
function fakeGemini(scripts: ((req: Req) => AsyncGenerator<GeminiEvent>)[]) {
  const calls: Req[] = [];
  const gemini: GeminiCall = (req) => {
    calls.push({ ...req, contents: structuredClone(req.contents) });
    const script = scripts[calls.length - 1];
    if (!script) throw new Error(`unexpected Gemini call #${calls.length}`);
    return script(req);
  };
  return { gemini, calls };
}

const say = (...texts: string[]) => async function* (): AsyncGenerator<GeminiEvent> {
  for (const text of texts) yield { type: 'text', text };
  yield { type: 'done' };
};
const callTool = (name: string, args: unknown) => async function* (): AsyncGenerator<GeminiEvent> {
  yield { type: 'toolCall', name, args };
  yield { type: 'done' };
};

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { open, opened };
}

const input = () => screen.getByRole('textbox', { name: 'Ask the assistant' });
const send = () => screen.getByRole('button', { name: 'Send' });
async function ask(text: string) {
  await userEvent.type(input(), text);
  await userEvent.click(send());
}

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((t) => t.clear()));
  await runSeed();
});
afterEach(() => cleanup());

describe('AssistantPanel: key', () => {
  it('without a key shows the key prompt with the storage notice, and makes no request', async () => {
    const { gemini, calls } = fakeGemini([]);
    render(<AssistantPanel gemini={gemini} />);

    expect(screen.getByText(/kept in this browser in plain text/)).toBeInTheDocument();
    expect(screen.getByText(/sent to Google with each question/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ask the assistant' })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('after pasting a key, a question streams text into the chat as it arrives', async () => {
    const g = gate();
    const { gemini, calls } = fakeGemini([
      async function* () {
        yield { type: 'text', text: 'Hello' };
        await g.opened;
        yield { type: 'text', text: ' there' };
        yield { type: 'done' };
      },
    ]);
    render(<AssistantPanel gemini={gemini} />);

    await userEvent.type(screen.getByLabelText('Gemini API key'), '  "my-key"  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(getApiKey()).toBe('my-key');

    await ask('which rules mention idli?');
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(send()).toBeDisabled();
    await act(async () => g.open());
    expect(await screen.findByText('Hello there')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].apiKey).toBe('my-key');
    await waitFor(() => expect(input()).toBeEnabled());
  });

  it('lets the key be changed or removed once set', async () => {
    setApiKey('old-key');
    render(<AssistantPanel gemini={fakeGemini([]).gemini} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gemini key' }));
    await userEvent.type(screen.getByLabelText('Gemini API key'), 'new-key');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(getApiKey()).toBe('new-key');
    expect(input()).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gemini key' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(getApiKey()).toBeNull();
    expect(screen.getByLabelText('Gemini API key')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove key' })).not.toBeInTheDocument();
  });
});

describe('AssistantPanel: chat', () => {
  beforeEach(() => setApiKey('test-key'));

  it('submits on Enter, adds a newline on Shift+Enter, and disables Send while empty or running', async () => {
    const g = gate();
    const { gemini, calls } = fakeGemini([
      async function* () { await g.opened; yield { type: 'text', text: 'ok' }; yield { type: 'done' }; },
    ]);
    render(<AssistantPanel gemini={gemini} />);

    expect(send()).toBeDisabled();
    await userEvent.type(input(), 'rules for idli{Shift>}{Enter}{/Shift}please');
    expect(input()).toHaveValue('rules for idli\nplease');
    expect(calls).toHaveLength(0);
    expect(screen.getByText(`${'rules for idli\nplease'.length}/${MAX_INPUT_CHARS}`)).toBeInTheDocument();

    await userEvent.type(input(), '{Enter}');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(input()).toHaveValue('');
    await userEvent.type(input(), 'another rule');
    expect(send()).toBeDisabled();
    await userEvent.type(input(), '{Enter}');
    expect(calls).toHaveLength(1);

    await act(async () => g.open());
    await waitFor(() => expect(send()).toBeEnabled());
  });

  it('limits input to the maximum length and shows the counter', async () => {
    render(<AssistantPanel gemini={fakeGemini([]).gemini} />);
    expect(input()).toHaveAttribute('maxLength', String(MAX_INPUT_CHARS));
    expect(screen.getByText(`0/${MAX_INPUT_CHARS}`)).toBeInTheDocument();
  });

  it('shows an error as a chat message that ends the turn and re-enables input', async () => {
    const { gemini } = fakeGemini([
      async function* (): AsyncGenerator<GeminiEvent> { throw new GeminiError('auth', 'bad key'); },
    ]);
    render(<AssistantPanel gemini={gemini} />);

    await ask('which rules mention idli?');
    expect(await screen.findByText('Check your Gemini key.')).toBeInTheDocument();
    await userEvent.type(input(), 'again about rules');
    expect(send()).toBeEnabled();
  });

  it('sends earlier turns as text-only history with the next question', async () => {
    const { gemini, calls } = fakeGemini([
      callTool('list_rules', {}),
      say('First answer'),
      say('Second answer'),
    ]);
    render(<AssistantPanel gemini={gemini} />);

    await ask('list my rules');
    expect(await screen.findByText('First answer')).toBeInTheDocument();
    await waitFor(() => expect(send()).toBeDisabled());
    await ask('and the idli rules?');
    expect(await screen.findByText('Second answer')).toBeInTheDocument();

    expect(calls).toHaveLength(3);
    const history = calls[2].contents.slice(0, 2);
    expect(history).toEqual([
      { role: 'user', parts: [{ text: 'list my rules' }] },
      { role: 'model', parts: [{ text: 'First answer' }] },
    ]);
  });

  it('renders model and user text as plain text, never as HTML', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { gemini } = fakeGemini([say(payload, ' rules')]);
    const { container } = render(<AssistantPanel gemini={gemini} />);

    await ask(`rules ${payload}`);
    expect(await screen.findByText(`${payload} rules`)).toBeInTheDocument();
    expect(screen.getByText(`rules ${payload}`)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('aborts the in-flight request when unmounted', async () => {
    let signal: AbortSignal | undefined;
    const { gemini } = fakeGemini([
      async function* (req) {
        signal = req.signal;
        yield { type: 'text', text: 'partial' };
        await new Promise<void>((resolve) => req.signal?.addEventListener('abort', () => resolve()));
      },
    ]);
    const { unmount } = render(<AssistantPanel gemini={gemini} />);

    await ask('which rules mention idli?');
    expect(await screen.findByText('partial')).toBeInTheDocument();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe('AssistantPanel: drafts and comparisons', () => {
  beforeEach(() => setApiKey('test-key'));

  it('opens a proposed rule in the editor, and saves nothing until Save is clicked', async () => {
    const idli = (await db.components.toArray()).find((c) => c.name === 'Idli')!;
    const rulesBefore = await db.rules.count();
    const { gemini } = fakeGemini([
      callTool('propose_rule', { name: 'No Idli', spec: { template: 'exclude', params: { match: is('id', idli.id) } } }),
      say('Draft ready.'),
    ]);
    render(<AssistantPanel gemini={gemini} />);

    await ask('never idli');
    await userEvent.click(await screen.findByRole('button', { name: 'Review rule' }));
    expect(await screen.findByLabelText(/Rule name/)).toHaveValue('No Idli');
    expect(await db.rules.count()).toBe(rulesBefore);

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    await waitFor(async () => expect(await db.rules.count()).toBe(rulesBefore + 1));
    expect((await db.rules.toArray()).some((r) => r.name === 'No Idli')).toBe(true);
  });

  it('opens a proposed dish in the library form, prefilled, without saving it', async () => {
    const baseCategory = (await db.categories.toArray()).find((c) => c.kind === 'base')!;
    const componentsBefore = await db.components.count();
    const { gemini } = fakeGemini([
      callTool('propose_dish', { name: 'Brand New Dosa Thing', componentType: 'base', base_category: baseCategory.name }),
      say('Dish drafted.'),
    ]);
    render(<AssistantPanel gemini={gemini} />);

    await ask('add a dosa dish');
    await userEvent.click(await screen.findByRole('button', { name: 'Review dish' }));
    expect(await screen.findByDisplayValue('Brand New Dosa Thing')).toBeInTheDocument();
    expect(await db.components.count()).toBe(componentsBefore);
  });

  it('shows the before and after weeks, highlights changes, and warns when the week gets worse', async () => {
    const { gemini } = fakeGemini([
      callTool('simulate_with_rule', { name: 'No food', spec: { template: 'exclude', params: { match: TRUE } } }),
      say('That would leave meals empty.'),
    ]);
    render(<AssistantPanel gemini={gemini} />);

    await ask('simulate a rule excluding every dish');
    expect(await screen.findByText('That would leave meals empty.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Before' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'After' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-changed="true"]').length).toBeGreaterThan(0);
    expect(screen.getByText(/makes the week worse/)).toBeInTheDocument();
  });
});
