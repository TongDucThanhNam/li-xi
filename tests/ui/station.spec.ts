import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { gameTemplates } from "../../lib/gameTemplates";
import type { StationFixtureApi } from "./fixtures/station-convex-mock";

/**
 * Station UI integration tests over the ACTUAL StationPlayFeature
 * (+ StationSelfServePlay and the actual template EntryHero/PlayStage) in a
 * real TanStack Router tree with the shell + template CSS layers in the
 * real route order (tests/ui/fixtures/station-*.*). Synthetic
 * campaigns/stationPlay/publicPlay/auth responses. UI integration scope
 * only — NOT real-backend tests. Fixture controls on
 * window.__stationFixture change mock data and response timing only.
 *
 * Journey under test (docs/design-lucky-wheel.md, docs/design-scratch-card.md
 * station sections): waiting hero → start (self-admission) → play → result →
 * claim with private code → "Hoàn tất" resets to waiting; the Host PIN exit
 * dialog guards the console; the capability is never persisted; a completed
 * but unresolved result (never collected, or claimed but unacknowledged)
 * resurfaces as a shell recovery banner with resume and PIN-gated
 * host-dismiss actions, and Start stays disabled until it is resolved.
 */

const WHEEL_URL = "/station.html?game=wheel";
const SCRATCH_URL = "/station.html?game=scratch";
const QUIZ_URL = "/station.html?game=quiz";
const LIXI_URL = "/station.html?game=lixi";
const WHEEL_GAME = "station-game-wheel";
const SCRATCH_GAME = "station-game-scratch";
const WHEEL_SECRET = "STATION-WHEEL-CODE";
const SCRATCH_SECRET = "STATION-SCRATCH-CODE";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const EVIDENCE_DIR = process.env.SLICE3_EVIDENCE_DIR
	? path.resolve(process.env.SLICE3_EVIDENCE_DIR)
	: null;

/**
 * Explicit in-page fixture calls (no reliance on cross-realm function
 * serialization): every helper evaluates the call inside the page and
 * returns the plain result.
 */
function fixture(page: Page) {
	return {
		counters: (campaignGameId: string) =>
			page.evaluate(
				(id) =>
					(
						window as unknown as { __stationFixture: StationFixtureApi }
					).__stationFixture.counters(id),
				campaignGameId,
			),
		calls: (name: string) =>
			page.evaluate(
				(fn) =>
					(
						window as unknown as { __stationFixture: StationFixtureApi }
					).__stationFixture.calls(fn),
				name,
			),
		setSoldOut: (soldOut: boolean) =>
			page.evaluate(
				(value) =>
					(
						window as unknown as { __stationFixture: StationFixtureApi }
					).__stationFixture.setSoldOut(value),
				soldOut,
			),
		setStartPending: (pending: boolean) =>
			page.evaluate(
				(value) =>
					(
						window as unknown as { __stationFixture: StationFixtureApi }
					).__stationFixture.setStartPending(value),
				pending,
			),
		setAckMode: (mode: "immediate" | "pending" | "failing") =>
			page.evaluate(
				(value) =>
					(
						window as unknown as { __stationFixture: StationFixtureApi }
					).__stationFixture.setAckMode(value),
				mode,
			),
		deliverAck: () =>
			page.evaluate(() =>
				(window as unknown as { __stationFixture: StationFixtureApi })
					.__stationFixture.deliverAck(),
			),
		setScheduleState: (state: "open" | "not-started" | "ended", scheduledAt?: number) =>
			page.evaluate(
				([value, epoch]) =>
					(
						window as unknown as { __stationFixture: StationFixtureApi }
					).__stationFixture.setScheduleState(
						value as "open" | "not-started" | "ended",
						epoch as number | undefined,
					),
				[state, scheduledAt],
			),
		deliverStart: () =>
			page.evaluate(() =>
				(window as unknown as { __stationFixture: StationFixtureApi })
					.__stationFixture.deliverStart(),
			),
		pin: () =>
			page.evaluate(
				() =>
					(window as unknown as { __stationFixture: StationFixtureApi })
						.__stationFixture.pin(),
			),
		wrongPin: () =>
			page.evaluate(
				() =>
					(window as unknown as { __stationFixture: StationFixtureApi })
						.__stationFixture.wrongPin(),
			),
	};
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
			pageErrors.push(message.text());
		}
	});
});
test.afterEach(async () => {
	expect(pageErrors).toEqual([]);
});

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

