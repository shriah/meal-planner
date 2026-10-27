/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/client';
import { is } from '@/planner';
import { dayRule, defaultRules, pairingRule } from '@/rules';
import { RuleList } from './RuleList';

const scrollIntoView = vi.fn();
beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const stored = (r: object) => ({ enabled: true, created_at: '', ...r }) as never;

beforeEach(async () => {
  await Promise.all([db.rules.clear(), db.components.clear(), db.categories.clear(), db.notices.clear()]);
  const defaults = defaultRules();
  await db.rules.bulkAdd([
    stored({ name: 'No paneer on weekdays', spec: { template: 'exclude', params: { match: is('protein_tag', 'paneer'), strength: 'must' } } }),
    stored({ name: 'Fish Fridays', spec: { template: 'exclude', params: { match: is('protein_tag', 'fish'), strength: 'must' } } }),
    stored(defaults.find((r) => r.default_key === 'variety')!),
    stored(defaults.find((r) => r.default_key === 'want-curry')!),
    stored(pairingRule({ id: 1, name: 'Sambar' }, [1])),
    stored(dayRule({ id: 2, name: 'Pulao' }, ['saturday', 'sunday'])),
  ]);
});

const detailsOf = (summary: string) => screen.getByText(summary).closest('details')!;

describe('RuleList', () => {
  it('lists the user\'s rules, with planner defaults tucked into a collapsed section, and no dish settings', async () => {
    render(<RuleList />);

    expect(await screen.findByRole('heading', { name: 'Your rules' })).toBeInTheDocument();
    expect(screen.getByText('No paneer on weekdays')).toBeInTheDocument();
    expect(detailsOf('Planner defaults (2)')).not.toHaveAttribute('open');
    expect(within(detailsOf('Planner defaults (2)')).getByText('Vary dishes across the week')).toBeInTheDocument();
    expect(screen.queryByText(/Dish settings/)).not.toBeInTheDocument();
    expect(screen.queryByText('Pulao: only on certain days')).not.toBeInTheDocument();
    expect(screen.getByText('4 rules · 4 active')).toBeInTheDocument();
  });

  it('filters every section by name or description and opens the sections that have matches', async () => {
    render(<RuleList />);
    await screen.findByRole('heading', { name: 'Your rules' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search rules' }), 'vary dishes');

    expect(screen.queryByRole('heading', { name: 'Your rules' })).not.toBeInTheDocument();
    expect(detailsOf('Planner defaults (1)')).toHaveAttribute('open');
    expect(screen.getByText('Vary dishes across the week')).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search rules' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search rules' }), 'never include dishes with paneer');
    expect(screen.getByText('No paneer on weekdays')).toBeInTheDocument();
    expect(screen.queryByText('Fish Fridays')).not.toBeInTheDocument();
  });

  it('says so when nothing matches, instead of showing empty sections', async () => {
    render(<RuleList />);
    await screen.findByRole('heading', { name: 'Your rules' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search rules' }), 'zzz');

    expect(screen.getByText('No rules match “zzz”')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your rules' })).not.toBeInTheDocument();
  });

  it('restores the missing planner defaults and reports how many came back', async () => {
    render(<RuleList />);
    await screen.findByRole('heading', { name: 'Your rules' });

    await userEvent.click(within(detailsOf('Planner defaults (2)')).getByRole('button', { name: 'Restore defaults' }));

    expect(await screen.findByText('Restored 8 default rules')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Planner defaults (10)')).toBeInTheDocument());

    await userEvent.click(within(detailsOf('Planner defaults (10)')).getByRole('button', { name: 'Restore defaults' }));
    expect(await screen.findByText('All default rules are already there')).toBeInTheDocument();
    expect(await db.rules.count()).toBe(2 + 10 + 2);
  });

  it('still offers the defaults when every one has been deleted', async () => {
    await db.rules.filter((r) => !!r.default_key).delete();
    render(<RuleList />);

    expect(await screen.findByText('Planner defaults (0)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(await screen.findByText('Restored 10 default rules')).toBeInTheDocument();
  });

  it('opens the planner defaults for a default rule, and does nothing for a rule that is gone', async () => {
    const variety = (await db.rules.toArray()).find((r) => r.default_key === 'variety')!;
    window.location.hash = `#rule-${variety.id}`;
    const { unmount } = render(<RuleList />);
    await waitFor(() => expect(detailsOf('Planner defaults (2)')).toHaveAttribute('open'));
    unmount();

    window.location.hash = '#rule-99999';
    render(<RuleList />);
    await screen.findByRole('heading', { name: 'Your rules' });
    expect(detailsOf('Planner defaults (2)')).not.toHaveAttribute('open');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('opens the assistant in a side sheet from "Ask assistant"', async () => {
    localStorage.clear();
    render(<RuleList />);
    await screen.findByRole('heading', { name: 'Your rules' });

    await userEvent.click(screen.getByRole('button', { name: 'Ask assistant' }));

    const sheet = await screen.findByRole('dialog', { name: 'Rules assistant' });
    expect(within(sheet).getByLabelText('Gemini API key')).toBeInTheDocument();
    expect(within(sheet).getByText(/kept in this browser in plain text/)).toBeInTheDocument();
  });
});
