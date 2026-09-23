import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { ParticipantFixtureApi } from "./fixtures/participant-convex-mock";

/**
 * Scratch-card UI integration tests over the ACTUAL PublicShareEntryFeature
 * + ScratchCardStage (tests/ui/fixtures/participant-*.*) with synthetic
 * publicPlay responses. UI integration scope only — NOT real-backend tests.
 * Fixture controls on window.__participantFixture change mock data and
 * response timing only.
 *
 * Interaction model under test (docs/design-scratch-card.md): erasing is
 * independent from the once-only reveal request; the frozen threshold only
 * governs when the remaining coating auto-clears AFTER the authoritative
 * outcome is in hand; the keyboard/clear control lives outside the coated
 * card so nothing interactive is ever occluded.
 */

const SCRATCH_SECRET = "SYNTHETIC-SCRATCH-CODE";
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
			setResultDelivery: api.setResultDelivery,
			deliverOutcomes: api.deliverOutcomes,
			setClaimDelivery: api.setClaimDelivery,
			deliverClaim: api.deliverClaim,
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

/** Semantic readiness for the scratch hero on a fresh open. */
async function openScratchHero(page: Page, share = "scratch") {
	await page.goto(`/participant.html?share=${share}`);
	const start = page.getByRole("button", { name: "Bắt đầu" });
	await expect(start).toBeVisible();
	await awaitFonts(page);
	return start;
}

async function startScratchGame(page: Page, share = "scratch") {
	const start = await openScratchHero(page, share);
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	return start;
}

/**
 * Real deliberate scratch strokes: pointer down → long erasing moves → up.
 * Two passes comfortably cross the 10% presentation threshold of the default
 * scratch scenario (the stage measures actual canvas coverage).
 */
async function scratchStrokes(page: Page, passes = 2) {
	const canvas = page.getByTestId("scratch-canvas");
	const box = await canvas.boundingBox();
	expect(box).toBeTruthy();
	if (!box) return;
	for (let pass = 0; pass < passes; pass += 1) {
		const y = box.y + box.height * (pass % 2 === 0 ? 0.4 : 0.6);
		await page.mouse.move(box.x + box.width * 0.15, y);
		await page.mouse.down();
		for (let step = 0; step <= 8; step += 1) {
			await page.mouse.move(box.x + box.width * (0.15 + step * 0.0875), y);
		}
		await page.mouse.up();
	}
}

/** Keyboard activation of the reveal (works even before any pointer input). */
async function keyboardReveal(page: Page) {
	const reveal = page.getByTestId("scratch-keyboard-reveal");
	await expect(reveal).toHaveText(/Gỡ lớp phủ bằng bàn phím/);
	await reveal.focus();
	await reveal.press("Enter");
}

/**
 * After the outcome is in hand but the coating persists, the same control
 * becomes the immediate full-clear bypass. Falls back to measured-coverage
 * auto-clear when the coating already opened itself.
 */
async function openResultPanel(page: Page) {
	const clearButton = page.getByRole("button", { name: "Gỡ lớp phủ ngay" });
	try {
		await clearButton.click({ timeout: 2_000 });
	} catch {
		// Coating auto-cleared via threshold; the result panel is arriving.
	}
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 10_000 });
}

test("scratch: load admits nothing; keyboard reveal, bypass clear, claim, Finish", async ({
	page,
}) => {
	const start = await openScratchHero(page);
	let counters = (await fixtureApi(page)).counters;
	expect(counters.starts).toBe(0);
	expect(counters.admissionCount).toBe(0);
	expect(counters.stock).toBe(5);

	// Deliberate Start admits one session and mounts the scratch stage.
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	counters = (await fixtureApi(page)).counters;
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);

	// Keyboard alternative authorizes the ONE server reveal.
	await keyboardReveal(page);
	// Threshold 10 with no measured coverage: the coating persists and the
	// control flips into the immediate full-clear bypass.
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	await expect(
		page.getByText("Kết quả đã sẵn sàng — chà tiếp hoặc gỡ lớp phủ"),
	).toBeVisible();

	await openResultPanel(page);
	// Exactly one result presentation, with the teaser gone.
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toHaveCount(1);
	await expect(page.getByTestId("scratch-beneath")).toHaveCount(0);

	// Claim: the private code appears only after the claim.
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();

	// Finish reaches completion.
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4);
});

