/* eslint-disable @typescript-eslint/no-explicit-any -- fixture bridge to the
   page-world fixture API, mirroring tests/ui/fixtures/convex-mock.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * UI integration/visual tests over the ACTUAL AnalyticsFeature (claims queue,
 * per-game and per-channel breakdowns) mounted in tests/ui/fixtures with a
 * real TanStack Router tree and synthetic Convex responses. NOT real-backend
 * tests — the handler contracts live in convex/rewardClaims.test.ts and
 * convex/channelLinkReporting.test.ts. Fixture controls on
 * window.__analyticsFixture change mock data only.
 */

const ANALYTICS_URL = "/analytics.html";
const SCREENSHOT_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"artifacts/screenshots",
);
const EVIDENCE_DIR = process.env.SLICE4BC_EVIDENCE_DIR
	? path.resolve(process.env.SLICE4BC_EVIDENCE_DIR)
	: null;

async function awaitFonts(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

function hasHorizontalOverflow(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
}

/** Uncaught page errors and unexpected console errors fail the suite. */
let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
	pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
	page.on("console", (message) => {
		const url = message.location()?.url ?? "";
		const externalFont =
			/fonts\.(googleapis|gstatic)\.com/.test(url) ||
			/fonts\.(googleapis|gstatic)\.com/.test(message.text());
		if (message.type() === "error" && !externalFont) {
			pageErrors.push(`${message.text()} (${url})`);
		}
	});
});

async function saveEvidence(
	page: Page,
	testInfo: import("@playwright/test").TestInfo,
	name: string,
) {
	await awaitFonts(page);
	const shot = await page.screenshot({ fullPage: true });
	if (EVIDENCE_DIR) {
		mkdirSync(EVIDENCE_DIR, { recursive: true });
		writeFileSync(path.join(EVIDENCE_DIR, `${name}.png`), shot);
	}
	mkdirSync(SCREENSHOT_DIR, { recursive: true });
	await testInfo.attach(name, { contentType: "image/png", body: shot });
}

const fixtureApi = {
	claims(page: Page, campaignId: string): Promise<Array<Record<string, any>>> {
		return page.evaluate(
			([campaignId]) => (window as any).__analyticsFixture.claims(campaignId),
			[campaignId],
		);
	},
	setClaimFulfilled(page: Page, claimId: string, fulfilled: boolean) {
		return page.evaluate(
			([claimId, fulfilled]) =>
				(window as any).__analyticsFixture.setClaimFulfilled(claimId, fulfilled),
			[claimId, fulfilled],
		);
	},
	calls(page: Page, name: string): Promise<Array<Record<string, any>>> {
		return page.evaluate(([name]) => (window as any).__analyticsFixture.calls(name), [name]);
	},
	searchState(page: Page): Promise<{ pathname: string; search: Record<string, any> }> {
		return page.evaluate(() => (window as any).__analyticsRouterState());
	},
};

async function openClaims(page: Page, extraQuery = "") {
	await page.goto(`${ANALYTICS_URL}?view=claims&campaign=campaign-a${extraQuery}`);
	await expect(page.getByRole("heading", { name: "Hàng đợi trao thưởng" })).toBeVisible();
}

