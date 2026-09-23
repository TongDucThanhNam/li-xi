import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    // Locally ignored reviewer dispatch workspace (not product code/tests).
    ".zcode-dispatch/**",
    // Playwright transient reports and traces (screenshots baselines under
    // tests/ui/*.snapshots/ stay linted as tracked references).
    "tests/ui/artifacts/**",
    "tests/ui/reports/**",
    ".output/**",
    ".nitro/**",
    "dist/**",
    "build/**",
    "routeTree.gen.ts",
    "convex/_generated/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-undef": "off",
    },
  },
]);
