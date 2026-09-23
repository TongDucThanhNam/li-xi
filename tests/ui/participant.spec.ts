 
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { ParticipantFixtureApi } from "./fixtures/participant-convex-mock";

/**
 * Participant UI integration tests over the ACTUAL PublicShareEntryFeature +
 * registry stages (tests/ui/fixtures/participant-*.*) with synthetic
 * publicPlay responses. UI integration scope only — NOT real-backend tests.
 * Fixture controls on window.__participantFixture change mock data and
 * response timing only.
 */

const WHEEL_SECRET = "SYNTHETIC-STORED-CODE";

// Fresh current-run participant checkpoints land in this ignored artifacts
// folder and are attached to the reports for direct image review.
const SCREENSHOT_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"artifacts/screenshots",
);

const participant = {
	setResultDelivery(page: Page, mode: "immediate" | "delayed") {
		return page.evaluate(
			([mode]) =>
				(
					window as unknown as { __participantFixture: ParticipantFixtureApi }
				).__participantFixture.setResultDelivery(mode),
			[mode],
		);
	},
	deliverOutcomes(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.deliverOutcomes(),
		);
	},
	setClaimDelivery(page: Page, mode: "immediate" | "delayed") {
		return page.evaluate(
			([mode]) =>
				(
					window as unknown as { __participantFixture: ParticipantFixtureApi }
				).__participantFixture.setClaimDelivery(mode),
			[mode],
		);
	},
	deliverClaim(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.deliverClaim(),
		);
	},
	dropNextStart(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.dropNextStart(),
		);
	},
	closeEntry(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.closeEntry(),
		);
	},
	counters(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.counters(),
		);
	},
	lastClaim(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.lastClaim(),
		);
	},
	lastPlay(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.lastPlay(),
		);
	},
	createdSessions(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.createdSessions(),
		);
	},
	startCalls(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.calls("publicPlay:startPublicPlaySession") as Array<{
				startKey: string;
			}>,
		);
	},
	actionCalls(page: Page) {
		return page.evaluate(() =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.calls("publicPlay:playSessionAction") as Array<{
				sessionId: string;
				sessionToken: string;
				action: { type: string; envelopeIndex?: number };
			}>,
		);
	},
};

/** Uncaught page errors and unexpected console errors fail the suite. */
let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
	pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
	page.on("console", (message) => {
		// Only external font-host failures are tolerated (offline runs);
		// local asset failures still fail the suite.
		const externalFont =
			/fonts\.(googleapis|gstatic)\.com/.test(message.text()) ||
			/fonts\.(googleapis|gstatic)\.com/.test(message.location().url ?? "");
		if (message.type() === "error" && !externalFont) {
			pageErrors.push(message.text());
		}
	});
});
test.afterEach(async () => {
	expect(pageErrors).toEqual([]);
});

/** Await registered webfont readiness before visual checkpoints. */
async function awaitFonts(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

/** Semantic readiness for the wheel hero on a fresh open. */
async function openWheelHero(page: Page, share = "wheel") {
	await page.goto(`/participant.html?share=${share}`);
	const start = page.getByRole("button", { name: "Bắt đầu" });
	await expect(start).toBeVisible();
	await awaitFonts(page);
	return start;
}

/**
 * The stage-mounted marker: the wheel disc only renders inside the actual
 * stage, so once it is visible the hero has been replaced by the playable
 * stage and the only remaining "Bắt đầu" button is the spin.
 */
async function waitWheelStage(page: Page) {
	await expect(page.getByRole("img", { name: "Vòng quay may mắn" })).toBeVisible();
}

/** Spin CTA click + result-region readiness (the spin animates ~4s). */
async function spinWheel(page: Page, outcomeLabel: string) {
	await waitWheelStage(page);
	const spin = page.getByRole("button", { name: "Bắt đầu" });
	await expect(spin).toBeVisible();
	await spin.click();
	await expect(page.getByRole("region", { name: "Kết quả vòng quay" })).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByRole("heading", { name: outcomeLabel })).toBeVisible();
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

test("wheel: load admits nothing; start/spin/claim; secret only after claim; reload recovers", async ({
	page,
}) => {
	const start = await openWheelHero(page);
	let counters = await participant.counters(page);
	expect(counters.starts).toBe(0);
	expect(counters.admissionCount).toBe(0);
	expect(counters.stock).toBe(5);

	// Deliberate Start admits one session and mounts the wheel stage.
	await start.click();
	await waitWheelStage(page);
	counters = await participant.counters(page);
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);

	// Deliberate spin awards the configured voucher (stock-backed pool).
	await spinWheel(page, "Voucher quà tặng");

	// The private secret appears only after the claim.
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();

	// Finish reaches completion.
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	// Reload recovers the same capability without another start/play/claim.
	await page.reload();
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
	counters = await participant.counters(page);
	expect(counters.starts).toBe(1);
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
	expect(counters.admissionCount).toBe(1);
});

