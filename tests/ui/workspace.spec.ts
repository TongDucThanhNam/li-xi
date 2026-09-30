/* eslint-disable @typescript-eslint/no-explicit-any -- fixture bridge to the
   page-world fixture API, mirroring tests/ui/fixtures/convex-mock.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Real-chrome workspace coverage (Slice 4d-1): the primary workspace routes
 * mount the REAL _workspace AppLayout (HeroUI Pro sidebar, navbar, aside
 * host) in tests/ui/fixtures/workspace.html with the synthetic Convex
 * workspace fixture and a real TanStack Router tree. NOT real-backend tests —
 * handler contracts live in convex/*.test.ts. Acceptance viewports are
 * 1440x900 (content + aside) and 390x844 (single column, no page overflow).
 */

const WORKSPACE_URL = "/workspace.html";
const EVIDENCE_DIR = process.env.ROUTE_UX_EVIDENCE_DIR
	? path.resolve(process.env.ROUTE_UX_EVIDENCE_DIR)
	: null;
const EVIDENCE_DIR_SLICE4D2 = process.env.SLICE4D2_EVIDENCE_DIR
	? path.resolve(process.env.SLICE4D2_EVIDENCE_DIR)
	: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.tmp/slice4d2-evidence");

const ROUTE_STATES: Array<{ heading: string; key: string; query: string }> = [
	{ heading: "Chiến dịch", key: "campaigns", query: "route=campaigns" },
	{
		heading: "Chiến dịch",
		key: "campaigns-empty",
		query: "route=campaigns&campaignsMode=empty",
	},
	{ heading: "Tạo chiến dịch", key: "campaigns-new", query: "route=campaigns-new" },
	{ heading: "Chiến dịch tri ân A", key: "campaign-overview", query: "route=overview" },
	{ heading: "Trò chơi chiến dịch", key: "campaign-games", query: "route=games" },
	{ heading: "Kho phần thưởng", key: "campaign-rewards", query: "route=rewards" },
	{ heading: "Phân phối", key: "campaign-distribution", query: "route=distribution" },
	{ heading: "Bánh bao lì xì (chính)", key: "editor-li-xi", query: "route=editor&game=wf-game-lunar" },
	{ heading: "Vòng quay may mắn", key: "editor-wheel", query: "route=editor&game=wf-game-wheel" },
	{ heading: "Thẻ cào may mắn", key: "editor-scratch", query: "route=editor&game=wf-game-scratch" },
	{ heading: "Máy quay tri ân", key: "editor-slot", query: "route=editor&game=wf-game-slot" },
	{ heading: "Trắc nghiệm tri ân", key: "editor-quiz", query: "route=editor&game=wf-game-quiz" },
	{ heading: "Tổng quan hiệu quả", key: "analytics-overview", query: "route=analytics&view=overview" },
	{ heading: "Hiệu quả trò chơi", key: "analytics-games", query: "route=analytics&view=games" },
	{ heading: "Hiệu quả phần thưởng", key: "analytics-rewards", query: "route=analytics&view=rewards" },
	{ heading: "Hiệu quả kênh chia sẻ", key: "analytics-channels", query: "route=analytics&view=channels" },
	{
		heading: "Hàng đợi trao thưởng",
		key: "analytics-claims",
		query: "route=analytics&view=claims&campaign=campaign-a",
	},
	{ heading: "Thanh toán", key: "settings-billing", query: "route=settings-billing" },
	{ heading: "Tích hợp", key: "settings-integrations", query: "route=settings-integrations" },
	{ heading: "Cài đặt vận hành", key: "settings-operations", query: "route=settings-operations" },
	{
		heading: "Bắt đầu với Campaign Studio",
		key: "onboarding",
		query: "route=onboarding",
	},
	{
		heading: "Bảng vận hành trò chơi",
		key: "operate-li-xi",
		query: "route=operate&game=wf-game-lunar",
	},
	{
		heading: "Trạm tự phục vụ",
		key: "operate-wheel",
		query: "route=operate&game=wf-game-wheel",
	},
];

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
	await page.emulateMedia({ reducedMotion: "reduce" });
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

