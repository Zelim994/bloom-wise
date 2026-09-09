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

    // Supabase CLI local E2E runtime state: a minified edge-runtime bundle the
    // CLI writes on `npm run e2e:db:start`. It is not project source. ESLint
    // does not read .gitignore, so the rule there does not cover this.
    "e2e/supabase/.temp/**",
  ]),
]);

export default eslintConfig;
