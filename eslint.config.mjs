import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config, required by ESLint 9 / Next 16. Replaces the old
// .eslintrc.json, which only extended next/core-web-vitals — both presets
// below are that same ruleset plus the TypeScript rules.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
