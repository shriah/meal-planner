// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CategoryRecord } from '@/types/category';

const mockSearchParams = {
  get: vi.fn(() => 'fish-fridays'),
};
let mockBaseCategories: CategoryRecord[] = [];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/services/food-db', () => ({
  addRule: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => mockBaseCategories),
}));

const { RuleForm } = await import('./RuleForm');

describe('RuleForm', () => {
  afterEach(() => {
    cleanup();
    mockBaseCategories = [];
    mockSearchParams.get.mockClear();
  });

  it('loads shared presets from search params', () => {
    const { getByDisplayValue } = render(<RuleForm />);

    expect(mockSearchParams.get).toHaveBeenCalledWith('preset');
    expect(getByDisplayValue('Fish Fridays')).toBeTruthy();
  });

  it('does not render exclude-extra controls in the create form', () => {
    mockSearchParams.get.mockReturnValueOnce('fish-fridays');

    render(<RuleForm />);

    expect(screen.queryByText('Exclude extra categories')).not.toBeInTheDocument();
    expect(screen.getByText('Require extra categories')).toBeInTheDocument();
  });

  it('waits for the live rice category row before loading the rice preset', () => {
    mockSearchParams.get.mockReturnValue('rice-lunch-dinner');

    const { rerender } = render(<RuleForm />);

    expect(screen.queryByDisplayValue('Rice: lunch and dinner only')).not.toBeInTheDocument();

    mockBaseCategories = [
      { id: 17, kind: 'base', name: 'rice-based', created_at: '2026-03-28T00:00:00.000Z' },
    ];
    rerender(<RuleForm />);

    expect(screen.getByDisplayValue('Rice: lunch and dinner only')).toBeInTheDocument();
  });
});
