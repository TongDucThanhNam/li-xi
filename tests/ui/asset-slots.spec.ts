import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { ParticipantFixtureApi } from "./fixtures/participant-convex-mock";
import type { StationFixtureApi } from "./fixtures/station-convex-mock";

/**
 * Slice 4d-3 UI integration: per-game asset slots (wheel hub, quiz backdrop)
 * on guest/station surfaces and in the workspace editor's generalized assets
 * panel, plus the optional campaign brand-identity fields (workspace metadata
 * only). Synthetic fixtures only — the server contracts live in
 * convex/campaignAssets.test.ts.
 *
 * Snapshot baselines here are NEW for this slice (created on the first run,
 * verified on every later run); existing guest baselines must NOT change —
 * the fallback assertions below pin that.
 */

const EVIDENCE_DIR = process.env.SLICE4D3_EVIDENCE_DIR
	? path.resolve(process.env.SLICE4D3_EVIDENCE_DIR)
	: path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"../../.tmp/slice4d3-evidence",
		);

// Same deterministic data-URI stand-ins the workspace fixture mounts by
// default; guest/station fixtures start WITHOUT them (fallback state).
const HUB_DATA_URI =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwJfLbFa2gyH8OITBAtxmr/N1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYBJpwxh1uw6/IAAAAASUVORK5CYII=";
const BACKDROP_DATA_URI =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAIAAACx52pFAAAAm0lEQVR4nO3RQQ0AIAzAwBnANwIQjIw9ekkFNLk572qxWT+IBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0O4DNU3GaNqnfFwAAAAASUVORK5CYII=";
const HUB_PNG = Buffer.from(
	HUB_DATA_URI.replace("data:image/png;base64,", ""),
	"base64",
);

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const WORKSPACE_URL = "/workspace.html";

async function awaitFonts(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

/** Wait until every <img> on the page finished loading (data URIs are fast,
 * but screenshot stability still needs the frames painted). */
async function awaitImages(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			[...document.images].map((image) =>
				image.complete
					? Promise.resolve()
					: new Promise<void>((resolve) => {
							image.addEventListener("load", () => resolve(), { once: true });
							image.addEventListener("error", () => resolve(), { once: true });
						}),
			),
		);
	});
}

async function saveEvidence(page: Page, name: string) {
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const shot = await page.screenshot({ fullPage: true });
	writeFileSync(path.join(EVIDENCE_DIR, `${name}.png`), shot);
}

async function setParticipantAssetUrls(page: Page, urls: Record<string, string>) {
	await page.evaluate(
		([assetUrls]) =>
			(
				window as unknown as { __participantFixture: ParticipantFixtureApi }
			).__participantFixture.setAssetUrls(assetUrls as Record<string, string>),
		[urls],
	);
}

async function setStationAssetUrls(page: Page, urls: Record<string, string>) {
	await page.evaluate(
		([assetUrls]) =>
			(
				window as unknown as { __stationFixture: StationFixtureApi }
			).__stationFixture.setAssetUrls(assetUrls as Record<string, string>),
		[urls],
	);
}

async function workspaceCalls(page: Page, name: string) {
	return page.evaluate(
		([mutationName]) =>
			(
				window as unknown as {
					__workspaceFixture: { calls: (name: string) => Array<Record<string, unknown>> };
				}
			).__workspaceFixture.calls(mutationName as string),
		[name],
	);
}

/**
 * Fresh participant state: the fixture backend persists sessions in
 * sessionStorage AND the product keeps play recovery in localStorage, so a
 * same-origin reload inside one test would RESUME the previous iteration's
 * session (skipping the hero, with an unrecoverable play context). Clearing
 * both + reloading keeps every loop iteration on a fresh entry.
 */
async function freshParticipantPage(page: Page, share: string) {
	await page.goto(`/participant.html?share=${share}`);
	await page.evaluate(() => {
		window.sessionStorage.clear();
		window.localStorage.clear();
	});
	await page.reload();
}

/** The quiz backdrop layer only renders when a backdrop image resolves. */
function backdropLayer(page: Page) {
	return page.locator("main.quiz-stage > div[aria-hidden='true']");
}