async function openRoute(page: Page, state: { heading: string; query: string }) {
	await page.goto(`${WORKSPACE_URL}?${state.query}`);
	await page.waitForSelector(".admin-page__inner", { timeout: 20_000 });
	// The page h1; editor previews may repeat the game name in their own
	// region headings, so anchor on the title element.
	await expect(page.locator("h1.admin-page__title").first()).toHaveText(state.heading);
	await awaitFonts(page);
	await page.waitForTimeout(300);
}

async function saveEvidence(
	page: Page,
	testInfo: import("@playwright/test").TestInfo,
	name: string,
) {
	const shot = await page.screenshot();
	if (EVIDENCE_DIR) {
		mkdirSync(EVIDENCE_DIR, { recursive: true });
		writeFileSync(path.join(EVIDENCE_DIR, `${name}.png`), shot);
	}
	await testInfo.attach(name, { contentType: "image/png", body: shot });
}

async function openAside(page: Page) {
	const toggle = page.getByRole("button", { name: "Mở ngữ cảnh trang" });
	if (await toggle.count()) {
		await toggle.click();
		await page.waitForTimeout(400);
	}
}

test.describe("workspace routes render in the real chrome at both acceptance viewports", () => {
	// Fixed clock: displayed dates come from mock data; the pin is insurance
	// for anything Date-driven in the admin chrome.
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30+07:00"));
	});

	test(
		"1440x900: every primary workspace route renders with no page overflow",
		async ({ page }, testInfo) => {
			test.setTimeout(240_000);
			await page.setViewportSize({ width: 1440, height: 900 });
			for (const state of ROUTE_STATES) {
				await openRoute(page, state);
				expect(await hasHorizontalOverflow(page), state.key).toBe(false);
				await saveEvidence(page, testInfo, `workspace-${state.key}-1440`);
				await expect(page).toHaveScreenshot(`workspace-${state.key}-1440.png`);
			}
		},
	);

	test(
		"390x844: every primary workspace route renders with no page overflow",
		async ({ page }, testInfo) => {
			test.setTimeout(240_000);
			await page.setViewportSize({ width: 390, height: 844 });
			for (const state of ROUTE_STATES) {
				await openRoute(page, state);
				expect(await hasHorizontalOverflow(page), state.key).toBe(false);
				await saveEvidence(page, testInfo, `workspace-${state.key}-390`);
				await expect(page).toHaveScreenshot(`workspace-${state.key}-390.png`);
			}
		},
	);
});

