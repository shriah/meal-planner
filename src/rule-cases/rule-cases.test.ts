// One test per case in the rule case library. A known failure does not fail the run; one that starts
// passing does, so the list of known issues stays honest.
import { describe, expect, it } from 'vitest';
import { ALL_CASES } from './cases';
import { runPlanCase } from './run';

describe('rule cases', () => {
  for (const c of ALL_CASES) {
    it(c.name, () => {
      const r = runPlanCase(c);
      if (r.status === 'known-now-passes') expect.fail(`Known issue now passes: remove \`known\` from ${c.id}`);
      if (r.status === 'fail') {
        const failed = r.expectations.filter((e) => !e.pass).map((e) => `${e.says} (got ${e.got})`);
        expect.fail(`${c.id} failed:\n- ${failed.join('\n- ')}`);
      }
    });
  }
});
