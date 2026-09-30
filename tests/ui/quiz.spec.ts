import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { ParticipantFixtureApi } from "./fixtures/participant-convex-mock";

/**
 * Quiz UI integration tests over the ACTUAL PublicShareEntryFeature +
 * QuizStage (tests/ui/fixtures/participant-*.*) with synthetic publicPlay
 * responses. UI integration scope only — NOT real-backend tests (backend
 * semantics live in convex/publicPlay.test.ts and the playEngine coverage).
 *
 * Proven here, per the Stage-2b contract (docs/design-quiz.md): the in-stage
 * ready gate with the pass rule, ordered question progression with ONE
 * server action per answer, no answer-key/explanation leakage before
 * completion, the permitted post-completion answer review, pass/fail
 * grading against passCount, allocation exactly once on pass (never on
 * engagement or fail), held/failed transport retries, mid-quiz reload
 * recovery, and a 390px layout without horizontal overflow.
 */

const QUIZ_SECRET = "SYNTHETIC-QUIZ-CODE";
/** Correct choice index per fixture question (server-private half). */
const CORRECT = [1, 0, 2];
/** Deliberately wrong choice index per fixture question (scores 0). */
const WRONG = [0, 1, 0];
const PASS_COUNT = 2;
const TOTAL = 3;
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

async function openQuizHero(page: Page, share = "quiz") {
	await page.goto(`/participant.html?share=${share}`);
	const start = page.getByRole("button", { name: "Bắt đầu" });
	await expect(start).toBeVisible();
	await awaitFonts(page);
	return start;
}

async function startQuizGame(page: Page, share = "quiz") {
	const start = await openQuizHero(page, share);
	await start.click();
	const ready = page.getByTestId("quiz-ready");
	await expect(ready).toBeVisible();
	return start;
}

async function answerCurrent(page: Page, choiceIndex: number) {
	await page.getByTestId("quiz-choice").nth(choiceIndex).click();
}

async function expectProgress(page: Page, label: string) {
	await expect(page.locator(".quiz-progress__label")).toHaveText(label);
}

async function answerAll(page: Page, choiceIndexes: readonly number[]) {
	for (const choiceIndex of choiceIndexes) {
		await expect(page.getByTestId("quiz-card")).toBeVisible();
		await answerCurrent(page, choiceIndex);
	}
}

test("quiz: answering all questions passes, allocates once and pays the claim", async ({
	page,
}) => {
	const start = await openQuizHero(page);
	// Loading the hero admits nothing.
	let counters = (await fixtureApi(page)).counters;
	expect(counters.starts).toBe(0);
	expect(counters.stock).toBe(5);

	await start.click();
	// In-stage ready gate: quiz meta with the pass rule, no question yet.
	const ready = page.getByTestId("quiz-ready");
	await expect(ready).toContainText(`${TOTAL} câu hỏi`);
	await expect(ready).toContainText(`cần đúng ít nhất ${PASS_COUNT} câu`);
	// The public half never carries the answer key or explanations.
	await expect(page.getByTestId("quiz-review")).toHaveCount(0);
	await expect(page.getByText("Đáp án đúng:")).toHaveCount(0);

	await page.getByTestId("quiz-start").click();
	await expect(page.getByTestId("quiz-card")).toBeVisible();
	await expectProgress(page, "Câu 1/3");

	// KEYBOARD activation of the first server answer action.
	await page.getByTestId("quiz-choice").nth(CORRECT[0]).focus();
	await page.keyboard.press("Enter");
	await expectProgress(page, "Câu 2/3");
	await answerCurrent(page, CORRECT[1]);
	await expectProgress(page, "Câu 3/3");
	await answerCurrent(page, CORRECT[2]);

	const result = page.getByTestId("quiz-result-panel");
	await expect(result).toBeVisible();
	await expect(page.getByTestId("quiz-score")).toHaveText(
		`Bạn đúng ${TOTAL}/${TOTAL} câu — đạt yêu cầu!`,
	);
	await expect(
		page.getByRole("heading", { name: "Voucher quà tặng" }),
	).toBeVisible();
	// Permitted post-completion review: every question with its explanation.
	await expect(page.getByTestId("quiz-review")).toBeVisible();
	await expect(page.getByText("Đáp án đúng:")).toHaveCount(TOTAL);
	await expect(
		page.getByText("Bộ sưu tập dùng ba màu chủ đạo: đỏ, vàng, hồng."),
	).toBeVisible();

	// Private code appears only after claiming.
	await expect(page.getByText(QUIZ_SECRET, { exact: true })).toBeHidden();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(QUIZ_SECRET, { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(TOTAL); // one server action per answer
	expect(counters.claims).toBe(1);
	expect(counters.stock).toBe(4); // allocated exactly once, at grading
});

test("quiz: a held answer keeps the pending state, then advances exactly once", async ({
	page,
}) => {
	const start = await openQuizHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("delayed");
	});
	await start.click();
	await page.getByTestId("quiz-start").click();
	await expect(page.getByTestId("quiz-card")).toBeVisible();

	await answerCurrent(page, CORRECT[0]);
	// The held answer keeps the acknowledgment and a locked interface.
	await expect(page.locator(".quiz-status")).toHaveText(
		"Đang ghi nhận câu trả lời…",
	);
	await expect(page.getByTestId("quiz-choice").first()).toBeDisabled();
	await expectProgress(page, "Câu 1/3");
	expect((await fixtureApi(page)).counters.plays).toBe(1);

	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.deliverActions();
	});
	await expectProgress(page, "Câu 2/3");
	await expect(page.locator(".quiz-status")).toHaveText("");
	// Still exactly ONE deliberate action, and nothing was allocated.
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(1);
	expect(counters.stock).toBe(5);
});