test.describe("claims queue", () => {
	test("lists masked claims with filters and URL-persisted search", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openClaims(page);

		// All three campaign-A rows render with masked codes only — the full
		// voucher code never appears in the list payload.
		await expect(page.getByText("Nguyễn Văn A")).toBeVisible();
		await expect(page.getByText("Trần Thị B")).toBeVisible();
		await expect(page.getByText("Lê Văn C")).toBeVisible();
		await expect(page.getByText("••••4821")).toBeVisible();
		await expect(page.getByText("voucher-full-4821")).toHaveCount(0);
		await expect(page.getByText("Đã hiện 3 yêu cầu")).toBeVisible();

		// Status filter persists in validated search params (full aria-label:
		// the grid column resizers also surface the column names).
		await page.getByLabel("Lọc theo trạng thái trao thưởng").selectOption("fulfilled");
		const statusState = await fixtureApi.searchState(page);
		expect(statusState.search.claimsStatus).toBe("fulfilled");
		await expect(page.getByText("Lê Văn C")).toBeVisible();
		await expect(page.getByText("Nguyễn Văn A")).toHaveCount(0);

		// Channel filter deep-link equivalent.
		await page.goto(`${ANALYTICS_URL}?view=claims&campaign=campaign-a&claimsChannel=station`);
		await expect(page.getByText("Trần Thị B")).toBeVisible();
		await expect(page.getByText("Nguyễn Văn A")).toHaveCount(0);

		// Exact-code search: whole code only, case-insensitive.
		await page.goto(`${ANALYTICS_URL}?view=claims&campaign=campaign-a`);
		await page.getByLabel("Tìm đúng mã thưởng").fill("VOUCHER-FULL-4821");
		await page.getByRole("button", { name: "Tìm", exact: true }).click();
		const codeState = await fixtureApi.searchState(page);
		expect(codeState.search.claimsCode).toBe("voucher-full-4821");
		await expect(page.getByText("Nguyễn Văn A")).toBeVisible();
		await expect(page.getByText("Trần Thị B")).toHaveCount(0);

		// A partial code is never a match.
		await page.getByLabel("Tìm đúng mã thưởng").fill("voucher-full");
		await page.getByRole("button", { name: "Tìm", exact: true }).click();
		await expect(page.getByText("Không có yêu cầu khớp bộ lọc")).toBeVisible();
	});

	test("fulfil and undo keep per-row pending state and audit flips", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openClaims(page);
		const row = page.getByRole("row", { name: /Nguyễn Văn A/ });

		await row.getByRole("button", { name: "Đánh dấu đã trao" }).click();
		await expect(row.getByText("Đã trao")).toBeVisible();
		const fulfilCalls = await fixtureApi.calls(page, "rewardClaims:markRewardClaimFulfilled");
		expect(fulfilCalls).toHaveLength(1);
		expect(fulfilCalls[0].claimId).toBe("claim-a-1");

		// The mock store flip is the fixture-side audit trail.
		const stored = await fixtureApi.claims(page, "campaign-a");
		expect(stored.find((claim) => claim.claimId === "claim-a-1")?.fulfilmentState).toBe(
			"fulfilled",
		);

		await row.getByRole("button", { name: "Hoàn tác" }).click();
		await expect(row.getByText("Chờ trao")).toBeVisible();
		const undoCalls = await fixtureApi.calls(page, "rewardClaims:undoRewardClaimFulfilment");
		expect(undoCalls).toHaveLength(1);
		expect(undoCalls[0].claimId).toBe("claim-a-1");
	});

	test("reveal shows the full code only after the explicit owner action", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openClaims(page);
		const row = page.getByRole("row", { name: /Nguyễn Văn A/ });

		await expect(page.getByText("voucher-full-4821")).toHaveCount(0);
		await row.getByRole("button", { name: "Hiện mã" }).click();
		await expect(page.getByText("voucher-full-4821")).toBeVisible();

		await row.getByRole("button", { name: "Ẩn mã" }).click();
		await expect(page.getByText("voucher-full-4821")).toHaveCount(0);
		await expect(page.getByText("••••4821")).toBeVisible();

		// Rows without a code show the plain no-code hint instead of a reveal.
		const physicalRow = page.getByRole("row", { name: /Lê Văn C/ });
		await expect(physicalRow.getByText("Không có mã")).toBeVisible();
		await expect(physicalRow.getByRole("button", { name: "Hiện mã" })).toHaveCount(0);
	});
});

