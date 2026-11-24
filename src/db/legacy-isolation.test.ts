// The frozen copies are only for the old upgrades: nothing else may import them, or "frozen" stops meaning anything.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const FROZEN = /from\s+['"](?:@\/db\/|\.\/|\.\.\/db\/)?legacy-(?:rules|v14)['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('frozen upgrade copies', () => {
  // v24's converter reads the old stock defaults, to know a default the user never edited.
  it('are imported only by db/client.ts, v24\'s converter and tests under src/db', () => {
    const importers = sourceFiles(SRC)
      .filter((file) => FROZEN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .filter((file) => file !== 'db/client.ts' && file !== 'db/rules-over-parts.ts' && !(file.startsWith('db/') && file.endsWith('.test.ts')) && !/^db\/legacy-(rules|v14)\.ts$/.test(file));
    expect(importers).toEqual([]);
  });

  it('import nothing from src/rules', () => {
    for (const file of ['legacy-rules.ts', 'legacy-v14.ts']) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src, file).not.toMatch(/from\s+['"]@\/rules/);
    }
  });
});
