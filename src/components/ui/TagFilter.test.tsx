/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagFilter } from './TagFilter';

afterEach(cleanup);

const setup = (props: Partial<React.ComponentProps<typeof TagFilter>> = {}) => {
  const onToggleDietary = vi.fn();
  const onToggleRegional = vi.fn();
  render(
    <TagFilter dietary={['veg']} regional={['south-indian']} onToggleDietary={onToggleDietary} onToggleRegional={onToggleRegional} {...props} />,
  );
  return { onToggleDietary, onToggleRegional };
};

describe('TagFilter', () => {
  it('renders every dietary and regional tag as a button, pressed only when active', () => {
    setup();
    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'veg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'non-veg' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'south-indian' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'pan-indian' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles from the keyboard', async () => {
    const { onToggleDietary, onToggleRegional } = setup();
    screen.getByRole('button', { name: 'jain' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onToggleDietary).toHaveBeenCalledWith('jain');
    screen.getByRole('button', { name: 'north-indian' }).focus();
    await userEvent.keyboard(' ');
    expect(onToggleRegional).toHaveBeenCalledWith('north-indian');
  });

  it('disables tags that would match nothing, unless they are already active', async () => {
    const { onToggleDietary } = setup({ isDisabled: (kind, tag) => kind === 'dietary' && (tag === 'vegan' || tag === 'veg') });
    expect(screen.getByRole('button', { name: 'vegan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'veg' })).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'vegan' }));
    expect(onToggleDietary).not.toHaveBeenCalled();
  });
});