async function saveEvidence(page: Page, name: string) {
	if (!EVIDENCE_DIR) return;
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const shot = await page.screenshot({ fullPage: true });
	writeFileSync(path.join(EVIDENCE_DIR, `${name}.png`), shot);
}

/**
 * The shell-owned exit trigger must be a real control in BOTH fixture and
 * production: ≥ 44px tall, positioned in the top-right corner, visibly
 * bordered and filled (never raw inline text).
 */
async function expectStyledExitTrigger(page: Page, viewport: { width: number; height: number }) {
	const trigger = page.getByRole("button", { name: "Thoát chế độ trạm" });
	const box = await trigger.boundingBox();
	expect(box).toBeTruthy();
	if (box) {
		expect(box.height).toBeGreaterThanOrEqual(44);
		expect(box.y).toBeLessThanOrEqual(24);
		expect(box.x).toBeGreaterThan(viewport.width / 2);
		expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
		expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
	}
	const styles = await trigger.evaluate((element) => {
		const computed = getComputedStyle(element);
		return {
			position: computed.position,
			background: computed.backgroundColor,
			border: computed.borderTopWidth,
		};
	});
	expect(styles.position).toBe("absolute");
	expect(styles.background).not.toBe("rgba(0, 0, 0, 0)");
	expect(styles.border).not.toBe("0px");
}

async function openWheelWaiting(page: Page) {
	await page.goto(WHEEL_URL);
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeVisible();
	await expect(page.getByRole("heading", { name: "Vòng quay tri ân" })).toBeVisible();
	await awaitFonts(page);
	return start;
}

/** Start admits exactly one session and mounts the actual wheel stage. */
async function startWheel(page: Page) {
	const start = await openWheelWaiting(page);
	await start.click();
	await expect(page.locator(".wheel-board")).toBeVisible();
	await expect(page.getByRole("button", { name: "Quay ngay" })).toBeVisible();
}

async function spinWheelToResult(page: Page) {
	await page.getByRole("button", { name: "Quay ngay" }).click();
	await expect(page.getByText("Đang quay…")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 15_000 });
}

async function claimWheel(page: Page) {
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	await expect(
		page.getByText("Hướng dẫn nhận thưởng (fixture)."),
	).toBeVisible();
}

async function collectWheel(page: Page) {
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("button", { name: "Quay ngay" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Vòng quay tri ân" })).toBeVisible();
}

async function openScratchWaiting(page: Page) {
	await page.goto(SCRATCH_URL);
	const start = page.getByRole("button", { name: "Bắt đầu" });
	await expect(start).toBeVisible();
	await expect(page.getByRole("heading", { name: "Thẻ cào tri ân" })).toBeVisible();
	await awaitFonts(page);
	return start;
}

async function startScratch(page: Page) {
	const start = await openScratchWaiting(page);
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
}

async function revealScratchToResult(page: Page) {
	// Keyboard alternative authorizes the ONE server reveal at threshold 10
	// with no measured coverage: the coating persists into the bypass.
	await page.getByTestId("scratch-keyboard-reveal").click();
	await expect(
		page.getByText("Kết quả đã sẵn sàng — chà tiếp hoặc gỡ lớp phủ"),
	).toBeVisible();
	await page.getByRole("button", { name: "Gỡ lớp phủ ngay" }).click();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 10_000 });
}

async function claimScratch(page: Page) {
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
}

async function collectScratch(page: Page) {
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Thẻ cào tri ân" })).toBeVisible();
}