test("scratch: reload recovers the completed card without replaying", async ({
	page,
}) => {
	await startScratchGame(page);
	await keyboardReveal(page);
	await openResultPanel(page);
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	await page.reload();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.starts).toBe(1);
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
});

test("scratch: reload before claiming keeps the reward claimable", async ({
	page,
}) => {
	await startScratchGame(page);
	await keyboardReveal(page);
	await openResultPanel(page);
	// Leave WITHOUT claiming: the outcome is immutable, the claim stays open.
	await page.getByRole("button", { name: "Rời trang (để dành phần thưởng)" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	await page.reload();
	// The recovered outcome re-opens the card directly — no re-scratching.
	await expect(page.getByTestId("scratch-result-panel")).toBeVisible();
	await expect(page.getByTestId("scratch-canvas")).toHaveCount(0);
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4);
});

test("scratch: slow result delivery keeps the in-hand outcome visible once", async ({
	page,
}) => {
	// Single navigation: fixture state set BEFORE Start must live in the same
	// mock instance that serves the reveal.
	const start = await openScratchHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setResultDelivery("delayed");
	});
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	await keyboardReveal(page);
	await openResultPanel(page);
	// The reactive outcome query is still lagging; deliver it and confirm no
	// duplicate result presentation appears.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverOutcomes();
	});
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toHaveCount(1);
});

test("scratch: delayed reveal holds allocation; continued strokes fire once", async ({
	page,
}) => {
	const start = await openScratchHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("delayed");
	});
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();

	// First deliberate stroke fires exactly one held reveal request.
	await scratchStrokes(page, 1);
	await expect(page.getByText("Đang mở thẻ…")).toBeVisible();

	// Strokes during the in-flight request keep erasing and NEVER re-fire.
	await scratchStrokes(page, 2);
	let calls = await page.evaluate(() =>
		(window as unknown as { __participantFixture: ParticipantFixtureApi })
			.__participantFixture.calls("publicPlay:playSessionAction").length,
	);
	expect(calls).toBe(1);

	// Delivering the held action allocates ONCE and the measured coverage
	// (≥10%) auto-clears the remaining coating.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverActions();
	});
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 15_000 });

	calls = await page.evaluate(() =>
		(window as unknown as { __participantFixture: ParticipantFixtureApi })
			.__participantFixture.calls("publicPlay:playSessionAction").length,
	);
	expect(calls).toBe(1);
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.stock).toBe(4);
});

test("scratch: failed reveal offers retry; retry replays the same allocation", async ({
	page,
}) => {
	const start = await openScratchHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("fail-once");
	});
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();

	// CLICK activation (the control sits outside the coated card).
	await page.getByTestId("scratch-keyboard-reveal").click();
	await expect(
		page.getByText("Mất phản hồi mở thẻ (mô phỏng) — hãy thử lại."),
	).toBeVisible();
	// The failed reveal allocated nothing; the coating is still scratchable.
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();

	// Retry: second deliberate input replays the capability and succeeds.
	await page.getByTestId("scratch-keyboard-reveal").click();
	await openResultPanel(page);

	const calls = await page.evaluate(() =>
		(window as unknown as { __participantFixture: ParticipantFixtureApi })
			.__participantFixture.calls("publicPlay:playSessionAction").length,
	);
	expect(calls).toBe(2);
	const counters = (await fixtureApi(page)).counters;
	expect(counters.stock).toBe(4);
	expect(counters.claims).toBe(0);
});

test("scratch: pointer strokes auto-clear at the measured threshold", async ({
	page,
}) => {
	await startScratchGame(page);
	// Two passes cross the 10% threshold with real measured coverage; the
	// coating auto-clears WITHOUT any button press once the outcome lands.
	await scratchStrokes(page, 2);
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 15_000 });
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(0);
});

