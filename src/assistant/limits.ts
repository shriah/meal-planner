// Guardrail constants for the rules assistant, plus a small client-side rate limiter.

export const MAX_INPUT_CHARS = 500;
export const MAX_TOOL_CALLS = 4;
export const MAX_OUTPUT_TOKENS = 2048;
export const HISTORY_TURNS = 6;
export const MAX_LIST_ITEMS = 20;

export const RATE_LIMIT = { count: 6, windowMs: 60_000 };

export interface RateLimit {
  count: number;
  windowMs: number;
}

/** Sliding window: at most `limit.count` acquisitions in any `limit.windowMs`. */
export function createRateLimiter(
  limit: RateLimit = RATE_LIMIT,
  now: () => number = Date.now,
): { tryAcquire(): boolean } {
  let stamps: number[] = [];
  return {
    tryAcquire() {
      const t = now();
      stamps = stamps.filter((s) => t - s < limit.windowMs);
      if (stamps.length >= limit.count) return false;
      stamps.push(t);
      return true;
    },
  };
}

export function clampMessage(text: string): string {
  return text.trim().slice(0, MAX_INPUT_CHARS);
}
