// Rules are pure domain logic: no React, Dexie or app services.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ALLOWED = [/^zod$/, /^\.\.?\//, /^@\/planner$/, /^@\/types\/component$/];
const TEST_ONLY = [/^vitest$/, /^fs$/, /^path$/];

describe('rules isolation', () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith('.ts'));
  it.each(files)('%s imports only allowed modules', (file) => {
    const src = readFileSync(join(__dirname, file), 'utf8');
    for (const [, spec] of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const ok = ALLOWED.some((re) => re.test(spec)) || (file.endsWith('.test.ts') && TEST_ONLY.some((re) => re.test(spec)));
      expect(ok, `${file} imports ${spec}`).toBe(true);
    }
  });
});
