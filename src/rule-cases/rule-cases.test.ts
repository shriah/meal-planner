// One test per case in the rule case library. A known failure does not fail the run; one that starts
// passing does, so the list of known issues stays honest.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ALL_CASES } from './cases';
import { TEST_LIBRARY } from './library';
import { renderReport } from './report';
import { runPlanCase } from './run';
import type { CaseResult } from './types';

const results: CaseResult[] = [];

// `npm run rule-cases` sets the flag and gets a standalone page of this run.
afterAll(() => {
  if (process.env.RULE_CASES_REPORT !== '1') return;
  writeFileSync(path.resolve(process.cwd(), 'rule-cases-report.html'), renderReport(results, TEST_LIBRARY, new Date()));
});

describe('rule cases', () => {
  for (const c of ALL_CASES) {
    it(c.name, () => {
      const r = runPlanCase(c);
      results.push(r);
      if (r.status === 'known-now-passes') expect.fail(`Known issue now passes: remove \`known\` from ${c.id}`);
      if (r.status === 'fail') {
        const failed = r.expectations.filter((e) => !e.pass).map((e) => `${e.says} (got ${e.got})`);
        expect.fail(`${c.id} failed:\n- ${failed.join('\n- ')}`);
      }
    });
  }
});