test.describe("workspace analytics UX contract (real chrome)", () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30+07:00"));
	});

	test("aside scope picker is view-aware: legacy rarity chart only on overview/rewards", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${WORKSPACE_URL}?route=analytics&view=overview`);
		await page.waitForSelector(".admin-page__inner");
		await openAside(page);
		const aside = page.locator("aside[aria-label='Ngữ cảnh trang']");
		await expect(aside.getByText("Phạm vi chiến dịch")).toBeVisible();
		await expect(aside.getByText("Cơ cấu phần thưởng")).toBeVisible();

		for (const view of ["games", "channels", "claims"]) {
			await page.goto(`${WORKSPACE_URL}?route=analytics&view=${view}`);
			await page.waitForSelector(".admin-page__inner");
			await openAside(page);
			await expect(aside.getByText("Phạm vi chiến dịch")).toBeVisible();
			await expect(aside.getByText("Cơ cấu phần thưởng")).toHaveCount(0);
		}

		// The claims empty state still routes the operator to the aside picker.
		await page.goto(`${WORKSPACE_URL}?route=analytics&view=claims`);
		await page.waitForSelector(".admin-page__inner");
		await openAside(page);
		await expect(page.getByText("Chọn một chiến dịch để xem hàng đợi")).toBeVisible();
	});

	test("claims queue fits 1440 with the aside open: no grid scroll, action visible", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${WORKSPACE_URL}?route=analytics&view=claims&campaign=campaign-a`);
		await page.waitForSelector(".admin-page__inner");
		await openAside(page);

		const grid = page.getByRole("grid", { name: "Bảng yêu cầu nhận thưởng" });
		await expect(grid).toBeVisible();
		const containerBox = await grid.evaluate((node) => {
			const container = node.parentElement;
			if (!container) return null;
			const rect = container.getBoundingClientRect();
			return {
				clientWidth: container.clientWidth,
				scrollWidth: container.scrollWidth,
				right: rect.right,
			};
		});
		expect(containerBox).not.toBeNull();
		// The grid renders no meaningful horizontal scroll: the only possible
		// overhang is the column-resizer handle at the table's right edge.
		expect(containerBox!.scrollWidth).toBeLessThanOrEqual(containerBox!.clientWidth + 12);

		// Status chip and the full fulfil action sit inside the visible area.
		const row = page.getByRole("row", { name: /Nguyễn Văn A/ });
		await expect(row.getByText("Chờ trao")).toBeVisible();
		const action = row.getByRole("button", { name: "Đánh dấu đã trao" });
		await expect(action).toBeVisible();
		const actionRight = (await action.boundingBox())!.x + (await action.boundingBox())!.width;
		expect(actionRight).toBeLessThanOrEqual(containerBox!.right + 1);
	});

	test("analytics tabs: single line at 1440, scrolled active tab plus hint at 390", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${WORKSPACE_URL}?route=analytics&view=overview`);
		await page.waitForSelector(".admin-page__inner");
		const tabHeights = await page.evaluate(() =>
			[...document.querySelectorAll('[role="tablist"] [role="tab"]')].map(
				(tab) => tab.getBoundingClientRect().height,
			),
		);
		expect(tabHeights.length).toBeGreaterThanOrEqual(5);
		for (const height of tabHeights) {
			expect(height).toBeLessThanOrEqual(44);
		}

		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`${WORKSPACE_URL}?route=analytics&view=claims&campaign=campaign-a`);
		await page.waitForSelector(".admin-page__inner");
		const activeTabVisible = await page.evaluate(() => {
			const tab = document.querySelector<HTMLElement>('[role="tab"][data-selected="true"]');
			if (!tab) return false;
			const rect = tab.getBoundingClientRect();
			return rect.left >= 0 && rect.right <= window.innerWidth;
		});
		expect(activeTabVisible).toBe(true);
		await expect(page.getByText("Vuốt ngang bảng để xem các cột còn lại")).toBeVisible();
		expect(await hasHorizontalOverflow(page)).toBe(false);
	});

	test("keyboard: analytics tabs respond to arrow keys, sidebar links are tab-reachable", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${WORKSPACE_URL}?route=analytics&view=overview`);
		await page.waitForSelector(".admin-page__inner");

		await page.getByRole("tab", { name: "Tổng quan" }).click();
		await page.keyboard.press("ArrowRight");
		await expect(page.getByRole("heading", { name: "Hiệu quả trò chơi" })).toBeVisible();
		const routerState = await page.evaluate(() => (window as any).__workspaceRouterState());
		expect(routerState.search.view).toBe("games");

		// The sidebar nav is a treegrid with a roving tabindex: focusing it
		// lands on some row, arrows move between rows, Enter activates.
		const sidebarNav = page.locator("aside.sidebar [role='treegrid']");
		const focusedText = () =>
			page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
		await sidebarNav.focus();
		await page.waitForTimeout(150);
		for (let ups = 0; ups < 5 && (await focusedText()) !== "Chiến dịch"; ups += 1) {
			await page.keyboard.press("ArrowUp");
			await page.waitForTimeout(100);
		}
		expect(await focusedText()).toBe("Chiến dịch");
		await page.keyboard.press("ArrowDown");
		await page.waitForTimeout(100);
		expect(await focusedText()).toBe("Phân tích");
		await page.keyboard.press("Enter");
		await expect(page.getByRole("heading", { name: "Tổng quan hiệu quả", exact: true })).toBeVisible();
		const afterNav = await page.evaluate(() => (window as any).__workspaceRouterState());
		expect(afterNav.pathname).toBe("/analytics");
	});
});

test.afterEach(async ({ page }) => {
	if (page.isClosed()) return;
	expect(pageErrors, "no uncaught page or console errors").toEqual([]);
});

// ---------------------------------------------------------------------------
// Slice 4d-2: the shared 7-field guest-copy section in a template editor,
// the play-window (schedule) editor inputs, and the advisory window status
// on the games list and distribution page. Evidence screenshots land in
// .tmp/slice4d2-evidence.
// ---------------------------------------------------------------------------

