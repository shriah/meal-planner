import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees are separate checkouts, linted in their own tree.
    ".claude/worktrees/**",
  ]),
  {
    // Satori JSX is rendered once to an image (no reconciliation) and its types reject `key`.
    files: ["src/services/export-template.tsx"],
    rules: { "react/jsx-key": "off" },
  },
]);

export default eslintConfig;
