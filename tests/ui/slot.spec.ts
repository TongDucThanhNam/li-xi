import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { ParticipantFixtureApi } from "./fixtures/participant-convex-mock";

/**
 * Slot-reveal UI integration tests over the ACTUAL PublicShareEntryFeature +
 * SlotRevealStage (tests/ui/fixtures/participant-*.*) with synthetic
 * publicPlay responses. UI integration scope only — NOT real-backend tests
 * (backend semantics live in convex/slotTemplate.test.ts).
 *
 * Proven here: real reel motion settles ON the authoritative frozen
 * combination (winning [bell,bell,bell], documented miss [moon,star,clover]),
 * delayed/failed responses stay usable, keyboard + native reduced motion
 * work, reload/closure recover without re-spinning, and the editor persists
 * its bounded config with a faithful preview.
 */

const SLOT_SECRET = "SYNTHETIC-SLOT-CODE";
const WINNING_COMBINATION = ["bell", "bell", "bell"];
const MISS_COMBINATION = ["moon", "star", "clover"];
/**
 * Every supported inventory reward type plus a duplicate-label sibling
 * (same label + amount, DISTINCT id) — each with its own documented frozen
 * combination from the fixture snapshot.
 */
const IDENTITY_CASES = [
	{
		segmentKey: "slot-item-voucher",
		combination: ["bell", "bell", "bell"],
		label: "Voucher quà tặng",
	},
	{
		segmentKey: "slot-item-cash",
		combination: ["star", "star", "star"],
		label: "Tiền mặt tri ân",
	},
	{
		segmentKey: "slot-item-physical",
		combination: ["gem", "gem", "gem"],
		label: "Hộp quà sự kiện",
	},
	{
		segmentKey: "slot-item-points",
		combination: ["heart", "heart", "heart"],
		label: "Điểm thưởng",
	},
	{
		segmentKey: "slot-item-points-copy",
		combination: ["clover", "clover", "clover"],
		label: "Điểm thưởng",
	},
] as const;
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(SPEC_DIR, "artifacts/screenshots");

function fixtureApi(page: Page) {
	return page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		return {
			counters: api.counters(),
			setActionDelivery: api.setActionDelivery,
			deliverActions: api.deliverActions,
			setEngagement: api.setEngagement,
			closeEntry: api.closeEntry,
		};
	});
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

async function saveFreshCheckpoint(
	page: Page,
	testInfo: import("@playwright/test").TestInfo,
	name: string,
) {
	mkdirSync(SCREENSHOT_DIR, { recursive: true });
	const shot = await page.screenshot({ fullPage: true });
	const file = path.join(SCREENSHOT_DIR, `${name}.png`);
	writeFileSync(file, shot);
	await testInfo.attach(name, { contentType: "image/png", body: shot });
}

async function openSlotHero(page: Page, share = "slot") {
	await page.goto(`/participant.html?share=${share}`);
	const start = page.getByRole("button", { name: "Quay ngay" });
	await expect(start).toBeVisible();
	await awaitFonts(page);
	return start;
}

async function startSlotGame(page: Page, share = "slot") {
	const start = await openSlotHero(page, share);
	await start.click();
	await expect(page.getByTestId("slot-machine")).toBeVisible();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"hero",
	);
	return start;
}

async function settledReelSymbols(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const reels = Array.from(
			document.querySelectorAll('[data-testid="slot-reel"]'),
		);
		return reels.map(
			(reel) => (reel as HTMLElement).dataset.reelSymbol ?? "(missing)",
		);
	});
}

test("slot: reel motion settles on the authoritative winning combination", async ({
	page,
}) => {
	const start = await openSlotHero(page);
	// Load admits nothing.
	let counters = (await fixtureApi(page)).counters;
	expect(counters.starts).toBe(0);
	expect(counters.admissionCount).toBe(0);
	expect(counters.stock).toBe(5);

	await start.click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"hero",
	);
	counters = (await fixtureApi(page)).counters;
	expect(counters.admissionCount).toBe(1);

	// KEYBOARD activation of the one server action.
	const spin = page.getByTestId("slot-spin");
	await expect(spin).toHaveText(/Quay ngay/);
	await spin.focus();
	await spin.press("Enter");

	// The machine actually animates before settling.
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"spinning",
	);
	await expect(page.getByRole("status")).toContainText("Đang quay…");

	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	// Settled identity: exactly the frozen winning combination of the award.
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();

	// Optional claim: the private code appears only after claiming.
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4);
});