test("wheel: delayed outcome/claim waits on reload and keeps the stored code", async ({
	page,
}) => {
	const start = await openWheelHero(page);
	await participant.setResultDelivery(page, "delayed");
	await participant.setClaimDelivery(page, "delayed");

	await start.click();
	await waitWheelStage(page);
	await spinWheel(page, "Voucher quà tặng");
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();

	// Reload with delayed delivery: recovery waits for its own queries.
	await page.reload();
	await expect(page.getByText("Đang khôi phục lượt chơi của bạn…")).toBeVisible();
	await participant.deliverOutcomes(page);
	await expect(page.getByText("Đang tải chi tiết phần thưởng…")).toBeVisible();
	await participant.deliverClaim(page);
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	const counters = await participant.counters(page);
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(1);
});

test("engagement wheel and li-xi: configured thank-you, no claim request, usable Finish", async ({
	page,
}) => {
	await page.goto("/participant.html?share=wheel-engagement");
	const engagementStart = page.getByRole("button", { name: "Bắt đầu" });
	await expect(engagementStart).toBeVisible();
	await engagementStart.click();
	await waitWheelStage(page);
	await page.getByRole("button", { name: "Bắt đầu" }).click();
	await expect(page.getByRole("region", { name: "Kết quả vòng quay" })).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByRole("heading", { name: "Cảm ơn bạn đã tham gia" })).toBeVisible();
	// No claim action for a no-reward result; Finish completes directly.
	await expect(page.getByRole("button", { name: "Nhận quà" })).toBeHidden();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
	let counters = await participant.counters(page);
	expect(counters.plays).toBe(1);
	expect(counters.claims).toBe(0);

	// Li-xi: distinct template interaction (envelope reveal) with the same
	// guaranteed thank-you contract. The card itself signals readiness via
	// tabindex 0 once the intro completes. Load admits nothing.
	await page.goto("/participant.html?share=lunar");
	const lunarStart = page.getByRole("button", { name: "Bắt đầu" });
	await expect(lunarStart).toBeVisible();
	expect(await participant.counters(page)).toMatchObject({ starts: 0, admissionCount: 0 });
	await lunarStart.click();
	await expect(lunarStart).toBeHidden();
	counters = await participant.counters(page);
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);
	const envelope = page.getByRole("button", { name: "Phong bao số 1", exact: true });
	await expect(envelope).toHaveAttribute("tabindex", "0");
	await envelope.click();
	await expect(page.getByRole("heading", { name: "Hẹn gặp lại" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Nhận quà" })).toBeHidden();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
	// Reveal action identity and arguments: the first envelope of THIS session.
	const actions = await participant.actionCalls(page);
	expect(actions).toHaveLength(1);
	expect(actions[0].action).toEqual({ type: "reveal-envelope", envelopeIndex: 0 });
	expect(actions[0].sessionId).toContain("uilunar000000000000000");
	expect(actions[0].sessionToken).toBe(`${actions[0].sessionId}-token`);
	counters = await participant.counters(page);
	expect(counters.claims).toBe(0);
});

test("lost first Start response: retry reuses the persisted start key for one admission", async ({
	page,
}) => {
	const start = await openWheelHero(page);
	await participant.dropNextStart(page);

	await start.click();
	await expect(page.getByText("Mất phản hồi bắt đầu (mô phỏng)")).toBeVisible();
	let counters = await participant.counters(page);
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);

	// Retry recovers the same admitted session.
	await start.click();
	await waitWheelStage(page);
	counters = await participant.counters(page);
	expect(counters.starts).toBe(2);
	expect(counters.admissionCount).toBe(1);

	await spinWheel(page, "Voucher quà tặng");
	const lastPlay = await participant.lastPlay(page);
	expect(lastPlay?.sessionId).toBe("uiwheel000000000000000-session-1");
	expect(lastPlay?.sessionToken).toBe("uiwheel000000000000000-session-1-token");
	// Both start attempts carried the SAME persisted start key.
	const startCalls = await participant.startCalls(page);
	expect(startCalls).toHaveLength(2);
	expect(startCalls[0].startKey).toBeTruthy();
	expect(startCalls[0].startKey).toBe(startCalls[1].startKey);
});