test("wheel: waiting → play → claim with code → reset; one open per waiting round", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await openWheelWaiting(page);
	let counters = await api.counters(WHEEL_GAME);
	expect(counters.opens).toBe(1);
	expect(counters.admissionCount).toBe(0);
	expect(counters.stock).toBe(4);
	expect(await api.calls("stationPlay:startStationPlaySession")).toHaveLength(0);

	await startWheel(page);
	counters = await api.counters(WHEEL_GAME);
	expect(counters.opens).toBe(1);
	expect(counters.admissionCount).toBe(1);
	expect(counters.sessionStatus).toBe("active");

	await spinWheelToResult(page);
	counters = await api.counters(WHEEL_GAME);
	expect(counters.stock).toBe(3);
	expect(counters.sessionStatus).toBe("completed");

	await claimWheel(page);
	// "Hoàn tất" resets the station to waiting and drops the capability.
	await collectWheel(page);
	counters = await api.counters(WHEEL_GAME);
	expect(counters.opens).toBe(2);
	expect(counters.admissionCount).toBe(1);

	// The next participant is a fresh admission (new participant, new code).
	// Click the reset screen's start in place — no re-navigation, so the
	// recorded-call log keeps both admissions.
	await page.getByRole("button", { name: "Quay ngay" }).click();
	await expect(page.locator(".wheel-board")).toBeVisible();
	counters = await api.counters(WHEEL_GAME);
	expect(counters.admissionCount).toBe(2);
	const starts = await api.calls("stationPlay:startStationPlaySession");
	expect(starts).toHaveLength(2);
	expect(JSON.stringify(starts)).toContain(WHEEL_GAME);
});

test("wheel: refresh recovers the admitted play without a new admission or open", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startWheel(page);

	// Nothing is persisted client-side; the owner-authorized state query
	// recovers the still-active session into the mounted play stage.
	await page.reload();
	// The mounted play stage (board + spin CTA), not the waiting hero.
	await expect(page.locator(".wheel-board")).toBeVisible();
	await expect(page.getByRole("button", { name: "Quay ngay" })).toBeVisible();
	let counters = await api.counters(WHEEL_GAME);
	expect(counters.admissionCount).toBe(1);
	expect(counters.opens).toBe(0);

	await spinWheelToResult(page);
	await claimWheel(page);
	await collectWheel(page);

	// After completion a refresh lands on the waiting screen (the completed
	// session is no longer resumable) and admits nothing by itself.
	await page.reload();
	await expect(page.getByRole("button", { name: "Quay ngay" })).toBeVisible();
	counters = await api.counters(WHEEL_GAME);
	expect(counters.admissionCount).toBe(1);
	expect(counters.opens).toBe(1);
});

test("wheel: PIN exit dialog rejects wrong PIN, cancels, and navigates on success", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startWheel(page);

	const exit = page.getByRole("button", { name: "Thoát chế độ trạm" });
	await exit.click();
	const dialog = page.getByRole("dialog", { name: "Xác minh Host PIN" });
	await expect(dialog).toBeVisible();
	const pinInput = page.locator("#station-exit-pin");
	await expect(pinInput).toBeFocused();
	await saveEvidence(page, "station-pin-dialog-1440");

	// Wrong PIN: the real verifyHostPin error surfaces inline.
	await pinInput.fill(await api.wrongPin());
	await page.getByRole("button", { name: "Xác minh" }).click();
	await expect(page.getByText("PIN host không đúng")).toBeVisible();
	await expect(dialog).toBeVisible();

	// Escape closes without navigating (focus returns to the trigger).
	await pinInput.press("Escape");
	await expect(dialog).toBeHidden();

	// Correct PIN leaves the station for the operator console.
	await exit.click();
	await pinInput.fill(await api.pin());
	await page.getByRole("button", { name: "Xác minh" }).click();
	await expect(page.getByTestId("station-placeholder")).toBeVisible();
	const pins = await api.calls("auth:verifyHostPin");
	expect(pins).toHaveLength(2);
});

test("wheel: sold-out waiting screen blocks start with the quota message", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await openWheelWaiting(page);
	await api.setSoldOut(true);
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeDisabled();
	await expect(
		page.getByText("Trò chơi đã hết lượt tham gia."),
	).toBeVisible();
	expect(await api.calls("stationPlay:startStationPlaySession")).toHaveLength(0);
});

