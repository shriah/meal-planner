// The converted parts (Base, Curry, Subzi, Extras; ids 1 to 4) as rules compile against them, for tests.
import type { LegacyParts, RuleParts } from './legacy-parts';

export const TEST_RULE_PARTS: RuleParts & { legacy: LegacyParts } = {
  list: [
    { id: 1, name: 'Base', varied: true },
    { id: 2, name: 'Curry', varied: true },
    { id: 3, name: 'Subzi', varied: true },
    { id: 4, name: 'Extras', varied: false },
  ],
  legacy: { base: 1, curry: 2, subzi: 3, extra: 4 },
};