test("delayed outcome and entry closure cannot erase a successful action result", async ({
	page,
}) => {
	const start = await openWheelHero(page);
	await participant.setResultDelivery(page, "delayed");
	await start.click();
	await waitWheelStage(page);
	await page.getByRole("button", { name: "Bắt đầu" }).click();
	// The action response is in hand: the result stays visible even before
	// the reactive outcome query catches up…
	await expect(page.getByRole("heading", { name: "Voucher quà tặng" })).toBeVisible();
	// …and after the entry closes entirely.
	await participant.closeEntry(page);
	await expect(page.getByRole("heading", { name: "Voucher quà tặng" })).toBeVisible();
	// Unclaimed result: leave via the dedicated exit (archives the capability).
	await page.getByRole("button", { name: "Rời trang (để dành phần thưởng)" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
	await participant.deliverOutcomes(page);
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
});

test("in-hand claimed code survives delayed queries and entry closure", async ({
	page,
}) => {
	const start = await openWheelHero(page);
	await participant.setClaimDelivery(page, "delayed");
	await participant.setResultDelivery(page, "delayed");
	await start.click();
	await waitWheelStage(page);
	await page.getByRole("button", { name: "Bắt đầu" }).click();
	await expect(page.getByRole("heading", { name: "Voucher quà tặng" })).toBeVisible();

	// The claim response is in hand: the code shows without any query.
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();

	// Entry closure and pending reactive queries cannot erase it.
	await participant.closeEntry(page);
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
	await participant.deliverClaim(page);
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();
});

test("viewed saved reward and active play keep separate capabilities", async ({
	page,
}) => {
	// Arrange: a saved UNCLAIMED voucher capability in history (product
	// storage) plus its backend session, seeded via the deterministic
	// `?seed=saved-unclaimed` scenario.
	await page.addInitScript(() => {
		window.localStorage.setItem(
			// Page-world literal: module constants are unavailable in init scripts.
			"cx.play-claims.uiwheel000000000000000",
			JSON.stringify([{ sessionId: "saved-session-1", sessionToken: "saved-token-1" }]),
		);
	});
	const start = await openWheelHero(page, "wheel&seed=saved-unclaimed");

	// Play the CURRENT session but leave the reward unclaimed on completion.
	await start.click();
	await waitWheelStage(page);
	await page.getByRole("button", { name: "Bắt đầu" }).click();
	await expect(page.getByRole("heading", { name: "Voucher quà tặng" })).toBeVisible();
	await page.getByRole("button", { name: "Rời trang (để dành phần thưởng)" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	// Saved reward stays reachable on the completion surface. History shows
	// the newest award first: the current (just-finished) row first, the
	// seeded saved row last.
	const currentOpen = page.getByRole("button", { name: "Mở để nhận thưởng" }).first();
	const savedOpen = page.getByRole("button", { name: "Mở để nhận thưởng" }).last();
	await expect(currentOpen).toBeVisible();
	await expect(savedOpen).toBeVisible();
	await savedOpen.click();

	// Viewing uses the SAVED capability: claiming targets its id/token.
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText("SAVED-STORED-CODE")).toBeVisible();
	const savedClaim = await participant.lastClaim(page);
	expect(savedClaim?.sessionId).toBe("saved-session-1");
	expect(savedClaim?.sessionToken).toBe("saved-token-1");

	// Return to the prior surface; the active play result remains separate.
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	// Reopen the CURRENT (unclaimed) saved award and claim it for real.
	await currentOpen.click();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	const activeClaim = await participant.lastClaim(page);
	expect(activeClaim?.sessionId).toBe("uiwheel000000000000000-session-1");
	expect(activeClaim?.sessionToken).toBe("uiwheel000000000000000-session-1-token");
	expect(activeClaim?.sessionId).not.toBe(savedClaim?.sessionId);

	const counters = await participant.counters(page);
	expect(counters.claims).toBe(2);
	expect(counters.plays).toBe(1);
});

test("older saved reward is claimed while the current session is admitted and unplayed; the SAME current session then plays and claims", async ({
	page,
}) => {
	// Arrange the saved capability, then open and START the current session —
	// its capability is captured while still unplayed.
	await page.addInitScript(() => {
		window.localStorage.setItem(
			// Page-world literal: module constants are unavailable in init scripts.
			"cx.play-claims.uiwheel000000000000000",
			JSON.stringify([{ sessionId: "saved-session-1", sessionToken: "saved-token-1" }]),
		);
	});
	const start = await openWheelHero(page, "wheel&seed=saved-unclaimed");
	await start.click();
	await waitWheelStage(page);
	// The seeded saved session is completed; the admitted CURRENT session is
	// the active one.
	const sessions = await participant.createdSessions(page);
	const current = sessions.find((session) => session.status === "active");
	if (!current) {
		throw new Error("No admitted current session after Start");
	}
	expect(current.claimed).toBe(false);
	expect(
		sessions.find((session) => session.sessionId === "saved-session-1")?.status,
	).toBe("completed");
	let counters = await participant.counters(page);
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);
	expect(counters.plays).toBe(0);
	expect(counters.claims).toBe(0);

	// Claim the OLDER saved reward while the current session stays admitted
	// and unplayed: the saved-reward footer is reachable from the stage.
	const savedOpen = page.getByRole("button", { name: "Mở để nhận thưởng" });
	await expect(savedOpen).toBeVisible();
	await savedOpen.click();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText("SAVED-STORED-CODE")).toBeVisible();
	const savedClaim = await participant.lastClaim(page);
	expect(savedClaim?.sessionId).toBe("saved-session-1");
	expect(savedClaim?.sessionToken).toBe("saved-token-1");
	counters = await participant.counters(page);
	// No premature CURRENT action: still one admission, zero plays.
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);
	expect(counters.plays).toBe(0);
	expect(counters.claims).toBe(1);
	const currentAfterSavedClaim = (await participant.createdSessions(page)).find(
		(session) => session.sessionId === current?.sessionId,
	);
	expect(currentAfterSavedClaim?.claimed).toBe(false);
	expect(currentAfterSavedClaim?.status).toBe("active");

	// Return from the saved view to the SAME current session: no new Start.
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await waitWheelStage(page);
	counters = await participant.counters(page);
	expect(counters.starts).toBe(1);
	expect(counters.admissionCount).toBe(1);

	// The SAME current capability now plays and claims its own award.
	await page.getByRole("button", { name: "Bắt đầu" }).click();
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
	const activeClaim = await participant.lastClaim(page);
	expect(activeClaim?.sessionId).toBe(current.sessionId);
	expect(activeClaim?.sessionToken).toBe(current.sessionToken);
	expect(activeClaim?.sessionId).not.toBe(savedClaim?.sessionId);
	counters = await participant.counters(page);
	expect(counters.claims).toBe(2);
	expect(counters.plays).toBe(1);
	// Stock decremented once at the CURRENT rewarded play (the saved award was
	// seeded, not drawn from stock).
	expect(counters.stock).toBe(4);
	const currentFinal = (await participant.createdSessions(page)).find(
		(session) => session.sessionId === current?.sessionId,
	);
	expect(currentFinal?.claimed).toBe(true);
	expect(currentFinal?.status).toBe("completed");
});

