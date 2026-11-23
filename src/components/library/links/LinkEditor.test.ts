import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/client';
import { legacyPartIds, type LegacyParts } from '@/db/parts';
import { ensurePartsAndTagGroups } from '@/db/parts-store';
import { capRules, type LinkTarget, type RuleRecord } from '@/rules';
import type { PartRecord } from '@/types/part';
import { cappedOf } from '../LibraryLookup';
import { waitParts } from './LinkEditor';

let parts: PartRecord[];
let P: LegacyParts;
let capped: Set<number>;
const into = (type: keyof LegacyParts): LinkTarget => ({ part: P[type], kind: 'dish' });

beforeEach(async () => {
  ({ parts } = await ensurePartsAndTagGroups());
  parts = [...parts].sort((a, b) => a.position - b.position);
  P = legacyPartIds(parts);
  // A converted library caps the curry and the subzi at one per meal.
  await db.rules.clear();
  await db.rules.bulkAdd(capRules(parts).map((r) => ({ ...r, enabled: true, created_at: '' })) as RuleRecord[]);
  capped = cappedOf({ parts, rules: await db.rules.toArray() });
});

describe('waitParts on a converted library', () => {
  it('lets a link to extras wait on curry and subzi', () => {
    expect(waitParts({ parts }, capped, 'comes', into('extra'), P.base)).toEqual([P.curry, P.subzi]);
  });

  it('lets a link to subzi wait on curry', () => {
    expect(waitParts({ parts }, capped, 'comes', into('subzi'), P.base)).toEqual([P.curry]);
  });

  it('lets a link to curry wait on nothing', () => {
    expect(waitParts({ parts }, capped, 'comes', into('curry'), P.base)).toEqual([]);
  });

  it('offers no picker to a link to the first part', () => {
    expect(waitParts({ parts }, capped, 'comes', into('base'), P.base)).toEqual([]);
  });

  it('offers no picker to a dish that is not in the first part', () => {
    for (const owner of [P.curry, P.subzi, P.extra]) {
      for (const type of ['curry', 'subzi', 'extra'] as const) {
        expect(waitParts({ parts }, capped, 'comes', into(type), owner), `${owner} -> ${type}`).toEqual([]);
      }
    }
  });

  it('offers no picker to a link that is not a comes link', () => {
    for (const mode of ['serve', 'with', 'never'] as const) {
      expect(waitParts({ parts }, capped, mode, into('extra'), P.base)).toEqual([]);
    }
  });

  it('skips a part the rules do not cap', () => {
    expect(waitParts({ parts }, new Set([P.subzi]), 'comes', into('extra'), P.base)).toEqual([P.subzi]);
  });
});
