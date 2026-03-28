// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSearchParams = {
  get: vi.fn(() => 'fish-fridays'),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/services/food-db', () => ({
  addRule: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => []),
}));

const { RuleForm } = await import('./RuleForm');

describe('RuleForm', () => {
  afterEach(() => {
    cleanup();
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
});