test("wheel: play window not-started blocks start with the opening time (1440)", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	const startsAt = Date.parse("2026-10-10T09:00:00+07:00");
	await page.goto(WHEEL_URL);
	await api.setScheduleState("not-started", startsAt);
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeDisabled();
	await expect(
		page.getByText(/Chưa đến giờ — trò chơi mở cửa sổ chơi lúc/),
	).toBeVisible();
	// The bound renders in Vietnam time (09:00 for the fixed epoch).
	await expect(page.getByText(/09:00/)).toBeVisible();
	expect(await api.calls("stationPlay:startStationPlaySession")).toHaveLength(0);
	await saveEvidence(page, "slice4d2-station-not-started-1440");

	// Reopening the window re-enables the same waiting screen (control).
	await api.setScheduleState("open");
	await expect(start).toBeEnabled();
});

test("wheel: play window ended blocks start at 390 with the closed message", async ({
	page,
}) => {
	await page.setViewportSize(MOBILE);
	const api = fixture(page);
	const endsAt = Date.parse("2026-09-01T21:00:00+07:00");
	await page.goto(WHEEL_URL);
	await api.setScheduleState("ended", endsAt);
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeDisabled();
	await expect(
		page.getByText("Đã kết thúc — cửa sổ chơi của trò chơi này đã đóng."),
	).toBeVisible();
	expect(await api.calls("stationPlay:startStationPlaySession")).toHaveLength(0);
	expect(await hasHorizontalOverflow(page)).toBe(false);
	await saveEvidence(page, "slice4d2-station-ended-390");
});

test("wheel: slow admission keeps the start single-flight", async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await openWheelWaiting(page);
	await api.setStartPending(true);
	await page.getByRole("button", { name: "Quay ngay" }).click();
	// Held response: no stage yet; clicking again must not double-admit.
	await expect(page.locator(".wheel-board")).toHaveCount(0);
	await page.getByRole("button", { name: "Quay ngay" }).click({ force: true });
	await api.deliverStart();
	await expect(page.locator(".wheel-board")).toBeVisible();
	expect(await api.calls("stationPlay:startStationPlaySession")).toHaveLength(1);
	const counters = await api.counters(WHEEL_GAME);
	expect(counters.admissionCount).toBe(1);
});

test("scratch: waiting → reveal → claim with code → reset; one open per waiting round", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await openScratchWaiting(page);
	let counters = await api.counters(SCRATCH_GAME);
	expect(counters.opens).toBe(1);
	expect(counters.admissionCount).toBe(0);

	await startScratch(page);
	counters = await api.counters(SCRATCH_GAME);
	expect(counters.admissionCount).toBe(1);
	expect(counters.sessionStatus).toBe("active");

	await revealScratchToResult(page);
	counters = await api.counters(SCRATCH_GAME);
	expect(counters.stock).toBe(3);
	expect(counters.sessionStatus).toBe("completed");

	await claimScratch(page);
	await collectScratch(page);
	counters = await api.counters(SCRATCH_GAME);
	expect(counters.opens).toBe(2);
	expect(counters.admissionCount).toBe(1);
});

test("scratch: refresh recovers the coated card without replaying the reveal", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startScratch(page);
	await page.reload();
	// The recovered active session remounts the coated stage directly.
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	const counters = await api.counters(SCRATCH_GAME);
	expect(counters.admissionCount).toBe(1);
	expect(counters.opens).toBe(0);

	// Exactly one authoritative reveal still lands after recovery.
	await revealScratchToResult(page);
	expect(await api.calls("publicPlay:playSessionAction")).toHaveLength(1);
	await claimScratch(page);
	await collectScratch(page);
});

test("scratch: PIN exit dialog guards the station screen", async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startScratch(page);
	await page.getByRole("button", { name: "Thoát chế độ trạm" }).click();
	const dialog = page.getByRole("dialog", { name: "Xác minh Host PIN" });
	await expect(dialog).toBeVisible();
	await page
		.locator("#station-exit-pin")
		.fill(await api.wrongPin());
	await page.getByRole("button", { name: "Xác minh" }).click();
	await expect(page.getByText("PIN host không đúng")).toBeVisible();
	await page
		.getByRole("button", { name: "Ở lại" })
		.click();
	await expect(dialog).toBeHidden();
	expect(await api.calls("auth:verifyHostPin")).toHaveLength(1);
});

