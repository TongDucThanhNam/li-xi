import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    // `.zcode-dispatch/` is the locally ignored reviewer dispatch workspace;
    // its preserved snapshots are not product tests.
    exclude: [
      ...configDefaults.exclude,
      ".zcode-dispatch/**",
      // Playwright owns tests/ui; its specs must stay out of Vitest discovery.
      "tests/**",
    ],
  },
});