test.describe("games and channels breakdown views", () => {
	test("games view lists per-game funnel rows with template badges", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${ANALYTICS_URL}?view=games&campaign=campaign-a`);
		// Widget titles are plain text; the page H1 carries the view copy.
		await expect(page.getByText("Phân tích theo trò chơi")).toBeVisible();
		const grid = page.getByRole("grid", { name: "Bảng phân tích theo trò chơi" });
		await expect(grid.getByText("Bánh bao lì xì (chính)")).toBeVisible();
		// The li xì row keeps its template label cell.
		await expect(grid.getByText("Lunar Fortune")).toBeVisible();
		// Wheel and scratch keep their template default names, so the row
		// name and badge agree.
		await expect(grid.getByRole("row", { name: /Vòng quay may mắn/ })).toBeVisible();
		await expect(grid.getByRole("row", { name: /Thẻ cào may mắn/ })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Hiệu quả trò chơi" })).toBeVisible();
	});

	test("channels view lists channel rows and per-share-link funnel", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${ANALYTICS_URL}?view=channels&campaign=campaign-a`);
		await expect(page.getByText("Phân tích theo kênh")).toBeVisible();
		const channelGrid = page.getByRole("grid", { name: "Bảng phân tích theo kênh" });
		await expect(channelGrid.getByText("Liên kết công khai")).toBeVisible();
		await expect(channelGrid.getByText("Trạm chơi")).toBeVisible();
		await expect(channelGrid.getByText("Li xì chưa gắn kênh")).toBeVisible();

		await expect(page.getByText("Liên kết chia sẻ")).toBeVisible();
		const linkGrid = page.getByRole("grid", { name: "Bảng liên kết chia sẻ" });
		await expect(linkGrid.getByText("Link QR")).toBeVisible();
		await expect(linkGrid.getByText("Facebook", { exact: true })).toBeVisible();
	});
});

