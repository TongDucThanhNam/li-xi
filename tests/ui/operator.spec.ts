import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { OperatorFixtureApi } from "./fixtures/operator-convex-mock";

/**
 * Operator UI integration tests over the ACTUAL CampaignGameEditorFeature +
 * DistributionFeature (incl. ShareLinksPanel) with a real TanStack Router
 * tree and synthetic convex responses. UI integration scope only — NOT
 * real-backend tests. Fixture controls on window.__operatorFixture change
 * mock data and response timing only.
 */

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

const EDITOR_URL = "/operator.html?route=editor";
const DISTRIBUTION_URL = "/operator.html?route=distribution";
const SCRATCH_EDITOR_URL = "/operator.html?route=scratch-editor";
const SLOT_EDITOR_URL = "/operator.html?route=slot-editor";
const GAME_WHEEL = "op-game-wheel";
const GAME_SCRATCH = "op-game-scratch";
const GAME_SLOT = "op-game-slot";
const SCREENSHOT_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"artifacts/screenshots",
);

/** Uncaught page errors and unexpected console errors fail the suite. */
let pageErrors: string[] = [];
test.beforeEach(async ({ page }) => {
	pageErrors = [];
	page.on("pageerror", (error) => pageErrors.push(String(error)));
	page.on("console", (message) => {
		// Narrowly tolerate ONLY external font-host failures (offline runs).
		// Every other failed resource — especially local assets — must fail.
		const url = message.location()?.url ?? "";
		const externalFont =
			/fonts\.(googleapis|gstatic)\.com/.test(url) ||
			/fonts\.(googleapis|gstatic)\.com/.test(message.text());
		if (message.type() === "error" && !externalFont) {
			pageErrors.push(`${message.text()} (${url})`);
		}
	});
});
test.afterEach(async () => {
	expect(pageErrors).toEqual([]);
});