test("slot: engagement mode settles the documented miss combination", async ({
	page,
}) => {
	const start = await openSlotHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setEngagement(true);
	});
	await start.click();
	await expect(page.getByTestId("slot-machine")).toBeVisible();

	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	expect(await settledReelSymbols(page)).toEqual(MISS_COMBINATION);
	await expect(
		page.getByRole("heading", { name: "Chúc bạn may mắn lần sau" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Nhận quà" })).toHaveCount(0);
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(0);
	expect(counters.stock).toBe(5);
});

test("slot: late response keeps looping, then settles on the real outcome", async ({
	page,
}) => {
	const start = await openSlotHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("delayed");
	});
	await start.click();
	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"spinning",
	);
	// The held reveal never cuts the loop short.
	await page.waitForTimeout(900);
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"spinning",
	);
	await expect(page.getByTestId("slot-spin")).toBeDisabled();

	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverActions();
	});
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.stock).toBe(4);
});

test("slot: failed spin returns to idle; retry settles the same allocation", async ({
	page,
}) => {
	const start = await openSlotHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("fail-once");
	});
	await start.click();

	await page.getByTestId("slot-spin").click();
	await expect(
		page.getByText("Mất phản hồi quay máy (mô phỏng)"),
	).toBeVisible({ timeout: 10_000 });
	// The failed spin allocated nothing: back to idle, machine usable again.
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"hero",
	);
	await expect(page.getByTestId("slot-spin")).toBeEnabled();

	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	const counters = (await fixtureApi(page)).counters;
	// Exactly one server allocation despite two deliberate spins.
	expect(counters.plays).toBe(2);
	expect(counters.stock).toBe(4);
	expect(counters.claims).toBe(0);
});

test("slot: loop motion is real while held; settle uses documented per-reel timing", async ({
	page,
}) => {
	const start = await openSlotHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("delayed");
	});
	await start.click();
	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"spinning",
	);

	// REAL loop motion: nonzero animation duration, the loop renders the
	// symbol set twice for a seamless restart, and the transform actually
	// changes across time.
	const loopBefore = await page.evaluate(() => {
		const track = document.querySelector(".slot-reel__loop-track");
		if (!track) return null;
		const style = getComputedStyle(track);
		const symbols = Array.from(
			track.querySelectorAll("[data-loop-symbol]"),
		).map((cell) => (cell as HTMLElement).dataset.loopSymbol);
		return {
			animationName: style.animationName,
			animationDuration: style.animationDuration,
			transform: style.transform,
			half: symbols.length / 2,
			firstHalf: symbols.slice(0, symbols.length / 2),
			secondHalf: symbols.slice(symbols.length / 2),
		};
	});
	expect(loopBefore).toBeTruthy();
	expect(loopBefore?.animationName).toBe("slot-loop");
	expect(parseFloat(loopBefore?.animationDuration ?? "0")).toBeGreaterThan(0);
	// Continuity precondition: the second half duplicates the first exactly,
	// so translating one half restarts on the identical frame.
	expect(loopBefore?.firstHalf).toEqual(loopBefore?.secondHalf);
	await page.waitForTimeout(320);
	const loopAfterTransform = await page.evaluate(
		() =>
			document.querySelector(".slot-reel__loop-track")
				? getComputedStyle(
						document.querySelector(".slot-reel__loop-track")!,
					).transform
				: null,
	);
	expect(loopAfterTransform).not.toBe(loopBefore?.transform);

	// Release the held response: settle uses the documented per-reel duration
	// (900ms) and stagger (240ms per reel).
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverActions();
	});
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"settling",
	);
	const settleTiming = await page.evaluate(() =>
		Array.from(document.querySelectorAll('[data-testid="slot-reel"]')).map(
			(reel) => {
				const windowEl = reel.querySelector(".slot-reel__window");
				const style = windowEl ? getComputedStyle(windowEl) : null;
				return {
					duration: style?.animationDuration ?? "(none)",
					delay: style?.animationDelay ?? "(none)",
				};
			},
		),
	);
	expect(settleTiming.map((timing) => timing.duration)).toEqual([
		"0.9s",
		"0.9s",
		"0.9s",
	]);
	expect(settleTiming.map((timing) => timing.delay)).toEqual([
		"0s",
		"0.24s",
		"0.48s",
	]);

	// The motion settles ON the authoritative symbols.
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 10_000 },
	);
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
});