test.describe("wheel presentation and motion (native no-preference)", () => {
	test.use({ reducedMotion: "no-preference" });

	test("keyboard play uses the real 4.2s spin easing and focuses the result", async ({
		page,
	}) => {
		await openWheelHero(page);
		const start = page.getByRole("button", { name: "Bắt đầu" });
		await start.click();
		await waitWheelStage(page);
		const spin = page.getByRole("button", { name: "Bắt đầu" });
		await expect(spin).toBeVisible();
		await spin.focus();
		// Keyboard play (no mouse): the disc transition carries the registered
		// spin easing with a nonzero duration while spinning.
		await spin.press("Enter");
		// Spinning readiness: the spin CTA leaves the DOM while the wheel turns.
		await expect(spin).toBeHidden();
		const preference = await page.evaluate(() =>
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		);
		expect(preference).toBe(false);
		const motion = await discMotion(page);
		expect(motion.transitionDuration).toBe("4.2s");
		expect(motion.transitionProperty).toContain("transform");
		expect(motion.easingVariable).toContain("cubic-bezier");
		// Result readiness: the result primary control holds keyboard focus.
		await expect(
			page.getByRole("heading", { name: "Voucher quà tặng" }),
		).toBeVisible();
		const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
		expect(focused).toMatch(/Nhận quà|Hoàn tất/);
	});
});

