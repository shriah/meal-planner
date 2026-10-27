/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AppNav } from './AppNav';

afterEach(cleanup);

describe('AppNav', () => {
  it('opens the assistant in a side sheet from "Ask assistant"', async () => {
    localStorage.clear();
    render(<AppNav />);

    await userEvent.click(screen.getByRole('button', { name: 'Ask assistant' }));

    const sheet = await screen.findByRole('dialog', { name: 'Rules assistant' });
    expect(within(sheet).getByLabelText('Gemini API key')).toBeInTheDocument();
    expect(within(sheet).getByText(/kept in this browser in plain text/)).toBeInTheDocument();
  });
});