test("scratch: threshold 100 keeps the coating until the explicit full-clear", async ({
	page,
}) => {
	// scratch-high freezes threshold 100 and the teal cover palette.
	await startScratchGame(page, "scratch-high");
	// Delayed reactive delivery must not bypass the presentation threshold
	// while the LOCAL play holds the outcome.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setResultDelivery("delayed");
	});
	const canvas = page.getByTestId("scratch-canvas");
	const foilColor = await canvas.evaluate((element) => {
		const ctx = (element as HTMLCanvasElement).getContext("2d");
		const data = ctx?.getImageData(2, 2, 1, 1).data;
		return data ? [data[0], data[1], data[2]] : null;
	});
	// Teal foil, visibly distinct from the gold default (#e9c96a → warm R>G).
	expect(foilColor).toBeTruthy();
	if (foilColor) {
		expect(foilColor[1]).toBeGreaterThan(foilColor[0]);
	}

	await keyboardReveal(page);
	// Outcome in hand but 0% coverage < 100%: no auto-clear, no result yet.
	await expect(canvas).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeHidden();
	// The lagging live query delivering the SAME local play must not open
	// the card: adoption is refused while a local outcome is in hand.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverOutcomes();
	});
	await expect(canvas).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeHidden();
	// The full-clear bypass (click) opens the card immediately.
	await page.getByRole("button", { name: "Gỡ lớp phủ ngay" }).click();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 10_000 });
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.stock).toBe(4);
});

test("scratch: pointer cancel mid-stroke stays safe; reveal still lands once", async ({
	page,
}) => {
	await startScratchGame(page);
	// Synthetic touch stroke cancelled mid-way (no real pointer id exists).
	await page.evaluate(() => {
		const canvas = document.querySelector(
			'[data-testid="scratch-canvas"]',
		) as HTMLCanvasElement | null;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const point = (x: number, y: number) =>
			new PointerEvent("pointerdown", {
				bubbles: true,
				cancelable: true,
				pointerId: 7,
				pointerType: "touch",
				isPrimary: true,
				buttons: 1,
				clientX: x,
				clientY: y,
			});
		const move = (x: number, y: number) =>
			new PointerEvent("pointermove", {
				bubbles: true,
				cancelable: true,
				pointerId: 7,
				pointerType: "touch",
				isPrimary: true,
				buttons: 1,
				clientX: x,
				clientY: y,
			});
		canvas.dispatchEvent(point(rect.left + rect.width * 0.3, rect.top + rect.height * 0.5));
		for (let step = 1; step <= 5; step += 1) {
			canvas.dispatchEvent(
				move(
					rect.left + rect.width * (0.3 + step * 0.08),
					rect.top + rect.height * 0.5,
				),
			);
		}
		canvas.dispatchEvent(
			new PointerEvent("pointercancel", {
				bubbles: true,
				cancelable: true,
				pointerId: 7,
				pointerType: "touch",
				isPrimary: true,
			}),
		);
	});
	// The cancelled stroke must not break the stage: the reveal it authorized
	// still lands once, and the card opens (bypass click or threshold
	// auto-clear, whichever wins the race).
	await openResultPanel(page);
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.stock).toBe(4);
});

test.describe("native reduced motion", () => {
	test.use({ reducedMotion: "reduce" });

	test("scratch: reduced motion clears the coating without the fade", async ({
		page,
	}) => {
		await startScratchGame(page);
		await scratchStrokes(page, 2);
		// No 700ms fade: the coating unmounts as soon as threshold met.
		await expect(page.getByTestId("scratch-canvas")).toBeHidden({
			timeout: 5_000,
		});
		await expect(
			page.getByRole("heading", { name: "Voucher quà tặng" }),
		).toBeVisible();
		const counters = (await fixtureApi(page)).counters;
		expect(counters.plays).toBe(1);
	});
});

