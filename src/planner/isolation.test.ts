// The planner is headless: it may import zod, its own files, and pure domain types only.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ALLOWED = [/^zod$/, /^\.\.?\//, /^@\/types\/component$/, /^vitest$/, /^fs$/, /^path$/, /^@\/db\/seed-data$/];
// Only tests may use the test runner, node modules and the seed fixture.
const TEST_ONLY = [/^vitest$/, /^fs$/, /^path$/, /^@\/db\/seed-data$/];

describe('planner isolation', () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it.each(files)('%s imports only allowed modules', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const specifiers = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const isTest = file.endsWith('.test.ts');
    for (const spec of specifiers) {
      expect(ALLOWED.some((re) => re.test(spec)), `${file} imports ${spec}`).toBe(true);
      if (!isTest) expect(TEST_ONLY.some((re) => re.test(spec)), `${file} imports test-only ${spec}`).toBe(false);
    }
  });
});