test("quiz: station route stays fail-closed for public-self-serve templates", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await page.goto(QUIZ_URL);
	await expect(
		page.getByRole("heading", { name: "Trò chơi tự phục vụ" }),
	).toBeVisible();
	await expect(
		page.getByText("luồng trạm cho mẫu này sẽ ra mắt sau"),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Mở trang Phân phối" }),
	).toBeVisible();
	expect(await api.calls("stationPlay:startStationPlaySession")).toHaveLength(0);
	expect(await api.calls("publicPlay:playSessionAction")).toHaveLength(0);
});

test("li-xi: budget station keeps the draw-era hero under the shared shell", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await page.goto(LIXI_URL);
	// The legacy flow is data- and copy-identical: the operator-created draw
	// session plays through the same FortuneStage hero as before.
	await expect(page.getByRole("heading", { name: "Lì xì tri ân" })).toBeVisible();
	const begin = page.getByRole("button", { name: "Những chiếc phong bao đó" });
	await expect(begin).toBeVisible();
	await expect(begin).toBeEnabled();
	// The only new chrome is the shared shell exit trigger.
	await expectStyledExitTrigger(page, DESKTOP);
	await awaitFonts(page);
	await saveEvidence(page, "station-lixi-waiting-1440");
});

for (const [label, size] of [
	["390x844", MOBILE],
	["1440x900", DESKTOP],
] as const) {
	test(`wheel: ${label} waiting and claimed surfaces have no overflow`, async ({
		page,
	}) => {
		await page.setViewportSize(size);
		await openWheelWaiting(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expectStyledExitTrigger(page, size);

		await startWheel(page);
		await spinWheelToResult(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);

		await claimWheel(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await collectWheel(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
	});

	test(`scratch: ${label} waiting and claimed surfaces have no overflow`, async ({
		page,
	}) => {
		await page.setViewportSize(size);
		await openScratchWaiting(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expectStyledExitTrigger(page, size);

		await startScratch(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);

		await revealScratchToResult(page);
		await claimScratch(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await collectScratch(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
	});
}

test("station fixture mirrors the real route's CSS layer order", () => {
	// The route head ships the shell layer plus the station-capable template
	// layers from the registry (quiz/slot stay public-link-only and fail
	// closed, so their layers never load). The fixture must import exactly
	// that set in that order so its screenshots exercise real layering.
	const route = readFileSync("app/station/$campaignGameId.tsx", "utf8");
	expect(route).toContain("stationShellCssHref");
	expect(route).toContain("stationCssLayers");
	expect(route).not.toContain("admin.css");

	const fixtureMain = readFileSync("tests/ui/fixtures/station-main.tsx", "utf8");
	expect(fixtureMain.trim().split(/\r?\n/).some((line) => line.startsWith('import "./station-styles.css"')));
	const fixtureCss = readFileSync("tests/ui/fixtures/station-styles.css", "utf8");
	const fixtureLayers = [
		...fixtureCss.matchAll(/@import "\.\.\/\.\.\/\.\.\/app\/styles\/([a-z-]+)\.css";/g),
	].map((match) => match[1]);
	const catalogOrder = [
		"li-xi",
		"lucky-wheel",
		"scratch-card",
		"slot-reveal",
		"quiz",
	] as const;
	const expectedLayers = [
		"station",
		...catalogOrder
			.filter((id) => gameTemplates[id].stationMode !== "public-self-serve")
			.map((id) => ({ "li-xi": "draw", "lucky-wheel": "lucky-wheel", "scratch-card": "scratch-card" })[id as "li-xi" | "lucky-wheel" | "scratch-card"]),
	];
	expect(fixtureLayers).toEqual(expectedLayers);
});

test("wheel: refresh at the result screen recovers through the banner, resume, claim, collect", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startWheel(page);
	await spinWheelToResult(page);

	// Nothing is persisted client-side; the completed-but-unresolved result
	// comes back from the owner-authorized state query as recoverable.
	await page.reload();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeVisible();
	await saveEvidence(page, "station-wheel-recovery-banner-1440");
	const start = page.getByRole("button", { name: "Quay ngay" });
	// Start stays disabled until the pending result is resolved.
	await expect(start).toBeDisabled();
	await expect(
		page.getByText("Hãy xử lý phần thưởng chưa nhận phía trên"),
	).toBeVisible();

	// Resume re-shows the result through the actual template stage.
	await page.getByRole("button", { name: "Xem kết quả" }).click();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	await claimWheel(page);
	await saveEvidence(page, "station-wheel-recovered-claim-1440");
	await collectWheel(page);

	// Collect acknowledges: the banner never resurfaces and Start reopens.
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeHidden();
	await expect(start).toBeEnabled();
	const counters = await api.counters(WHEEL_GAME);
	expect(counters.admissionCount).toBe(1);
	expect(await api.calls("stationPlay:acknowledgeStationPlayResult")).toHaveLength(1);
});

test("wheel: a live collect never flashes the recovery banner nor locks Start", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startWheel(page);
	await spinWheelToResult(page);
	await claimWheel(page);

	// Slow acknowledge: "Hoàn tất" returns to the fresh waiting round while
	// the write is still in flight. The result was collected on this device,
	// so the round must show no recovery banner and Start must be enabled
	// immediately — not gated behind the acknowledge mutation.
	await api.setAckMode("pending");
	await collectWheel(page);
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeEnabled();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeHidden();
	await api.deliverAck();
	// The write landed behind the fresh round; still no banner, still open.
	await expect(start).toBeEnabled();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeHidden();
	expect(
		await api.calls("stationPlay:acknowledgeStationPlayResult"),
	).toHaveLength(1);
	await saveEvidence(page, "station-round-after-collect-1440");

	// Next round with a FAILING acknowledge: the guest's reward was already
	// handed over, so the banner must not latch and Start must stay open.
	await start.click();
	await expect(page.locator(".wheel-board")).toBeVisible();
	await spinWheelToResult(page);
	await claimWheel(page);
	await api.setAckMode("failing");
	await collectWheel(page);
	await expect(start).toBeEnabled();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeHidden();
	await expect(
		page.getByText("Hãy xử lý phần thưởng chưa nhận phía trên"),
	).toBeHidden();
	expect(
		await api.calls("stationPlay:acknowledgeStationPlayResult"),
	).toHaveLength(2);
	// A fresh admission is unaffected: the next participant can play.
	await start.click();
	await expect(page.locator(".wheel-board")).toBeVisible();
	const counters = await api.counters(WHEEL_GAME);
	expect(counters.admissionCount).toBe(3);
});

test("wheel: a claimed-but-unseen code re-reveals from recovery without a second claim", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startWheel(page);
	await spinWheelToResult(page);
	await claimWheel(page);
	expect(await api.calls("publicPlay:claimPublicReward")).toHaveLength(1);

	await page.reload();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeVisible();
	await page.getByRole("button", { name: "Xem kết quả" }).click();
	// The immutable claim detail re-reveals the code directly.
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	await collectWheel(page);
	// Call recordings reset on reload; recovery must fire zero new claims.
	expect(await api.calls("publicPlay:claimPublicReward")).toHaveLength(0);
});

test("wheel: the host dismisses a pending result behind the Host PIN", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	const api = fixture(page);
	await startWheel(page);
	await spinWheelToResult(page);
	await page.reload();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeVisible();

	const bannerDismiss = page.getByRole("button", { name: "Bỏ kết quả" });
	await bannerDismiss.click();
	const dialog = page.getByRole("dialog", { name: "Bỏ kết quả chưa nhận?" });
	await expect(dialog).toBeVisible();
	await expect(page.locator("#station-dismiss-pin")).toBeFocused();

	// Wrong PIN keeps the pending result.
	await page.locator("#station-dismiss-pin").fill(await api.wrongPin());
	await dialog.getByRole("button", { name: "Bỏ kết quả" }).click();
	await expect(page.getByText("PIN host không đúng")).toBeVisible();

	// Cancel keeps the banner and its focus restoration.
	await page.getByRole("button", { name: "Quay lại" }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeVisible();

	// Correct PIN abandons the result: banner clears and a new play starts.
	await bannerDismiss.click();
	await page.locator("#station-dismiss-pin").fill(await api.pin());
	await dialog.getByRole("button", { name: "Bỏ kết quả" }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeHidden();
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeEnabled();
	await start.click();
	await expect(page.locator(".wheel-board")).toBeVisible();
	const hostPin = await api.pin();
	expect(
		(await api.calls("stationPlay:dismissStationPlayResult")).filter(
			(call) => call.pin === hostPin,
		),
	).toHaveLength(1);
	expect((await api.counters(WHEEL_GAME)).admissionCount).toBe(2);
});

test("scratch: refresh at the result screen recovers through the banner too", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await startScratch(page);
	await revealScratchToResult(page);
	await page.reload();
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeVisible();
	await page.getByRole("button", { name: "Xem kết quả" }).click();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	await claimScratch(page);
	await collectScratch(page);
	await expect(page.getByText("Có phần thưởng chưa nhận")).toBeHidden();
});

test.describe("station strict visual references (desktop + 390px)", () => {
	// Frozen clock + awaited fonts + production CSS keep the references
	// deterministic. References are generated ONLY via the explicit update
	// command (npm run test:ui:update); normal verification runs snapshot-none.
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:30:00"));
	});

	test("wheel desktop waiting/play/result/claimed/reset references", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await openWheelWaiting(page);
		await expect(page).toHaveScreenshot("station-wheel-desktop-waiting.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-wheel-waiting-1440");

		await startWheel(page);
		await expect(page).toHaveScreenshot("station-wheel-desktop-play.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-wheel-play-1440");

		await spinWheelToResult(page);
		// The disc's final rotation is randomized by design; the result panel
		// itself is the deterministic visual contract.
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			"station-wheel-desktop-result.png",
			{ animations: "disabled" },
		);
		await saveEvidence(page, "station-wheel-result-1440");

		await claimWheel(page);
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			"station-wheel-desktop-claimed.png",
			{ animations: "disabled" },
		);
		await saveEvidence(page, "station-wheel-claimed-1440");

		await collectWheel(page);
		await expect(page).toHaveScreenshot("station-wheel-desktop-reset.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-wheel-reset-1440");
	});

	test("wheel 390px waiting/play/claimed references", async ({ page }) => {
		await page.setViewportSize(MOBILE);
		await openWheelWaiting(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page).toHaveScreenshot("station-wheel-390-waiting.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-wheel-waiting-390");

		await startWheel(page);
		await expect(page).toHaveScreenshot("station-wheel-390-play.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-wheel-play-390");

		await spinWheelToResult(page);
		await saveEvidence(page, "station-wheel-result-390");
		await claimWheel(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			"station-wheel-390-claimed.png",
			{ animations: "disabled" },
		);
		await saveEvidence(page, "station-wheel-claimed-390");

		await collectWheel(page);
		await saveEvidence(page, "station-wheel-reset-390");
	});

	test("scratch desktop waiting/coated/result/claimed references", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await openScratchWaiting(page);
		await expect(page).toHaveScreenshot("station-scratch-desktop-waiting.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-waiting-1440");

		await startScratch(page);
		await expect(page).toHaveScreenshot("station-scratch-desktop-coated.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-play-1440");

		await revealScratchToResult(page);
		await expect(page).toHaveScreenshot("station-scratch-desktop-result.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-result-1440");

		await claimScratch(page);
		await expect(page).toHaveScreenshot("station-scratch-desktop-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-claimed-1440");

		await collectScratch(page);
		await saveEvidence(page, "station-scratch-reset-1440");
	});

	test("scratch 390px waiting/coated/claimed references", async ({ page }) => {
		await page.setViewportSize(MOBILE);
		await openScratchWaiting(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page).toHaveScreenshot("station-scratch-390-waiting.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-waiting-390");

		await startScratch(page);
		const clearControl = page.getByTestId("scratch-keyboard-reveal");
		await expect(clearControl).toBeVisible();
		const controlBox = await clearControl.boundingBox();
		expect(controlBox).toBeTruthy();
		if (controlBox) {
			expect(controlBox.x).toBeGreaterThanOrEqual(0);
			expect(controlBox.y).toBeGreaterThanOrEqual(0);
			expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(390);
			expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(844);
		}
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page).toHaveScreenshot("station-scratch-390-coated.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-play-390");

		await revealScratchToResult(page);
		await saveEvidence(page, "station-scratch-result-390");
		await claimScratch(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page).toHaveScreenshot("station-scratch-390-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-scratch-claimed-390");

		await collectScratch(page);
		await saveEvidence(page, "station-scratch-reset-390");
	});
});
