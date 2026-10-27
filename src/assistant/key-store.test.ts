/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearApiKey, getApiKey, setApiKey } from './key-store';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('key store', () => {
  it('round-trips set, get and clear', () => {
    expect(getApiKey()).toBeNull();
    setApiKey('abc');
    expect(getApiKey()).toBe('abc');
    clearApiKey();
    expect(getApiKey()).toBeNull();
  });

  it('trims whitespace and surrounding quotes', () => {
    setApiKey('  "abc"  ');
    expect(getApiKey()).toBe('abc');
  });

  it('ignores an empty key', () => {
    setApiKey('abc');
    setApiKey('   ');
    expect(getApiKey()).toBe('abc');
  });

  it('returns null when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getApiKey()).toBeNull();
  });
});