test("scratch: engagement mode with stocked inventory never consumes stock", async ({
	page,
}) => {
	const start = await openScratchHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setEngagement(true);
	});
	await start.click();
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	await keyboardReveal(page);
	// Engagement outcome: the full-clear bypass opens the thank-you card.
	await page.getByRole("button", { name: "Gỡ lớp phủ ngay" }).click();
	await expect(
		page.getByRole("heading", { name: "Chúc bạn may mắn" }),
	).toBeVisible({ timeout: 10_000 });
	await expect(page.getByRole("button", { name: "Nhận quà" })).toHaveCount(0);
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(0);
	expect(counters.stock).toBe(5);
});

test("scratch: 390px readable card, no overflow", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openScratchHero(page);
	await awaitFonts(page);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(overflow).toBe(false);
	await saveFreshCheckpoint(page, testInfo, "scratch-390-hero-current");

	await startScratchGame(page);
	await keyboardReveal(page);
	await openResultPanel(page);
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	const overflowAfter = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(overflowAfter).toBe(false);
	await saveFreshCheckpoint(page, testInfo, "scratch-390-claimed-current");
});

/** WCAG 2.x relative luminance/contrast over sRGB 8-bit triples. */
function srgbToLuminance(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function relativeLuminance(rgb: [number, number, number]): number {
	return (
		0.2126 * srgbToLuminance(rgb[0]) +
		0.7152 * srgbToLuminance(rgb[1]) +
		0.0722 * srgbToLuminance(rgb[2])
	);
}
function contrastRatio(
	a: [number, number, number],
	b: [number, number, number],
): number {
	const first = relativeLuminance(a);
	const second = relativeLuminance(b);
	const [lighter, darker] =
		first >= second ? [first, second] : [second, first];
	return (lighter + 0.05) / (darker + 0.05);
}

type Rgba = { rgb: [number, number, number]; alpha: number };

function parseCssColor(text: string): Rgba {
	const parts = text
		.replace(/^rgba?\(|\)$/g, "")
		.split(",")
		.map((value) => parseFloat(value.trim()));
	return {
		rgb: [parts[0], parts[1], parts[2]],
		alpha: parts.length > 3 ? parts[3] : 1,
	};
}

function compositeOver(
	foreground: Rgba,
	background: [number, number, number],
): [number, number, number] {
	return [
		foreground.rgb[0] * foreground.alpha + background[0] * (1 - foreground.alpha),
		foreground.rgb[1] * foreground.alpha + background[1] * (1 - foreground.alpha),
		foreground.rgb[2] * foreground.alpha + background[2] * (1 - foreground.alpha),
	];
}

/**
 * Coating instruction readability: the chip-backed hint must keep ≥ 4.5:1
 * (normal small text) against the WORST-CASE foil pixel actually rendered
 * beneath it, on every frozen coverStyle palette (gold/teal/crimson).
 * The canvas is sampled directly under the chip's box, composited with the
 * chip's real rgba background, and compared against the real text color.
 */
for (const [cover, share] of [
	["gold", "scratch"],
	["teal", "scratch-high"],
	["crimson", "scratch-crimson"],
] as const) {
	test(`scratch: coating instruction keeps 4.5:1 contrast on ${cover} foil`, async ({
		page,
	}) => {
		await startScratchGame(page, share);
		const chip = page.locator(".scratch-cover-hint .scratch-chip");
		await expect(chip).toBeVisible();
		const sample = await page.evaluate(() => {
			const canvas = document.querySelector(
				'[data-testid="scratch-canvas"]',
			) as HTMLCanvasElement | null;
			const chip = document.querySelector(
				".scratch-cover-hint .scratch-chip",
			) as HTMLElement | null;
			if (!canvas || !chip) throw new Error("missing canvas or chip");
			const canvasRect = canvas.getBoundingClientRect();
			const chipRect = chip.getBoundingClientRect();
			const chipStyle = getComputedStyle(chip);
			const bgParts = chipStyle.backgroundColor
				.replace(/^rgba?\(|\)$/g, "")
				.split(",")
				.map((value) => parseFloat(value.trim()));
			const alpha = bgParts.length > 3 ? bgParts[3] : 1;
			const dpr = canvas.width / canvasRect.width;
			const x0 = Math.max(0, Math.floor((chipRect.left - canvasRect.left) * dpr));
			const x1 = Math.min(canvas.width, Math.ceil((chipRect.right - canvasRect.left) * dpr));
			const y0 = Math.max(0, Math.floor((chipRect.top - canvasRect.top) * dpr));
			const y1 = Math.min(canvas.height, Math.ceil((chipRect.bottom - canvasRect.top) * dpr));
			const data = canvas
				.getContext("2d")!
				.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
			let worst: [number, number, number] = [255, 255, 255];
			let worstLuminance = -1;
			for (let index = 0; index < data.length; index += 4) {
				const rgb: [number, number, number] = [
					data[index],
					data[index + 1],
					data[index + 2],
				];
				const luminance =
					0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
				if (luminance > worstLuminance) {
					worstLuminance = luminance;
					worst = rgb;
				}
			}
			const composited: [number, number, number] = [
				bgParts[0] * alpha + worst[0] * (1 - alpha),
				bgParts[1] * alpha + worst[1] * (1 - alpha),
				bgParts[2] * alpha + worst[2] * (1 - alpha),
			];
			return { textColor: chipStyle.color, composited };
		});
		const ratio = contrastRatio(
			parseCssColor(sample.textColor).rgb,
			sample.composited,
		);
		expect(ratio).toBeGreaterThanOrEqual(4.5);
	});
}

test("scratch: opened result keeps 4.5:1 on every cover backdrop", async ({
	page,
}) => {
	// Documented tokens: the MID gradient stop of each beneath-backdrop in
	// scratch-card.css (`.scratch-cover--*`), worst-lit region behind the
	// opened panel; the ::before scrim composites over it.
	const midStops: Record<string, [number, number, number]> = {
		gold: [168, 132, 42],
		teal: [23, 122, 110],
		crimson: [164, 19, 60],
	};
	for (const [cover, share] of [
		["gold", "scratch"],
		["teal", "scratch-high"],
		["crimson", "scratch-crimson"],
	] as const) {
		await startScratchGame(page, share);
		await keyboardReveal(page);
		await page.getByRole("button", { name: "Gỡ lớp phủ ngay" }).click();
		await expect(
			page.getByRole("heading", { name: "Voucher quà tặng" }),
		).toBeVisible({ timeout: 10_000 });
		const claimButton = page.getByRole("button", { name: "Nhận quà" });
		if (await claimButton.isVisible()) {
			await claimButton.click();
			await expect(
				page.getByText("Hướng dẫn nhận thưởng (fixture)."),
			).toBeVisible();
		}

		const measured = await page.evaluate(() => {
			const shell = document.querySelector(
				".scratch-card-shell--open",
			) as HTMLElement | null;
			const eyebrow = shell?.querySelector(
				".scratch-result__eyebrow",
			) as HTMLElement | null;
			const instructions = shell?.querySelector(
				".scratch-result__instructions",
			) as HTMLElement | null;
			if (!shell || !eyebrow) throw new Error("missing opened result");
			return {
				scrim: getComputedStyle(shell, "::before").backgroundColor,
				eyebrowColor: getComputedStyle(eyebrow).color,
				instructionsColor: instructions
					? getComputedStyle(instructions).color
					: null,
			};
		});
		const backdrop = compositeOver(
			parseCssColor(measured.scrim),
			midStops[cover],
		);
		for (const textColor of [measured.eyebrowColor, measured.instructionsColor]) {
			if (!textColor) continue;
			const onBackdrop = compositeOver(parseCssColor(textColor), backdrop);
			expect(contrastRatio(onBackdrop, backdrop)).toBeGreaterThanOrEqual(4.5);
		}
	}
});

test("scratch: closure recovery reopens the card without extra play or stock", async ({
	page,
}) => {
	// scratch-high (threshold 100): a stroke leaves the coating PARTIALLY
	// intact even with the outcome already in hand.
	await startScratchGame(page, "scratch-high");
	await scratchStrokes(page, 1);
	await expect(
		page.getByRole("button", { name: "Gỡ lớp phủ ngay" }),
	).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();

	// Close the game/link while the card is still partially coated.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.closeEntry();
	});
	// The completed capability still recovers its result over the closed
	// entry: the preserved card keeps the SAME local outcome (the surface
	// flips to recovered-result) and the coating stays partially intact —
	// no replay, no re-allocation. The participant uncovers via the bypass.
	await expect(
		page.getByRole("button", { name: "Gỡ lớp phủ ngay" }),
	).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();
	await page.getByRole("button", { name: "Gỡ lớp phủ ngay" }).click();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 10_000 });

	// Claim and reload through the closed link: same immutable outcome.
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();

	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4);
});