test("slot: every reward type and duplicate labels settle their own combination", async ({
	page,
}) => {
	await openSlotHero(page);
	// Five rewarded plays need stock beyond the default 5.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setStock(10);
	});
	await startSlotGame(page);

	for (const [index, identityCase] of IDENTITY_CASES.entries()) {
		if (index > 0) {
			// Claim and finish the previous round, then start a fresh session
			// through the real next-play path (back to the entry hero).
			await page.getByRole("button", { name: "Nhận quà" }).click();
			await page.getByRole("button", { name: "Hoàn tất" }).click();
			await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
			await page.getByRole("button", { name: "Chơi lượt mới" }).click();
			const nextStart = page.getByRole("button", { name: "Quay ngay" });
			await expect(nextStart).toBeVisible();
			await nextStart.click();
			await expect(page.getByTestId("slot-machine")).toHaveAttribute(
				"data-slot-phase",
				"hero",
			);
		}
		await page.evaluate((segmentKey) => {
			const api = (
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture;
			api.setRewardSegmentKey(segmentKey);
		}, identityCase.segmentKey);

		await page.getByTestId("slot-spin").click();
		await expect(page.getByTestId("slot-machine")).toHaveAttribute(
			"data-slot-phase",
			"result",
			{ timeout: 15_000 },
		);
		// The reels settle on THAT item's documented combination — never on a
		// label-derived one.
		expect(await settledReelSymbols(page)).toEqual([
			...identityCase.combination,
		]);
		await expect(
			page.getByRole("heading", { name: identityCase.label }),
		).toBeVisible();
	}

	// The duplicate-label sibling settled a DIFFERENT combination than the
	// original points item: identity comes from the id, not the label.
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(IDENTITY_CASES.length);
	// Rounds 2..5 are deliberately CLAIMED before finishing (claim → Finish →
	// next play); the first round is left unclaimed.
	expect(counters.claims).toBe(IDENTITY_CASES.length - 1);
	// Every play decremented stock exactly once.
	expect(counters.stock).toBe(10 - IDENTITY_CASES.length);
});

test("slot: unmapped outcome renders truthfully without a landed combination", async ({
	page,
}) => {
	await startSlotGame(page);
	// Typed synthetic control injects an authoritative response whose segment
	// is OUTSIDE the frozen mapping (robustness case; handlers are untouched).
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setRewardSegmentKey("slot-item-unmapped");
	});
	await page.getByTestId("slot-spin").click();
	// No landed combination is implied: the machine is withheld entirely and
	// the authoritative result/claim/Finish stay fully usable.
	await expect(page.getByTestId("slot-machine")).toHaveCount(0, {
		timeout: 15_000,
	});
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.stock).toBe(4);
});

test.describe("native reduced motion", () => {
	test.use({ reducedMotion: "reduce" });

	test("slot: reduced motion lands the identity without reel motion", async ({
		page,
	}) => {
		await startSlotGame(page);
		await page.getByTestId("slot-spin").click();
		// No loop phase and no settle wait: the identity is present quickly.
		await expect(page.getByTestId("slot-machine")).toHaveAttribute(
			"data-slot-phase",
			"result",
			{ timeout: 5_000 },
		);
		expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
		await expect(
			page.getByRole("heading", { name: "Voucher quà tặng" }),
		).toBeVisible();
		const settleTransition = await page.evaluate(() => {
			const window0 = document.querySelector(
				'[data-testid="slot-reel"] .slot-reel__window',
			);
			return window0
				? getComputedStyle(window0).animationDuration
				: "(missing)";
		});
		expect(settleTransition).toBe("0s");
	});
});