test.describe("native reduced motion suppression", () => {
	test.use({ reducedMotion: "reduce" });

	test("reduced motion suppresses the spin transition while the result still lands", async ({
		page,
	}) => {
		await openWheelHero(page);
		const start = page.getByRole("button", { name: "Bắt đầu" });
		await start.click();
		await waitWheelStage(page);
		const spin = page.getByRole("button", { name: "Bắt đầu" });
		await expect(spin).toBeVisible();
		await spin.focus();
		await spin.press("Enter");
		const preference = await page.evaluate(() =>
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		);
		expect(preference).toBe(true);
		const motion = await discMotion(page);
		expect(motion.transitionDuration).toBe("0s");
		await expect(page.getByRole("heading", { name: "Voucher quà tặng" })).toBeVisible();
		const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
		expect(focused).toMatch(/Nhận quà|Hoàn tất/);
	});
});


async function discMotion(page: Page) {
	return page.evaluate(() => {
		const disc = document.querySelector<HTMLElement>(".wheel-disc");
		if (!disc) {
			return {
				transitionDuration: "missing",
				transitionProperty: "missing",
				easingVariable: "missing",
			};
		}
		const style = window.getComputedStyle(disc);
		return {
			transitionDuration: style.transitionDuration,
			transitionProperty: style.transitionProperty,
			easingVariable: style.getPropertyValue("--ease-wheel-spin").trim(),
		};
	});
}

test.describe("participant visual checkpoints (desktop + 390px)", () => {
	const hasHorizontalOverflow = (page: Page) =>
		page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
		);

	test("desktop hero and result checkpoints with fonts loaded", async ({
		page,
	}, testInfo) => {
		await openWheelHero(page);
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page.getByTestId("participant-root")).toHaveScreenshot(
			`participant-hero-desktop-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "participant-hero-desktop-current");

		await startWheelPlayAndSpinByKey(page);
		await expect(
			page.getByRole("heading", { name: "Voucher quà tặng" }),
		).toBeVisible();
		// The randomized wheel disc is excluded: the deterministic result
		// region carries the outcome, code and controls. Unclaimed reference:
		// claim CTA + leave action, no private code.
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			`participant-result-desktop-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "participant-result-desktop-current");

		// Claimed reference: the original code and a usable Finish.
		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			`participant-claimed-result-desktop-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "participant-claimed-result-desktop-current");
	});

	test("390px hero and result checkpoints with fonts loaded", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openWheelHero(page);
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await expect(page.getByTestId("participant-root")).toHaveScreenshot(
			`participant-hero-390-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "participant-hero-390-current");

		await startWheelPlayAndSpinByKey(page);
		await expect(
			page.getByRole("heading", { name: "Voucher quà tặng" }),
		).toBeVisible();
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			`participant-result-390-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "participant-result-390-current");

		// Claimed reference with the original code and usable Finish.
		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(WHEEL_SECRET, { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Hoàn tất" })).toBeVisible();
		await expect(page.locator(".wheel-result")).toHaveScreenshot(
			`participant-claimed-result-390-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "participant-claimed-result-390-current");
	});
});

async function startWheelPlayAndSpinByKey(page: Page) {
	const start = page.getByRole("button", { name: "Bắt đầu" });
	await expect(start).toBeVisible();
	await start.click();
	await waitWheelStage(page);
	const spin = page.getByRole("button", { name: "Bắt đầu" });
	await expect(spin).toBeVisible();
	await spin.focus();
	await spin.press("Enter");
}
