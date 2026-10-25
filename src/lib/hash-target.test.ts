import { describe, expect, it } from 'vitest';
import { parseHash } from './hash-target';

describe('parseHash', () => {
  it('reads a rule or a dish from the URL hash', () => {
    expect(parseHash('#rule-12')).toEqual({ rule: 12 });
    expect(parseHash('#dish-3')).toEqual({ dish: 3 });
  });

  it('ignores anything else', () => {
    for (const hash of ['', '#', '#rule-', '#rule-x', '#rule--4', '#rule-0', '#rule-1.5', '#dish-3x', '#other-3', 'rule-3', '#rule-9999999999999999999']) {
      expect(parseHash(hash), hash).toEqual({});
    }
  });
});