test.describe("overview funnel and rewards share bars", () => {
	test("overview leads with the funnel and ranked share bars", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });

		// All-campaign scope: the funnel card comes first, then three ranked
		// cards (campaigns, games, channels).
		await page.goto(`${ANALYTICS_URL}?view=overview`);
		const funnel = page.getByRole("list", { name: "Phễu chuyển đổi" });
		await expect(funnel).toHaveCount(1);
		await expect(funnel.getByRole("listitem")).toHaveCount(4);
		await expect(page.locator(".admin-perf__kpi").getByText("64%")).toBeVisible();
		const campaignList = page.getByRole("list", { name: "Chiến dịch theo lượt mở" });
		await expect(campaignList.getByRole("listitem").first()).toContainText("Chiến dịch tri ân A");
		await expect(campaignList.getByRole("listitem").first()).toContainText("120");
		await expect(
			page.getByRole("list", { name: "Kênh theo lượt mở" }).getByRole("listitem").first(),
		).toContainText("Liên kết công khai");

		// Campaign scope: the KPI reads campaign A and the campaigns card is
		// gone; the games card leads with the wheel.
		await page.goto(`${ANALYTICS_URL}?view=overview&campaign=campaign-a`);
		await expect(page.locator(".admin-perf__kpi").getByText("65%")).toBeVisible();
		await expect(page.getByRole("list", { name: "Chiến dịch theo lượt mở" })).toHaveCount(0);
		await expect(
			page.getByRole("list", { name: "Trò chơi theo lượt mở" }).getByRole("listitem").first(),
		).toContainText("Vòng quay may mắn");
	});

	test("rewards view: claim rate and rarity share bars", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${ANALYTICS_URL}?view=rewards&campaign=campaign-a`);
		// The claim rate is claims / reward outcomes (78 / 84), no longer
		// claims / opens.
		await expect(page.getByText("93%")).toBeVisible();
		await expect(
			page.getByRole("list", { name: "Cơ cấu phần thưởng theo độ hiếm" }).getByRole("listitem"),
		).toHaveCount(3);
		// Rarity distribution draws share bars, not an axis chart.
		await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
	});
});

test.describe("analytics visual checkpoints (desktop + 390px)", () => {
	// Fixed clock: every displayed date comes from mock data, the pin is
	// insurance for anything Date-driven in the admin chrome.
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30+07:00"));
	});

	test("claims queue checkpoint with revealed code and fulfilled state (desktop)", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		// Deep-link includes an active filter so the capture shows URL-driven
		// filtering, the fulfilled state, and the revealed code together.
		await page.goto(
			`${ANALYTICS_URL}?view=claims&campaign=campaign-a&claimsStatus=fulfilled`,
		);
		await expect(page.getByText("Lê Văn C")).toBeVisible();
		await fixtureApi.setClaimFulfilled(page, "claim-a-2", true);
		const row = page.getByRole("row", { name: /Trần Thị B/ });
		await expect(row).toBeVisible();
		await row.getByRole("button", { name: "Hiện mã" }).click();
		await expect(page.getByText("cash-code-1092")).toBeVisible();
		// Reveal the scrolled-off fulfilment columns so the capture shows the
		// "Đã trao" chips and row actions too.
		await page
			.getByRole("grid", { name: "Bảng yêu cầu nhận thưởng" })
			.evaluate((node) => {
				const container = node.parentElement;
				if (container) container.scrollLeft = container.scrollWidth;
			});
		await saveEvidence(page, testInfo, "analytics-claims-fulfilled-revealed-1440");
		const root = page.getByTestId("analytics-root");
		await expect(root).toHaveScreenshot(`analytics-claims-desktop-${testInfo.project.name}.png`);
	});

	test("games and channels checkpoints (desktop)", async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${ANALYTICS_URL}?view=games&campaign=campaign-a`);
		await expect(page.getByText("Phân tích theo trò chơi")).toBeVisible();
		await saveEvidence(page, testInfo, "analytics-games-1440");
		await expect(page.getByTestId("analytics-root")).toHaveScreenshot(
			`analytics-games-desktop-${testInfo.project.name}.png`,
		);

		await page.goto(`${ANALYTICS_URL}?view=channels&campaign=campaign-a`);
		await expect(page.getByText("Phân tích theo kênh")).toBeVisible();
		await saveEvidence(page, testInfo, "analytics-channels-1440");
		await expect(page.getByTestId("analytics-root")).toHaveScreenshot(
			`analytics-channels-desktop-${testInfo.project.name}.png`,
		);
	});

	test("390px checkpoints: claims, games, channels with no page overflow", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(
			`${ANALYTICS_URL}?view=claims&campaign=campaign-a&claimsStatus=fulfilled`,
		);
		await expect(page.getByText("Lê Văn C")).toBeVisible();
		await fixtureApi.setClaimFulfilled(page, "claim-a-2", true);
		const revealedRow = page.getByRole("row", { name: /Trần Thị B/ });
		await expect(revealedRow).toBeVisible();
		await revealedRow.getByRole("button", { name: "Hiện mã" }).click();
		await expect(page.getByText("cash-code-1092")).toBeVisible();
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await saveEvidence(page, testInfo, "analytics-claims-390");
		await expect(page.getByTestId("analytics-root")).toHaveScreenshot(
			`analytics-claims-390-${testInfo.project.name}.png`,
		);

		await page.goto(`${ANALYTICS_URL}?view=games&campaign=campaign-a`);
		await expect(page.getByText("Phân tích theo trò chơi")).toBeVisible();
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await saveEvidence(page, testInfo, "analytics-games-390");
		await expect(page.getByTestId("analytics-root")).toHaveScreenshot(
			`analytics-games-390-${testInfo.project.name}.png`,
		);

		await page.goto(`${ANALYTICS_URL}?view=channels&campaign=campaign-a`);
		await expect(page.getByText("Phân tích theo kênh")).toBeVisible();
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await saveEvidence(page, testInfo, "analytics-channels-390");
		await expect(page.getByTestId("analytics-root")).toHaveScreenshot(
			`analytics-channels-390-${testInfo.project.name}.png`,
		);
	});
});

test.afterEach(async ({ page }) => {
	if (page.isClosed()) return;
	expect(pageErrors, "no uncaught page or console errors").toEqual([]);
});