test("quiz: a failed answer records nothing; the retry lands as a new answer", async ({
	page,
}) => {
	const start = await openQuizHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setActionDelivery("fail-once");
	});
	await start.click();
	await page.getByTestId("quiz-start").click();
	await expect(page.getByTestId("quiz-card")).toBeVisible();

	await answerCurrent(page, CORRECT[0]);
	await expect(
		page.getByText("Mất phản hồi ghi nhận câu trả lời (mô phỏng)"),
	).toBeVisible();
	// The failed answer recorded nothing: same question, usable again.
	await expectProgress(page, "Câu 1/3");
	await expect(page.getByTestId("quiz-choice").nth(CORRECT[0])).toBeEnabled();

	// Same choice, same revision: the retry is accepted as a NEW answer.
	await answerCurrent(page, CORRECT[0]);
	await expectProgress(page, "Câu 2/3");
	const counters = (await fixtureApi(page)).counters;
	expect(counters.plays).toBe(2); // two deliberate actions, one recorded
	expect(counters.stock).toBe(5);
});

test("quiz: failing the threshold completes truthfully with the answer review", async ({
	page,
}) => {
	const start = await openQuizHero(page);
	await start.click();
	await page.getByTestId("quiz-start").click();
	await answerAll(page, WRONG);

	const result = page.getByTestId("quiz-result-panel");
	await expect(result).toBeVisible();
	await expect(page.getByTestId("quiz-score")).toHaveText(
		`Bạn đúng 0/${TOTAL} câu — chưa đạt (cần đúng ít nhất ${PASS_COUNT}/${TOTAL} câu).`,
	);
	await expect(
		page.getByRole("heading", { name: "Chưa đạt — cảm ơn bạn đã tham gia" }),
	).toBeVisible();
	// The review is permitted after completion, on a fail too.
	await expect(page.getByTestId("quiz-review")).toBeVisible();
	await expect(page.getByText("Đáp án đúng:")).toHaveCount(TOTAL);
	// No reward, no claim, no stock.
	await expect(page.getByRole("button", { name: "Nhận quà" })).toHaveCount(0);
	await page.getByRole("button", { name: "Hoàn tất" }).click();
	await expect(page.getByRole("heading", { name: "Hoàn tất" })).toBeVisible();

	const counters = (await fixtureApi(page)).counters;
	expect(counters.claims).toBe(0);
	expect(counters.stock).toBe(5);
});