/** Uncaught page errors and unexpected console errors fail the suite. */
let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
	pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
	page.on("console", (message) => {
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

// ---------------------------------------------------------------------------
// Guest public play: wheel hub slot
// ---------------------------------------------------------------------------

test.describe("guest wheel hub slot", () => {
	test("fallback: no hub image renders when the slot is unset", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/participant.html?share=wheel");
		const start = page.getByRole("button", { name: "Bắt đầu" });
		await expect(start).toBeVisible();
		await start.click();
		await expect(page.getByRole("img", { name: "Vòng quay may mắn" })).toBeVisible();
		// The hub keeps its default glyph (an SVG icon), never an <img>.
		await expect(page.locator(".wheel-disc__hub-image")).toHaveCount(0);
	});

	test("hub image renders on the play stage at both acceptance viewports", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		for (const [label, viewport] of [
			["desktop", DESKTOP],
			["390", MOBILE],
		] as const) {
			await page.setViewportSize(viewport);
			await freshParticipantPage(page, "wheel");
			// The entry hero itself has no disc, so the slot only shows in play.
			await setParticipantAssetUrls(page, { "game-wheel-hub": HUB_DATA_URI });
			const start = page.getByRole("button", { name: "Bắt đầu" });
			await expect(start).toBeVisible();
			await start.click();
			const hub = page.locator("img.wheel-disc__hub-image");
			await expect(hub).toBeVisible();
			await expect(hub).toHaveAttribute("src", HUB_DATA_URI);
			await expect(page.getByText("Đang quay…")).toHaveCount(0);
			await awaitFonts(page);
			await awaitImages(page);
			await page.waitForTimeout(300);
			await expect(page).toHaveScreenshot(`asset-slots-wheel-hub-${label}.png`, {
				animations: "disabled",
				fullPage: true,
			});
			await saveEvidence(page, `guest-wheel-hub-${label}`);
		}
	});
});

// ---------------------------------------------------------------------------
// Guest public play: quiz backdrop slot
// ---------------------------------------------------------------------------