const operator = {
	setSaveMode(page: Page, mode: "immediate" | "delayed") {
		return page.evaluate(
			([mode]) => (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.setSaveMode(mode),
			[mode],
		);
	},
	pendingSaveCount(page: Page): Promise<number> {
		return page.evaluate(() => (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.pendingSaveCount());
	},
	releaseSave(page: Page) {
		return page.evaluate(() => (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.releaseSave());
	},
	releaseNewestSave(page: Page) {
		return page.evaluate(() => (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.releaseNewestSave());
	},
	calls(page: Page, name: string) {
		return page.evaluate(
			([name]) => (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.calls(name),
			[name],
		);
	},
	closeAllGames(page: Page) {
		return page.evaluate(() => (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.closeAllGames());
	},
};

const saveButton = (page: Page) =>
	page.getByRole("button", { name: "Lưu thay đổi" });
const unsavedWarning = (page: Page) =>
	page.getByText("Có thay đổi chưa lưu.");
const statusSelect = (page: Page) =>
	page.getByLabel("Trạng thái trò chơi");

async function openEditor(page: Page) {
	await page.goto(EDITOR_URL);
	// Semantic readiness: the wheel sibling's config editor renders with the
	// stored no-reward weight, and the unmodified draft is clean.
	const weight = page.getByLabel("Trọng số lượt không trúng (0-100)", { exact: true });
	await expect(weight).toBeVisible();
	await expect(weight).toHaveValue("20");
	await expect(saveButton(page)).toBeDisabled();
}

/** RAC NumberField commits on blur; type then Enter to commit deterministically. */
async function fillNumberField(page: Page, label: string, value: string) {
	const input = page.getByLabel(label, { exact: true });
	await input.fill(value);
	await input.press("Enter");
}

test("status-only save submits the selected wheel row and becomes clean", async ({
	page,
}) => {
	await openEditor(page);
	await operator.setSaveMode(page, "delayed");

	// Status-only change enables Save while dirty (the wheel starts active,
	// so drafting it is the status-only transition).
	await statusSelect(page).selectOption("draft");
	await expect(saveButton(page)).toBeEnabled();
	await expect(unsavedWarning(page)).toBeVisible();

	await saveButton(page).click();
	expect(await operator.pendingSaveCount(page)).toBe(1);
	await expect(saveButton(page)).toBeDisabled();

	await operator.releaseSave(page);

	// Clean after success; the call submitted the WHEEL row only.
	await expect(saveButton(page)).toBeDisabled();
	await expect(unsavedWarning(page)).toBeHidden();
	const updates = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(updates).toHaveLength(1);
	expect(updates[0].campaignGameId).toBe(GAME_WHEEL);
	expect(updates[0].status).toBe("draft");
	expect(updates[0].playLimits).toMatchObject({
		maxSessionsPerParticipant: 1,
		maxTotalSessions: null,
	});
	// No campaign-wide legacy save and no sibling mutation for a wheel game.
	expect(await operator.calls(page, "campaigns:saveCampaign")).toHaveLength(0);
	const allCalls = await page.evaluate(() => ({
		update: (window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture.calls("campaignGames:updateCampaignGame")
			.length,
	}));
	void allCalls;
});

test("limits-only save submits the edited row; optional total clearing sends null", async ({
	page,
}) => {
	await openEditor(page);

	await fillNumberField(page, "Lượt tối đa mỗi người (1-10)", "3");
	await expect(saveButton(page)).toBeEnabled();
	await fillNumberField(page, "Tổng lượt tối đa (tuỳ chọn, 1–200000)", "500");
	await page.getByRole("button", { name: "Lưu thay đổi" }).click();

	const updates = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(updates).toHaveLength(1);
	expect(updates[0].campaignGameId).toBe(GAME_WHEEL);
	expect(updates[0].playLimits).toEqual({
		maxSessionsPerParticipant: 3,
		maxTotalSessions: 500,
	});
	await expect(page.getByText("Đã lưu cấu hình trò chơi")).toBeVisible();

	// Clearing the optional total sends null (backend default 20,000 applies).
	await fillNumberField(page, "Tổng lượt tối đa (tuỳ chọn, 1–200000)", "");
	await page.getByRole("button", { name: "Lưu thay đổi" }).click();
	const cleared = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(cleared[1].playLimits).toEqual({
		maxSessionsPerParticipant: 3,
		maxTotalSessions: null,
	});

	// Clearing the REQUIRED participant count keeps the previous finite value
	// (the committed state is unchanged, so no mutation is submitted).
	await fillNumberField(page, "Lượt tối đa mỗi người (1-10)", "");
	await expect(
		page.getByLabel("Lượt tối đa mỗi người (1-10)", { exact: true }),
	).toHaveValue("3");
	await expect(saveButton(page)).toBeDisabled();
	expect(await operator.calls(page, "campaignGames:updateCampaignGame")).toHaveLength(2);

	// Limits-only saves PRESERVE the game status and write no campaign-wide
	// or sibling rows.
	await expect(statusSelect(page)).toHaveValue("active");
	expect(await operator.calls(page, "campaigns:saveCampaign")).toHaveLength(0);

	// A changed value reverted to the submitted one is clean with ZERO
	// intervening saves.
	await fillNumberField(page, "Lượt tối đa mỗi người (1-10)", "2");
	await expect(saveButton(page)).toBeEnabled();
	await fillNumberField(page, "Lượt tối đa mỗi người (1-10)", "3");
	await expect(saveButton(page)).toBeDisabled();
	expect(await operator.calls(page, "campaignGames:updateCampaignGame")).toHaveLength(2);
});

test("scratch editor: cover and threshold persist; preview reflects the draft", async ({
	page,
}) => {
	await page.goto(SCRATCH_EDITOR_URL);
	// Semantic readiness: the scratch config editor renders the stored values.
	const cover = page.getByLabel("Kiểu lớp phủ");
	await expect(cover).toBeVisible();
	await expect(cover).toHaveValue("gold");
	// Role-scoped: the stepper buttons share label text with the input.
	const threshold = page.getByRole("textbox", {
		name: "Ngưỡng hiển thị gỡ lớp phủ",
	});
	await expect(threshold).toHaveValue("55");
	await expect(page.getByTestId("scratch-preview-foil")).toHaveAttribute(
		"data-cover-style",
		"gold",
	);

	// Edit the frozen-presentation pair; the preview follows the draft.
	await cover.selectOption("teal");
	await threshold.fill("80");
	await threshold.press("Enter");
	await expect(page.getByTestId("scratch-preview-foil")).toHaveAttribute(
		"data-cover-style",
		"teal",
	);
	await saveButton(page).click();
	await expect(page.getByText("Đã lưu cấu hình trò chơi")).toBeVisible();

	const updates = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(updates).toHaveLength(1);
	expect(updates[0].campaignGameId).toBe(GAME_SCRATCH);
	expect(updates[0].config).toMatchObject({
		coverStyle: "teal",
		revealThresholdPercent: 80,
		templateId: "scratch-card",
	});
	// Status and limits are preserved on a config-only scratch save.
	expect(updates[0].status).toBe("active");
	expect(updates[0].playLimits).toMatchObject({ maxSessionsPerParticipant: 1 });
});

test("slot editor: bounded config persists; preview reflects the draft", async ({
	page,
}) => {
	await page.goto(SLOT_EDITOR_URL);
	// Semantic readiness: the slot config editor renders the stored values.
	const theme = page.getByLabel("Phong cách máy quay");
	await expect(theme).toBeVisible();
	await expect(theme).toHaveValue("gold");
	const weight = page.getByRole("textbox", { name: "Trọng số lượt không trúng" });
	await expect(weight).toHaveValue("20");
	await expect(page.getByTestId("slot-preview-machine")).toHaveAttribute(
		"data-reel-theme",
		"gold",
	);
	// The documented fixed symbol legend is present for the operator.
	await expect(page.getByText("Chuông")).toBeVisible();
	await expect(
		page.getByText(/Vầng trăng – Ngôi sao – Cỏ bốn lá/),
	).toBeVisible();

	// Edit the bounded pair; the preview follows the draft.
	await theme.selectOption("festive");
	await weight.fill("35");
	await weight.press("Enter");
	await expect(page.getByTestId("slot-preview-machine")).toHaveAttribute(
		"data-reel-theme",
		"festive",
	);
	await saveButton(page).click();
	await expect(page.getByText("Đã lưu cấu hình trò chơi")).toBeVisible();

	const updates = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(updates).toHaveLength(1);
	expect(updates[0].campaignGameId).toBe(GAME_SLOT);
	expect(updates[0].config).toMatchObject({
		templateId: "slot-reveal",
		reelTheme: "festive",
		noRewardWeight: 35,
	});
	// Status and limits are preserved on a config-only slot save.
	expect(updates[0].status).toBe("active");
	expect(updates[0].playLimits).toMatchObject({ maxSessionsPerParticipant: 1 });
});

test("deferred save then a newer edit stays dirty when the older response arrives", async ({
	page,
}) => {
	await openEditor(page);
	await operator.setSaveMode(page, "delayed");

	await statusSelect(page).selectOption("draft");
	await saveButton(page).click();
	expect(await operator.pendingSaveCount(page)).toBe(1);

	// Newer edit while the request is in flight.
	await fillNumberField(page, "Lượt tối đa mỗi người (1-10)", "3");

	await operator.releaseSave(page);
	// The newer edit keeps the editor dirty after the older response lands.
	await expect(unsavedWarning(page)).toBeVisible();
	await expect(saveButton(page)).toBeEnabled();
	await expect(statusSelect(page)).toHaveValue("draft");

	// A follow-up save resolves and the full newer draft becomes clean.
	await saveButton(page).click();
	await operator.releaseNewestSave(page);
	const updates = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(updates[1].playLimits).toMatchObject({ maxSessionsPerParticipant: 3 });
	await expect(unsavedWarning(page)).toBeHidden();
});

test("unsaved-change guard: cancel preserves edits and returns focus; save-and-leave awaits success", async ({
	page,
}) => {
	await openEditor(page);
	await operator.setSaveMode(page, "delayed");

	// The wheel starts active; drafting it is a real status-only edit.
	await statusSelect(page).selectOption("draft");
	await expect(unsavedWarning(page)).toBeVisible();

	// Real keyboard navigation through the campaign context nav link (scoped:
	// the shell breadcrumbs carry a second Phân phối link).
	// The fixture frame and the editor both render a context nav; either
	// link navigates the same real router.
	const distributionLink = page
		.getByRole("navigation", { name: "Điều hướng chiến dịch" })
		.getByRole("link", { name: "Phân phối" })
		.first();
	await distributionLink.focus();
	await distributionLink.press("Enter");

	// The guard dialog blocks navigation while dirty.
	const dialog = page.getByRole("alertdialog");
	await expect(
		dialog.getByRole("heading", { name: "Bạn có thay đổi chưa lưu" }),
	).toBeVisible();

	// Cancel: focus returns to the remembered navigation target FIRST.
	await dialog.getByRole("button", { name: "Tiếp tục chỉnh sửa" }).click();
	await expect(dialog).toBeHidden();
	const focusedHref = await page.evaluate(() =>
		(document.activeElement as HTMLElement | null)?.getAttribute("href"),
	);
	expect(focusedHref).toBe("/campaigns/campaign-op/distribution");
	// Then the preserved edits and surface.
	await expect(statusSelect(page)).toHaveValue("draft");
	await expect(page.getByTestId("operator-editor")).toBeVisible();

	// Navigate again and SAVE-AND-LEAVE: navigation waits for the save.
	await distributionLink.press("Enter");
	const saveLeave = page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Lưu và rời trang" });
	await saveLeave.click();
	// Deferred save pending: still on the editor until the response lands.
	expect(await operator.pendingSaveCount(page)).toBe(1);
	// Still on the editor while the save is pending.
	await expect(page.getByTestId("operator-editor")).toBeVisible();
	await operator.releaseSave(page);
	// Distribution heading appears after the navigation completes.
	await expect(
		page.getByRole("heading", { name: "Phân phối", level: 1 }),
	).toBeVisible();

	// The save-and-leave submitted the draft.
	const updates = await operator.calls(page, "campaignGames:updateCampaignGame");
	expect(updates).toHaveLength(1);
	expect(updates[0].status).toBe("draft");
});

/**
 * Real-geometry assertions for one rendered URL paragraph: the element must
 * exist, sit inside the operator surface, not be clipped, and not be
 * covered by the row action button (when one is rendered).
 */
async function assertLinkGeometry(
	page: Page,
	urlFragment: string,
	actionLabel: string | null,
) {
	const result = (await page.evaluate(
		({ fragment, actionText }: { fragment: string; actionText: string | null }) => {
			const urlParagraph = [...document.querySelectorAll("p")].find((node) =>
				node.textContent?.includes(fragment),
			);
			if (!urlParagraph) {
				return { missing: "url" as const };
			}
			const action = actionText
				? [...document.querySelectorAll("button")].find((node) =>
						node.textContent?.includes(actionText),
					)
				: undefined;
			if (actionText && !action) {
				return { missing: "action" as const };
			}
			const urlRect = urlParagraph.getBoundingClientRect();
			const actionRect = action?.getBoundingClientRect() ?? null;
			return {
				missing: null,
				rects: [urlRect, actionRect].filter(
					(rect): rect is DOMRect => rect !== null,
				),
				scrollWidth: urlParagraph.scrollWidth,
				clientWidth: urlParagraph.clientWidth,
			};
		},
		{ fragment: urlFragment, actionText: actionLabel },
	)) as
		| { missing: "url" }
		| { missing: "action" }
		| {
				missing: null;
				rects: DOMRect[];
				scrollWidth: number;
				clientWidth: number;
			};
	if (result.missing === "url") {
		throw new Error(`URL element missing for fragment: ${urlFragment}`);
	}
	if (result.missing === "action") {
		throw new Error(
			`Action element missing for fragment: ${urlFragment} (${actionLabel})`,
		);
	}
	expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth + 1);
	for (const rect of result.rects) {
		expect(rect.width).toBeGreaterThan(0);
		expect(rect.right).toBeLessThanOrEqual(
			(await page.evaluate(() => document.documentElement.clientWidth)) + 1,
		);
	}
	if (result.rects.length === 2) {
		const [urlRect, actionRect] = result.rects;
		const overlaps =
			urlRect.left < actionRect.right &&
			actionRect.left < urlRect.right &&
			urlRect.top < actionRect.bottom &&
			actionRect.top < urlRect.bottom;
		expect(overlaps).toBe(false);
	}
	// A missing URL or action element fails instead of passing vacuously.
	expect(result.missing).toBeNull();
	// Not clipped: the paragraph wraps instead of overflowing its box.
	expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth + 1);
	// Contained within the rendered operator surface.
	for (const rect of result.rects) {
		expect(rect.width).toBeGreaterThan(0);
		expect(rect.right).toBeLessThanOrEqual(
			(await page.evaluate(() => document.documentElement.clientWidth)) + 1,
		);
	}
	// The row action must not cover the URL text.
	if (result.rects.length === 2) {
		const [urlRect, actionRect] = result.rects;
		const overlaps =
			urlRect.left < actionRect.right &&
			actionRect.left < urlRect.right &&
			urlRect.top < actionRect.bottom &&
			actionRect.top < urlRect.bottom;
		expect(overlaps).toBe(false);
	}
}

test("distribution: reusable link creation, QR, copy and legacy /play entry", async ({
	page,
}) => {
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	// Pin Date.now BEFORE navigation so Date.now-dependent initial state
	// (legacy entry expiry, creation timestamps) is deterministic.
	await page.clock.setFixedTime(new Date("2026-09-12T00:29:30"));
	await page.goto(DISTRIBUTION_URL);
	// Deterministic "Tạo <date>" text on link cards.
	await page.clock.setFixedTime(new Date("2026-09-12T00:29:30"));
	await awaitFonts(page);
	await expect(page.getByRole("heading", { name: "Phân phối", level: 1 })).toBeVisible();
	expect(await hasHorizontalOverflow(page)).toBe(false);

	// Create a reusable /p link for the wheel with channel/label.
	await page.getByLabel("Trò chơi của liên kết").selectOption(GAME_WHEEL);
	await page.getByRole("textbox", { name: "Kênh" }).fill("qr-fixture");
	await page.getByLabel("Ghi chú (tuỳ chọn)").fill("Label A");
	await page.getByRole("button", { name: "Tạo liên kết" }).click();

	const creationCalls = await operator.calls(page, "shareLinks:createShareLink");
	expect(creationCalls).toHaveLength(1);
	expect(creationCalls[0]).toMatchObject({
		campaignGameId: GAME_WHEEL,
		channel: "qr-fixture",
		label: "Label A",
	});

	const publicUrl = "http://127.0.0.1:3210/p/opsharelink10000000000";
	// A single link exists; the group scope is unambiguous.
	const linkGroup = page.getByRole("group", {
		name: "Danh sách liên kết chơi công khai",
	});
	await expect(linkGroup.getByText(publicUrl)).toBeVisible();
	// Real QR SVG with the channel-specific title.
	const qr = linkGroup.getByRole("img", { name: "Mã QR liên kết chơi công khai (qr-fixture)" });
	await expect(qr).toBeVisible();
	const qrBox = await qr.boundingBox();
	expect(qrBox?.width ?? 0).toBeGreaterThan(50);
	expect(qrBox?.height ?? 0).toBeGreaterThan(50);
	// Copy agrees with the visible URL (real clipboard).
	await linkGroup.getByRole("button", { name: "Sao chép" }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
	// Open destination agrees with the visible URL.
	await expect(
		linkGroup.getByRole("link", { name: "Mở liên kết" }),
	).toHaveAttribute("href", publicUrl);

	// Element containment for BOTH rendered URLs: reusable /p and legacy /play.
	await assertLinkGeometry(page, "/p/opsharelink10000000000", "Thu hồi");
	await assertLinkGeometry(page, "/play/1a2b3c4d5e6f7a8b9c0d1e2f", null);

	// Timestamps correspond to the pinned fixture instant: created at 00:29:30,
	// the legacy entry expires exactly one hour later.
	await expect(page.getByText("Tạo 00:29:30 12/9/2026")).toBeVisible();
	await expect(page.getByText("Hết hạn 01:29:30 12/9/2026")).toBeVisible();

	// A pending legacy /play entry renders alongside with its own QR/URL.
	const legacyUrl = "http://127.0.0.1:3210/play/1a2b3c4d5e6f7a8b9c0d1e2f";
	await expect(page.getByText(legacyUrl)).toBeVisible();
	const legacyQr = page.getByRole("img", {
		name: "Mã QR liên kết chơi của Khách mời trạm",
	});
	await expect(legacyQr).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Khách mời trạm" }),
	).toBeVisible();
});

test("closed games: creation disappears; revoke/restore/copy of existing links remain", async ({
	page,
}) => {
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	// Pin Date.now before navigation for deterministic card timestamps.
	await page.clock.setFixedTime(new Date("2026-09-12T00:29:30"));
	// Seed one existing link before closing all games.
	await page.goto(DISTRIBUTION_URL);
	await page.getByLabel("Trò chơi của liên kết").selectOption(GAME_WHEEL);
	await page.getByRole("button", { name: "Tạo liên kết" }).click();
	await expect(
		page.getByText("Đã tạo liên kết chơi công khai mới."),
	).toBeVisible();
	const originalCode = "opsharelink10000000000"; // 22-char code from the fixture

	// All games close through query-data controls: creation disappears…
	await operator.closeAllGames(page);
	await expect(page.getByText("Cần một trò chơi đang chạy")).toBeVisible();
	await expect(page.getByRole("button", { name: "Tạo liên kết" })).toBeHidden();

	// …but the existing link remains manageable: copy still works and the
	// revoke/restore cycle preserves identity and code.
	const linkGroup = page.getByRole("group", {
		name: "Danh sách liên kết chơi công khai",
	});
	await linkGroup.getByRole("button", { name: "Sao chép" }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		`http://127.0.0.1:3210/p/${originalCode}`,
	);

	const createdLinkIds = await page.evaluate(() =>
		(
			window as unknown as { __operatorFixture: OperatorFixtureApi }
		).__operatorFixture.shareLinkIds(),
	);
	expect(createdLinkIds).toHaveLength(1);
	const createdLinkId = createdLinkIds[0];

	await linkGroup.getByRole("button", { name: "Thu hồi" }).click();
	await expect(linkGroup.getByText("Đã thu hồi")).toBeVisible();
	await expect(linkGroup.getByText(originalCode)).toBeVisible();
	// Revoked rows lose the accessible Open link.
	await expect(linkGroup.getByRole("link", { name: "Mở liên kết" })).toBeHidden();
	const revokes = await operator.calls(page, "shareLinks:revokeShareLink");
	expect(revokes[0].shareLinkId).toBe(createdLinkId);

	// Restore reuses the SAME created link identity and code (not a new link).
	await linkGroup.getByRole("button", { name: "Mở lại" }).click();
	await expect(linkGroup.getByText("Đang hoạt động")).toBeVisible();
	await expect(linkGroup.getByText(originalCode)).toBeVisible();
	const restores = await operator.calls(page, "shareLinks:restoreShareLink");
	expect(restores).toHaveLength(1);
	expect(restores[0].shareLinkId).toBe(createdLinkId);
	const creations = await operator.calls(page, "shareLinks:createShareLink");
	expect(creations).toHaveLength(1);
});

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

test.describe("distribution visual checkpoints (desktop + 390px)", () => {
	// Pin the deterministic instant BEFORE every navigation in this scope so
	// Date.now-dependent card text (Tạo/Hết hạn) is frozen for references.
	test.beforeEach(async ({ page }) => {
		await page.clock.setFixedTime(new Date("2026-09-12T00:29:30"));
	});

	test("desktop distribution checkpoint with link, QR and legacy entry", async ({
		page,
	}, testInfo) => {
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(DISTRIBUTION_URL);
		await page.getByLabel("Trò chơi của liên kết").selectOption(GAME_WHEEL);
		await page.getByRole("textbox", { name: "Kênh" }).fill("qr-fixture");
		await page.getByRole("button", { name: "Tạo liên kết" }).click();
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		await assertLinkGeometry(page, "/p/opsharelink10000000000", "Thu hồi");
		await assertLinkGeometry(page, "/play/1a2b3c4d5e6f7a8b9c0d1e2f", null);
		await expect(page.getByTestId("distribution-root")).toHaveScreenshot(
			`operator-distribution-desktop-${testInfo.project.name}.png`,
		);
		await saveFreshCheckpoint(page, testInfo, "operator-distribution-desktop-current");
	});

	test("390px distribution checkpoint: full-width cards, no overflow", async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(DISTRIBUTION_URL);
		await page.getByLabel("Trò chơi của liên kết").selectOption(GAME_WHEEL);
		await page.getByRole("button", { name: "Tạo liên kết" }).click();
		await awaitFonts(page);
		expect(await hasHorizontalOverflow(page)).toBe(false);
		// With faithful CSS the URL/action overlap is resolved: geometry
		// covers BOTH the reusable /p and legacy /play URLs (same as desktop).
		await assertLinkGeometry(page, "/p/opsharelink10000000000", "Thu hồi");
		await assertLinkGeometry(page, "/play/1a2b3c4d5e6f7a8b9c0d1e2f", null);
		await expect(
			page.getByRole("img", { name: "Mã QR liên kết chơi công khai (qr)" }),
		).toBeVisible();
		// Full-surface capture: below-fold controls cannot be excluded.
		await saveFreshCheckpoint(page, testInfo, "operator-distribution-390-current");
		const root = page.getByTestId("distribution-root");
		await expect(root).toHaveScreenshot(
			`operator-distribution-390-${testInfo.project.name}.png`,
		);
	});
});
