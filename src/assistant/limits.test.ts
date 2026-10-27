import { describe, expect, it } from 'vitest';
import { clampMessage, createRateLimiter, MAX_INPUT_CHARS, MAX_OUTPUT_TOKENS } from './limits';

describe('createRateLimiter', () => {
  it('allows 6 calls per window, refuses the 7th, then allows again after the window', () => {
    let t = 0;
    const limiter = createRateLimiter(undefined, () => t);
    for (let i = 0; i < 6; i++) expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    t = 59_999;
    expect(limiter.tryAcquire()).toBe(false);
    t = 60_000;
    expect(limiter.tryAcquire()).toBe(true);
  });
});

describe('clampMessage', () => {
  it('cuts to the input cap', () => {
    expect(MAX_INPUT_CHARS).toBe(500);
    expect(clampMessage('a'.repeat(900)).length).toBe(500);
  });
  it('trims whitespace', () => {
    expect(clampMessage('  hi  ')).toBe('hi');
  });
});

describe('MAX_OUTPUT_TOKENS', () => {
  it('leaves room for a reply after any thinking', () => {
    expect(MAX_OUTPUT_TOKENS).toBe(2048);
  });
});