test.describe("guest quiz backdrop slot", () => {
	test("fallback: no backdrop layer renders when the slot is unset", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/participant.html?share=quiz");
		await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeVisible();
		await expect(backdropLayer(page)).toHaveCount(0);
	});

	test("backdrop renders behind entry hero and questions at both viewports", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		for (const [label, viewport] of [
			["desktop", DESKTOP],
			["390", MOBILE],
		] as const) {
			await page.setViewportSize(viewport);
			await freshParticipantPage(page, "quiz");
			await setParticipantAssetUrls(page, {
				"game-quiz-backdrop": BACKDROP_DATA_URI,
			});
			// The entry hero gains the dimmed backdrop layer.
			const heroLayer = backdropLayer(page);
			await expect(heroLayer).toHaveCount(1);
			await expect(heroLayer).toHaveCSS(
				"background-image",
				`url("${BACKDROP_DATA_URI}")`,
			);
			await awaitFonts(page);
			await awaitImages(page);
			await page.waitForTimeout(300);
			await expect(page).toHaveScreenshot(
				`asset-slots-quiz-backdrop-hero-${label}.png`,
				{ animations: "disabled", fullPage: true },
			);
			if (label === "desktop") {
				await saveEvidence(page, "guest-quiz-backdrop-hero-desktop");
			}

			// The question stage keeps the same layer behind the quiz card.
			await page.getByRole("button", { name: "Bắt đầu" }).click();
			await expect(page.getByTestId("quiz-ready")).toBeVisible();
			await page.getByTestId("quiz-start").click();
			await expect(page.getByTestId("quiz-card")).toBeVisible();
			await expect(backdropLayer(page)).toHaveCount(1);
			await page.waitForTimeout(300);
			await expect(page).toHaveScreenshot(
				`asset-slots-quiz-backdrop-question-${label}.png`,
				{ animations: "disabled", fullPage: true },
			);
			if (label === "desktop") {
				await saveEvidence(page, "guest-quiz-backdrop-question-desktop");
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Station mode: wheel hub slot on the self-serve kiosk
// ---------------------------------------------------------------------------

test.describe("station wheel hub slot", () => {
	test("fallback: station play stage keeps the default hub glyph", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/station.html?game=wheel");
		const start = page.getByRole("button", { name: "Quay ngay" });
		await expect(start).toBeVisible();
		await start.click();
		await expect(page.locator(".wheel-board")).toBeVisible();
		await expect(page.locator(".wheel-disc__hub-image")).toHaveCount(0);
	});

	test("hub image renders on the station play stage", async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize(DESKTOP);
		await page.goto("/station.html?game=wheel");
		await setStationAssetUrls(page, { "game-wheel-hub": HUB_DATA_URI });
		const start = page.getByRole("button", { name: "Quay ngay" });
		await expect(start).toBeVisible();
		await start.click();
		const hub = page.locator("img.wheel-disc__hub-image");
		await expect(hub).toBeVisible();
		await expect(hub).toHaveAttribute("src", HUB_DATA_URI);
		await awaitFonts(page);
		await awaitImages(page);
		await page.waitForTimeout(300);
		await expect(page).toHaveScreenshot("asset-slots-station-wheel-hub.png", {
			animations: "disabled",
			fullPage: true,
		});
		await saveEvidence(page, "station-wheel-hub-desktop");
	});
});

// ---------------------------------------------------------------------------
// Workspace: the generalized editor assets panel
// ---------------------------------------------------------------------------

test.describe("workspace editor assets panel slots", () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30+07:00"));
	});

	test("slot cards render for wheel/quiz only, with previews and remove", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);

		// Wheel editor: hub slot card with the mounted preview and remove.
		await page.goto(`${WORKSPACE_URL}?route=editor&game=wf-game-wheel`);
		await expect(page.locator("h1.admin-page__title").first()).toHaveText(
			"Vòng quay may mắn",
		);
		await expect(page.getByText("Ảnh chủ đạo", { exact: true })).toBeVisible();
		await expect(page.getByText("Ảnh tâm vòng quay", { exact: true })).toBeVisible();
		await expect(page.getByAltText("Ảnh tâm vòng quay hiện tại")).toHaveAttribute(
			"src",
			HUB_DATA_URI,
		);
		await expect(page.getByRole("button", { name: "Gỡ ảnh" })).toBeVisible();

		// Quiz editor: backdrop slot card.
		await page.goto(`${WORKSPACE_URL}?route=editor&game=wf-game-quiz`);
		await expect(page.locator("h1.admin-page__title").first()).toHaveText(
			"Trắc nghiệm tri ân",
		);
		await expect(page.getByText("Ảnh nền trắc nghiệm", { exact: true })).toBeVisible();
		await expect(page.getByAltText("Ảnh nền trắc nghiệm hiện tại")).toBeVisible();

		// li-xi and scratch editors declare no slots: no extra slot section.
		for (const [game, heading] of [
			["wf-game-lunar", "Bánh bao lì xì (chính)"],
			["wf-game-scratch", "Thẻ cào may mắn"],
		] as const) {
			await page.goto(`${WORKSPACE_URL}?route=editor&game=${game}`);
			await expect(page.locator("h1.admin-page__title").first()).toHaveText(heading);
			await expect(page.getByText("Ảnh chủ đạo", { exact: true })).toBeVisible();
			await expect(page.getByText("Ảnh tâm vòng quay")).toHaveCount(0);
			await expect(page.getByText("Ảnh nền trắc nghiệm")).toHaveCount(0);
		}
	});

	test("slot remove + upload follow the R2 flow with usage + game binding", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		// The fixture upload endpoint answers a plain 200 to the real XHR PUT.
		await page.route("https://fixture.invalid/upload", (route) =>
			route.fulfill({ status: 200 }),
		);
		await page.goto(`${WORKSPACE_URL}?route=editor&game=wf-game-quiz`);
		await expect(page.locator("h1.admin-page__title").first()).toHaveText(
			"Trắc nghiệm tri ân",
		);

		// Remove the seeded backdrop first: the card falls back cleanly.
		await page.getByRole("button", { name: "Gỡ ảnh" }).click();
		await expect(page.getByText("Đã gỡ Ảnh nền trắc nghiệm.")).toBeVisible();
		await expect(page.getByText("Chưa có ảnh (dùng hình mặc định)")).toBeVisible();

		// Upload a new backdrop through the slot's hidden input.
		await page.setInputFiles("#campaign-game-slot-game-quiz-backdrop", {
			buffer: HUB_PNG,
			mimeType: "image/png",
			name: "backdrop.png",
		});
		await expect(page.getByText("Đã cập nhật Ảnh nền trắc nghiệm.")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByAltText("Ảnh nền trắc nghiệm hiện tại")).toHaveAttribute(
			"src",
			HUB_DATA_URI,
		);

		const attachCalls = await workspaceCalls(page, "campaigns:attachUploadedAsset");
		expect(attachCalls.at(-1)).toMatchObject({
			campaignId: "campaign-a",
			campaignGameId: "wf-game-quiz",
			key: "fixture-asset-key",
			usage: "game-quiz-backdrop",
		});
		const detachCalls = await workspaceCalls(page, "campaigns:detachCampaignAsset");
		expect(detachCalls).toHaveLength(1);
		await saveEvidence(page, "editor-quiz-slot-uploaded");
	});
});

// ---------------------------------------------------------------------------
// Workspace: campaign brand identity (create form + overview + list)
// ---------------------------------------------------------------------------