test("slot: reload recovers the settled machine without re-spinning", async ({
	page,
}) => {
	await startSlotGame(page);
	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	await page.reload();
	// Claimed recovery: the machine presents the SAME settled identity with
	// the claim intact and Finish available — no spin, no new allocation.
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
	);
	await expect(page.getByTestId("slot-machine")).toBeVisible();
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
});

test("slot: unclaimed reload keeps the reward claimable", async ({
	page,
}) => {
	await startSlotGame(page);
	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	// Leave WITHOUT claiming.
	await page
		.getByRole("button", { name: "Rời trang (để dành phần thưởng)" })
		.click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	await page.reload();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
	);
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4);
});

test("slot: closure keeps the settled machine claimable across reload", async ({
	page,
}) => {
	await startSlotGame(page);
	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	// Close the entry AFTER the outcome is in hand: the completed capability
	// still recovers its result over the closed link.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.closeEntry();
	});
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
	);
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();

	await page.reload();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
	);
	expect(await settledReelSymbols(page)).toEqual(WINNING_COMBINATION);
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4);
});

test("slot: 390px machine stays readable with long claim data", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openSlotHero(page);
	await awaitFonts(page);
	await saveFreshCheckpoint(page, testInfo, "slot-390-hero-current");

	await startSlotGame(page);
	await page.getByTestId("slot-spin").click();
	await expect(page.getByTestId("slot-machine")).toHaveAttribute(
		"data-slot-phase",
		"result",
		{ timeout: 15_000 },
	);
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(overflow).toBe(false);
	await saveFreshCheckpoint(page, testInfo, "slot-390-claimed-current");
});

test.describe("slot strict visual references (desktop + 390px)", () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T01:05:00"));
	});

	test("desktop hero/machine/result/claimed strict references", async ({
		page,
	}, testInfo) => {
		await openSlotHero(page);
		await expect(page).toHaveScreenshot("slot-desktop-hero.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "slot-desktop-hero-current");

		await startSlotGame(page);
		await expect(page).toHaveScreenshot("slot-desktop-machine.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "slot-desktop-machine-current");

		await page.getByTestId("slot-spin").click();
		await expect(page.getByTestId("slot-machine")).toHaveAttribute(
			"data-slot-phase",
			"result",
			{ timeout: 15_000 },
		);
		await expect(page).toHaveScreenshot("slot-desktop-result.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "slot-desktop-result-current");

		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
		await expect(page).toHaveScreenshot("slot-desktop-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "slot-desktop-claimed-current");
	});

	test("390px hero and claimed strict references with visible controls", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openSlotHero(page);
		await expect(page).toHaveScreenshot("slot-390-hero.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "slot-390-hero-current");

		await startSlotGame(page);
		const spin = page.getByTestId("slot-spin");
		await expect(spin).toBeVisible();
		const spinBox = await spin.boundingBox();
		expect(spinBox).toBeTruthy();
		if (spinBox) {
			expect(spinBox.x).toBeGreaterThanOrEqual(0);
			expect(spinBox.y).toBeGreaterThanOrEqual(0);
			expect(spinBox.x + spinBox.width).toBeLessThanOrEqual(390);
			expect(spinBox.y + spinBox.height).toBeLessThanOrEqual(844);
		}
		await page.getByTestId("slot-spin").click();
		await expect(page.getByTestId("slot-machine")).toHaveAttribute(
			"data-slot-phase",
			"result",
			{ timeout: 15_000 },
		);
		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(SLOT_SECRET, { exact: true })).toBeVisible();
		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(overflow).toBe(false);
		await expect(page).toHaveScreenshot("slot-390-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "slot-390-claimed-current");
	});
});