test("scratch: outcome completing elsewhere opens the mounted card without re-scratching", async ({
	page,
}) => {
	await startScratchGame(page);
	// The stage is mounted, coated, and has received NO local input.
	await expect(page.getByTestId("scratch-canvas")).toBeVisible();

	// The play completes OUTSIDE this client (another device/tab): the saved
	// outcome arrives through the live query after mount. Recovery semantics
	// (not a local reveal) — the card opens by itself, no stroke, no bypass.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.completeSessionRemotely();
	});
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("scratch-canvas")).toHaveCount(0);

	const counters = (await fixtureApi(page)).counters;
	// No local action ever fired and the allocation happened exactly once.
	expect(counters.plays).toBe(0);
	expect(counters.stock).toBe(4);
});

test("scratch: delayed saved outcome and claim recover stepwise after reload", async ({
	page,
}) => {
	await startScratchGame(page);
	await keyboardReveal(page);
	await openResultPanel(page);
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	// Both recovery reads go in-flight BEFORE the reload.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setResultDelivery("delayed");
		api.setClaimDelivery("delayed");
	});
	await page.reload();

	// Recovery loading is distinct from any local in-flight reveal.
	await expect(
		page.getByText("Đang khôi phục lượt chơi của bạn…"),
	).toBeVisible();
	// Saved outcome lands: the recovered card mounts already open.
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverOutcomes();
	});
	// The claimed reward still needs its private claim detail first.
	await expect(
		page.getByText("Đang tải chi tiết phần thưởng…"),
	).toBeVisible();
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverClaim();
	});
	await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
	await expect(page.getByTestId("scratch-canvas")).toHaveCount(0);

	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
});