test.describe("workspace campaign brand identity", () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30+07:00"));
	});

	test("create form: optional brand section collects fields and persists them", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto(`${WORKSPACE_URL}?route=campaigns-new`);
		await expect(page.locator("h1.admin-page__title").first()).toHaveText("Tạo chiến dịch");
		await expect(page.getByText("Nhận diện thương hiệu (tuỳ chọn)")).toBeVisible();
		await expect(
			page.getByText(
				"Chỉ hiển thị trong không gian làm việc, không áp dụng lên màn chơi của khách.",
			),
		).toBeVisible();

		await page.fill("#new-campaign-name", "Chiến dịch UI 4d3");
		const swatch = page.locator("span.size-8[aria-hidden='true']");
		await page.fill("#new-campaign-brand-color", "#FF0000");
		await expect(swatch).toHaveCSS("background-color", "rgb(255, 0, 0)");
		await page.getByRole("button", { name: "Khách hàng mới" }).click();
		await expect(page.getByRole("button", { name: "Khách hàng mới" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await page.fill("#new-campaign-audience-note", "Ưu tiên kênh QR tại sự kiện.");

		await page.getByRole("button", { name: "Tạo và cấu hình trò chơi" }).click();
		// Persist navigates into the new campaign's first game editor.
		await expect(page.locator("h1.admin-page__title").first()).toHaveText(
			"Bánh bao lì xì (chính)",
			{ timeout: 15_000 },
		);
		const calls = await workspaceCalls(page, "campaigns:saveCampaign");
		expect(calls.at(-1)).toMatchObject({
			brandColor: "#FF0000",
			audienceTags: ["new-customers"],
			audienceNote: "Ưu tiên kênh QR tại sự kiện.",
		});
		await saveEvidence(page, "create-brand-fields-persisted");
	});

	test("overview: metadata chips, prefilled fields, save round-trip and logo remove", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto(`${WORKSPACE_URL}?route=overview`);
		await expect(page.locator("h1.admin-page__title").first()).toHaveText(
			"Chiến dịch tri ân A",
		);

		// Metadata chips: logo, color, audience tags.
		const metadata = page.getByTestId("campaign-brand-metadata");
		await expect(metadata).toBeVisible();
		await expect(metadata.locator("img[alt='Logo chiến dịch']")).toHaveAttribute(
			"src",
			/data:image\/png;base64,/,
		);
		await expect(metadata.getByText("Màu #7C3AED")).toBeVisible();
		await expect(metadata.getByText("Khách hàng mới")).toBeVisible();
		await expect(metadata.getByText("Khách mời sự kiện")).toBeVisible();

		// Fields come back prefilled from the campaign record.
		await expect(page.locator("#campaign-overview-brand-color")).toHaveValue("#7c3aed");
		await expect(page.locator("#campaign-overview-audience-note")).toHaveValue(
			"Ưu tiên khách vãng lai tại sự kiện mở hàng.",
		);
		await saveEvidence(page, "overview-brand-identity");

		// Editing marks dirty; saving round-trips brand + logo through saveCampaign.
		await page.fill("#campaign-overview-brand-color", "#00ccff");
		await expect(page.getByText("Có thay đổi chưa lưu.")).toBeVisible();
		await page.getByRole("button", { name: "Lưu thay đổi" }).click();
		await expect(page.getByText("Đã lưu thông tin chiến dịch")).toBeVisible();
		await expect(metadata.getByText("Màu #00CCFF")).toBeVisible();
		const calls = await workspaceCalls(page, "campaigns:saveCampaign");
		expect(calls.at(-1)).toMatchObject({
			brandColor: "#00ccff",
			audienceTags: ["new-customers", "event-guests"],
			logoAssetId: "wf-asset-logo",
		});

		// Removing the logo clears it from the metadata row too.
		await page.getByRole("button", { name: "Gỡ logo" }).click();
		await expect(page.getByText("Đã gỡ logo thương hiệu.")).toBeVisible();
		await expect(page.getByText("Chưa có", { exact: true })).toBeVisible();
		const detachCalls = await workspaceCalls(page, "campaigns:detachCampaignAsset");
		expect(detachCalls).toHaveLength(1);
	});

	test("campaigns list: brand chips and logo on campaign A only", async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		await page.goto(`${WORKSPACE_URL}?route=campaigns`);
		await expect(page.locator("h1.admin-page__title").first()).toHaveText("Chiến dịch");

		const cardA = page.locator("a", { hasText: "Chiến dịch tri ân A" }).first();
		await expect(cardA.getByAltText("Logo Chiến dịch tri ân A")).toHaveAttribute(
			"src",
			/data:image\/png;base64,/,
		);
		// The brand color dot: a small swatch painted with the campaign color.
		const dotColor = await cardA
			.locator("span[style]")
			.first()
			.evaluate((node) => getComputedStyle(node).backgroundColor);
		expect(dotColor).toBe("rgb(124, 58, 237)");
		await expect(cardA.getByText("Khách hàng mới")).toBeVisible();
		await expect(cardA.getByText("Khách mời sự kiện")).toBeVisible();

		// Campaign B keeps the pre-slice shape: no logo image, no chips.
		const cardB = page.locator("a", { hasText: "Chiến dịch tri ân B" }).first();
		await expect(cardB.locator("img")).toHaveCount(0);
		await expect(cardB.getByText("Khách hàng mới")).toHaveCount(0);
	});
});