test.describe("campaign game editor guest copy and play window (real chrome)", () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30+07:00"));
	});

	test("editor renders the 7-field copy section and bounded window inputs", async ({
		page,
	}, testInfo) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${WORKSPACE_URL}?route=editor&game=wf-game-wheel`);
		await page.waitForSelector(".admin-page__inner");
		await expect(page.locator("h1.admin-page__title").first()).toHaveText(
			"Vòng quay may mắn",
		);

		// The full 7-field guest copy section with Vietnamese labels.
		for (const label of [
			"Tiêu đề",
			"Mô tả ngắn",
			"Nút bắt đầu",
			"Nút nhận kết quả",
			"Thông điệp chờ",
			"Thông điệp cảm ơn",
			"Hướng dẫn nhận thưởng",
		]) {
			await expect(page.getByText(label, { exact: true })).toBeVisible();
		}

		// The bounded wheel game loads its window into the datetime inputs.
		const startsAt = page.locator("#campaign-game-starts-at");
		const endsAt = page.locator("#campaign-game-ends-at");
		await expect(startsAt).toBeVisible();
		await expect(endsAt).toBeVisible();
		await expect(startsAt).not.toHaveValue("");
		await expect(endsAt).not.toHaveValue("");
		await expect(
			page.getByText("Giờ Việt Nam (UTC+7). Để trống nếu trò chơi mở ngay khi kích hoạt."),
		).toBeVisible();

		// Editing the thank-you copy marks the draft dirty (the baseline
		// serialization includes copy + window).
		const thankYou = page.locator("#lucky-wheel-thankYouMessage");
		await thankYou.fill("Cảm ơn bạn đã ghé gian hàng của chúng tôi!");
		await expect(page.getByText("Có thay đổi chưa lưu.")).toBeVisible();

		const shot = await page.screenshot();
		if (EVIDENCE_DIR_SLICE4D2) {
			mkdirSync(EVIDENCE_DIR_SLICE4D2, { recursive: true });
			writeFileSync(
				path.join(EVIDENCE_DIR_SLICE4D2, "editor-copy-schedule-1440.png"),
				shot,
			);
		}
		await testInfo.attach("editor-copy-schedule-1440", {
			contentType: "image/png",
			body: shot,
		});
	});

	test("games list and distribution show advisory window status chips", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${WORKSPACE_URL}?route=games`);
		await page.waitForSelector(".admin-page__inner");

		// wheel: bounded window open now → advisory "đang mở" chip.
		const wheelCard = page
			.locator("a", { hasText: "Vòng quay may mắn" })
			.first();
		await expect(wheelCard.getByText("Cửa sổ đang mở")).toBeVisible();
		// quiz: future window → "chưa mở" chip even though the game is active.
		const quizCard = page.locator("a", { hasText: "Trắc nghiệm tri ân" }).first();
		await expect(quizCard.getByText("Chưa mở cửa sổ")).toBeVisible();
		// lunar: unbounded → no window chip at all.
		const lunarCard = page.locator("a", { hasText: "Bánh bao lì xì (chính)" }).first();
		await expect(lunarCard.getByText("Cửa sổ đang mở")).toHaveCount(0);
		await expect(lunarCard.getByText("Chưa mở cửa sổ")).toHaveCount(0);

		// Distribution: the primary game (lì xì) is unbounded → its window
		// row reads "no limit" with no state chip, and the share panel gains
		// the status line for the selected game.
		await page.goto(`${WORKSPACE_URL}?route=distribution`);
		await page.waitForSelector(".admin-page__inner");
		await expect(page.getByText("Không giới hạn thời gian.")).toBeVisible();
		await expect(page.getByText("Cửa sổ đang mở")).toHaveCount(0);

		// Selecting the bounded wheel game surfaces its window state.
		const gameSelect = page.locator("#share-link-game");
		await expect(gameSelect).toBeVisible();
		await gameSelect.selectOption({ label: "Vòng quay may mắn" });
		await expect(page.getByText("Cửa sổ đang mở")).toBeVisible();
		await expect(page.getByText(/Cửa sổ chơi từ/).first()).toBeVisible();
	});
});