test.describe("scratch strict visual references (desktop + 390px)", () => {
	// Frozen clock + awaited fonts + production CSS keep the references
	// deterministic. References are generated ONLY via the explicit update
	// command (npm run test:ui:update); normal verification runs snapshot-none.
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:30:00"));
	});

	test("desktop hero/coated/result/claimed strict references", async ({
		page,
	}, testInfo) => {
		await openScratchHero(page);
		await expect(page).toHaveScreenshot("scratch-desktop-hero.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-desktop-hero-current");

		await startScratchGame(page);
		await expect(page.getByTestId("scratch-canvas")).toBeVisible();
		await expect(page).toHaveScreenshot("scratch-desktop-coated.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-desktop-coated-current");

		await keyboardReveal(page);
		await openResultPanel(page);
		await expect(page).toHaveScreenshot("scratch-desktop-result.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-desktop-result-current");

		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
		await expect(page).toHaveScreenshot("scratch-desktop-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-desktop-claimed-current");
	});

	test("390px hero/coated/claimed strict references with visible controls", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openScratchHero(page);
		await expect(page).toHaveScreenshot("scratch-390-hero.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-390-hero-current");

		await startScratchGame(page);
		// Mobile coating capture: the coated card AND its controls fit.
		const canvas = page.getByTestId("scratch-canvas");
		await expect(canvas).toBeVisible();
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
		const overflowCoated = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(overflowCoated).toBe(false);
		await expect(page).toHaveScreenshot("scratch-390-coated.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-390-coated-current");

		await keyboardReveal(page);
		await openResultPanel(page);
		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(SCRATCH_SECRET, { exact: true })).toBeVisible();
		const overflowClaimed = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(overflowClaimed).toBe(false);
		await expect(page).toHaveScreenshot("scratch-390-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "scratch-390-claimed-current");
	});
});
