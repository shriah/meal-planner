/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { is } from '@/planner';
import { checkDraftRule, type DraftCheck } from '@/services/planning';
import { RuleEditor } from './RuleEditor';

vi.mock('@/services/planning', () => ({ checkDraftRule: vi.fn() }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (_q: unknown, _d: unknown, initial: unknown) => initial }));

const check = vi.mocked(checkDraftRule);
const issue = (draftIssue: string): DraftCheck => ({ draftProblems: [], otherProblems: [], draftIssue });
const valid = { name: 'No fish', spec: { template: 'exclude', params: { match: is('protein_tag', 'fish') } } } as const;
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  check.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RuleEditor live check', () => {
  it('checks a valid draft 600 ms after the last edit, not before', async () => {
    check.mockResolvedValue(issue('first'));
    render(<RuleEditor initial={valid} onSaved={vi.fn()} />);

    await wait(599);
    expect(check).not.toHaveBeenCalled();
    await wait(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(screen.getByText('This rule would be skipped: first')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check against my library' })).not.toBeInTheDocument();
  });

  it('waits for editing to stop and checks the latest draft', async () => {
    check.mockResolvedValue(issue('ok'));
    render(<RuleEditor initial={valid} onSaved={vi.fn()} />);

    await wait(300);
    fireEvent.click(within(screen.getByRole('group', { name: 'Days' })).getByRole('button', { name: 'Fri' }));
    await wait(300);
    expect(check).not.toHaveBeenCalled();
    await wait(300);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0].spec.params).toMatchObject({ scope: { days: ['friday'] } });
  });

  it('never lets an older result replace a newer one', async () => {
    let finishFirst!: (c: DraftCheck) => void;
    check.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    check.mockResolvedValueOnce(issue('second'));
    render(<RuleEditor initial={valid} onSaved={vi.fn()} />);

    await wait(600);
    fireEvent.click(within(screen.getByRole('group', { name: 'Days' })).getByRole('button', { name: 'Fri' }));
    await wait(600);
    expect(screen.getByText('This rule would be skipped: second')).toBeInTheDocument();

    await act(async () => { finishFirst(issue('first')); });
    expect(screen.getByText('This rule would be skipped: second')).toBeInTheDocument();
    expect(screen.queryByText('This rule would be skipped: first')).not.toBeInTheDocument();
  });

  it('does not check an invalid draft', async () => {
    render(<RuleEditor onSaved={vi.fn()} />);
    await wait(2000);
    expect(check).not.toHaveBeenCalled();
  });
});