test("quiz: an engagement quiz passes the grade but never allocates stock", async ({
	page,
}) => {
	const start = await openQuizHero(page);
	await page.evaluate(() => {
		const api = (
			window as unknown as { __participantFixture: ParticipantFixtureApi }
		).__participantFixture;
		api.setEngagement(true);
	});
	await start.click();
	await page.getByTestId("quiz-start").click();
	await answerAll(page, CORRECT);

	await expect(page.getByTestId("quiz-result-panel")).toBeVisible();
	await expect(page.getByTestId("quiz-score")).toHaveText(
		`Bạn đúng ${TOTAL}/${TOTAL} câu — đạt yêu cầu!`,
	);
	// Engagement completion stays a truthful no-reward even on a pass.
	await expect(
		page.getByRole("heading", { name: "Chưa đạt — cảm ơn bạn đã tham gia" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Nhận quà" })).toHaveCount(0);
	const counters = (await fixtureApi(page)).counters;
	expect(counters.claims).toBe(0);
	expect(counters.stock).toBe(5);
});

test("quiz: reload mid-quiz recovers progress without re-admitting", async ({
	page,
}) => {
	const start = await openQuizHero(page);
	await start.click();
	await page.getByTestId("quiz-start").click();
	await expect(page.getByTestId("quiz-card")).toBeVisible();
	await answerCurrent(page, CORRECT[0]);
	await expectProgress(page, "Câu 2/3");

	await page.reload();
	// The recovered active session resumes AT the current question — the
	// hero and the ready gate never reappear for stored progress.
	await expectProgress(page, "Câu 2/3");
	await expect(page.getByTestId("quiz-ready")).toHaveCount(0);
	await expect(page.getByTestId("quiz-card")).toBeVisible();

	await answerCurrent(page, CORRECT[1]);
	await expectProgress(page, "Câu 3/3");
	await answerCurrent(page, CORRECT[2]);
	await expect(page.getByTestId("quiz-result-panel")).toBeVisible();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(QUIZ_SECRET, { exact: true })).toBeVisible();

	const counters = (await fixtureApi(page)).counters;
	expect(counters.starts).toBe(1); // reload never re-admits
	expect(counters.stock).toBe(4);
});

test("quiz: 390px question and claimed result stay overflow-free", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openQuizHero(page);
	await awaitFonts(page);
	await saveFreshCheckpoint(page, testInfo, "quiz-390-hero-current");

	await startQuizGame(page);
	await page.getByTestId("quiz-start").click();
	await expect(page.getByTestId("quiz-card")).toBeVisible();
	await expectProgress(page, "Câu 1/3");
	// Every choice control stays inside the viewport.
	const choiceBox = await page.getByTestId("quiz-choice").first().boundingBox();
	expect(choiceBox).toBeTruthy();
	if (choiceBox) {
		expect(choiceBox.x).toBeGreaterThanOrEqual(0);
		expect(choiceBox.y).toBeGreaterThanOrEqual(0);
		expect(choiceBox.x + choiceBox.width).toBeLessThanOrEqual(390);
	}
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		),
	).toBe(false);

	await answerAll(page, CORRECT);
	await expect(page.getByTestId("quiz-result-panel")).toBeVisible();
	await page.getByRole("button", { name: "Nhận quà" }).click();
	await expect(page.getByText(QUIZ_SECRET, { exact: true })).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		),
	).toBe(false);
	await saveFreshCheckpoint(page, testInfo, "quiz-390-claimed-current");
});

test.describe("quiz strict visual references (desktop + 390px)", () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T01:05:00"));
	});

	test("desktop hero/ready/question/claimed strict references", async ({
		page,
	}, testInfo) => {
		const start = await openQuizHero(page);
		await expect(page).toHaveScreenshot("quiz-desktop-hero.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "quiz-desktop-hero-current");

		await start.click();
		const ready = page.getByTestId("quiz-ready");
		await expect(ready).toBeVisible();
		await expect(page).toHaveScreenshot("quiz-desktop-ready.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "quiz-desktop-ready-current");

		await page.getByTestId("quiz-start").click();
		await expect(page.getByTestId("quiz-card")).toBeVisible();
		await expectProgress(page, "Câu 1/3");
		await expect(page).toHaveScreenshot("quiz-desktop-question.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "quiz-desktop-question-current");

		await answerAll(page, CORRECT);
		await expect(page.getByTestId("quiz-result-panel")).toBeVisible();
		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(QUIZ_SECRET, { exact: true })).toBeVisible();
		await expect(page).toHaveScreenshot("quiz-desktop-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "quiz-desktop-claimed-current");
	});

	test("390px question and claimed strict references", async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const start = await openQuizHero(page);
		await awaitFonts(page);
		await start.click();
		await page.getByTestId("quiz-start").click();
		await expect(page.getByTestId("quiz-card")).toBeVisible();
		await expectProgress(page, "Câu 1/3");
		await expect(page).toHaveScreenshot("quiz-390-question.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "quiz-390-question-current");

		await answerAll(page, CORRECT);
		await expect(page.getByTestId("quiz-result-panel")).toBeVisible();
		await page.getByRole("button", { name: "Nhận quà" }).click();
		await expect(page.getByText(QUIZ_SECRET, { exact: true })).toBeVisible();
		await expect(page).toHaveScreenshot("quiz-390-claimed.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveFreshCheckpoint(page, testInfo, "quiz-390-claimed-current");
	});
});
