import { defineConfig } from "@playwright/test";

// Repo-owned headless UI runner (Playwright Test, pinned @playwright/test).
// These are UI integration/visual tests over synthetic Convex responses —
// NOT real-backend E2E. Normal runs never update screenshot baselines;
// use `npm run test:ui:update` deliberately and review the diff.
export default defineConfig({
	testDir: ".",
	testMatch: /.*\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	outputDir: "artifacts/test-results",
	reporter: [
		["list"],
		["html", { outputFolder: "reports/html", open: "never" }],
		["json", { outputFile: "reports/ui-results.json" }],
	],
	use: {
		headless: true,
		viewport: { width: 1280, height: 900 },
		locale: "vi-VN",
		timezoneId: "Asia/Ho_Chi_Minh",
		// Motion preference is set per-scope: native no-preference for the
		// gameplay motion coverage, explicit reduce for its suppression test.
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		baseURL: "http://127.0.0.1:3210",
	},
	expect: {
		// One documented consistent baseline environment for now: this Windows
		// checkout, pinned headless Chromium. Review baseline diffs deliberately
		// via `npm run test:ui:update` before accepting them.
		toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
		timeout: 10_000,
	},
	webServer: {
		command: "npm run --silent ui:fixture-server",
		url: "http://127.0.0.1:3210/inventory.html",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
