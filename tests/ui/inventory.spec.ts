/* eslint-disable @typescript-eslint/no-explicit-any -- fixture bridge to the
   page-world fixture API, mirroring tests/ui/fixtures/convex-mock.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * UI integration/visual tests over the ACTUAL RewardInventoryPanel mounted in
 * tests/ui/fixtures (synthetic Convex responses). These are NOT real-backend
 * tests. Fixture controls on window.__inventoryFixture change mock data and
 * response timing only.
 */

/**
 * Functions do not survive page.evaluate returns, so each fixture operation
 * is invoked in-page with serializable arguments.
 */
const fixtureApi = {
	campaigns: { A: "campaign-a", B: "campaign-b" },
	switchCampaign(page: Page, id: string) {
		return page.evaluate(([id]) => (window as any).__inventoryFixture.switchCampaign(id), [id]);
	},
	setSaveMode(page: Page, mode: "immediate" | "delayed") {
		return page.evaluate(([mode]) => (window as any).__inventoryFixture.setSaveMode(mode), [mode]);
	},
	pendingSaveCount(page: Page): Promise<number> {
		return page.evaluate(() => (window as any).__inventoryFixture.pendingSaveCount());
	},
	releaseSave(page: Page) {
		return page.evaluate(() => (window as any).__inventoryFixture.releaseSave());
	},
	releaseNewestSave(page: Page) {
		return page.evaluate(() => (window as any).__inventoryFixture.releaseNewestSave());
	},
	calls(page: Page, name: string): Promise<Array<Record<string, any>>> {
		return page.evaluate(([name]) => (window as any).__inventoryFixture.calls(name), [name]);
	},
};

async function openInventory(page: Page) {
	await page.goto("/inventory.html");
	// Semantic readiness: the first hydrated row's name input carries the
	// stored campaign-A voucher name.
	const name = page.getByLabel("Tên hiển thị");
	await expect(name).toHaveValue("Voucher quà tặng A");
}

/** RAC NumberField commits on blur; type then Enter to commit deterministically. */
async function fillNumberField(page: Page, label: string, value: number) {
	// exact: the label text also substring-matches the decrement/increment
	// buttons' accessible names.
	const input = page.getByLabel(label, { exact: true });
	await input.fill(String(value));
	await input.press("Enter");
}

async function save(page: Page) {
	await page.getByRole("button", { name: "Lưu kho phần thưởng" }).click();
}

const PREVIOUS_VERSION_MESSAGE = "Đã lưu phiên bản trước; các thay đổi hiện tại chưa được lưu.";
const UNSAVED_WARNING = "Có thay đổi chưa lưu.";

// Fresh current-run checkpoint PNGs land in this ignored artifacts folder and
// are attached to the reports; reviewed baselines live in *.snapshots/.
const SCREENSHOT_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"artifacts/screenshots",
);

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

test("delayed Save20 -> edit 27 -> resolve -> 28 -> 27 stays unsaved; revert 20 clean", async ({
	page,
}) => {
	await openInventory(page);
	await fixtureApi.setSaveMode(page, "delayed");

	const quantity = page.getByLabel("Số lượng", { exact: true });
	await expect(quantity).toHaveValue("20");

	await save(page);
	// Pending: the fixture holds the response and the Save button is busy.
	expect(await fixtureApi.pendingSaveCount(page)).toBe(1);
	await expect(page.getByRole("button", { name: "Lưu kho phần thưởng" })).toBeDisabled();

	// Newer edit while the request is in flight.
	await fillNumberField(page, "Số lượng", 27);

	await fixtureApi.releaseSave(page);

	// The submitted payload was quantity 20 for the retained row, pool kept.
	const calls = await fixtureApi.calls(page, "rewardInventory:configureRewardInventory");
	expect(calls).toHaveLength(1);
	expect(calls[0].campaignId).toBe("campaign-a");
	expect(calls[0].items[0]).toMatchObject({
		existingItemId: "inv-a-voucher",
		name: "Voucher quà tặng A",
		quantity: 20,
		poolTag: "vip",
	});
	expect(calls[0].items[0].secretCode).toBeUndefined();
	expect(calls[0].items[0].removeSecretCode).toBeUndefined();

	// Previous version saved; the newer edit is explicitly still unsaved.
	await expect(page.getByText(PREVIOUS_VERSION_MESSAGE)).toBeVisible();
	await expect(page.getByText(UNSAVED_WARNING)).toBeVisible();
	await expect(quantity).toHaveValue("27");

	// 28 -> still unsaved; revert 27 -> STILL unsaved (only 20 was saved).
	await fillNumberField(page, "Số lượng", 28);
	await expect(page.getByText(UNSAVED_WARNING)).toBeVisible();
	await fillNumberField(page, "Số lượng", 27);
	await expect(page.getByText(UNSAVED_WARNING)).toBeVisible();

	// Reverting to the actually saved 20 is clean again.
	await fillNumberField(page, "Số lượng", 20);
	await expect(page.getByText(UNSAVED_WARNING)).toBeHidden();
	await expect(page.getByText(PREVIOUS_VERSION_MESSAGE)).toBeHidden();
});

test("campaign A pending -> B can save -> stale A response cannot clear B pending/status", async ({
	page,
}) => {
	await openInventory(page);
	await fixtureApi.setSaveMode(page, "delayed");

	await save(page);
	expect(await fixtureApi.pendingSaveCount(page)).toBe(1);

	// Switch to campaign B mid-flight: draft resets and Save is usable again.
	await fixtureApi.switchCampaign(page, fixtureApi.campaigns.B);
	await expect(page.getByText("Inventory campaign: campaign-b")).toBeVisible();
	const nameB = page.getByLabel("Tên hiển thị");
	await expect(nameB).toHaveValue("Điểm thưởng B");
	const saveButton = page.getByRole("button", { name: "Lưu kho phần thưởng" });
	await expect(saveButton).toBeEnabled();

	// B can save while A is still pending.
	await save(page);
	expect(await fixtureApi.pendingSaveCount(page)).toBe(2);

	// Deliver the NEWEST (B) response only: B reports its own saved state.
	await fixtureApi.releaseNewestSave(page);
	const bMessage = page.getByText("Đã lưu 1 phần thưởng (tổng 50 lượt trúng).");
	await expect(bMessage).toBeVisible();
	await expect(saveButton).toBeEnabled();

	// Deliver the stale A response: B's status stays B's; nothing flips to A.
	await fixtureApi.releaseSave(page);
	await expect(bMessage).toBeVisible();
	await expect(page.getByText(/tổng 20 lượt trúng/)).toBeHidden();
	await expect(saveButton).toBeEnabled();

	// Actual calls carried the right campaign identity and payloads.
	const calls = await fixtureApi.calls(page, "rewardInventory:configureRewardInventory");
	expect(calls).toHaveLength(2);
	expect(calls[0].campaignId).toBe("campaign-a");
	expect(calls[0].items[0].quantity).toBe(20);
	expect(calls[1].campaignId).toBe("campaign-b");
	expect(calls[1].items[0]).toMatchObject({
		existingItemId: "inv-b-points",
		quantity: 50,
		poolTag: "loyalty",
		amount: 25,
	});
});

test("remove+replacement save emits the replacement only; blank save preserves", async ({
	page,
}) => {
	await openInventory(page);

	await page.getByLabel("Xoá mã hiện tại của phần thưởng 1").check();
	await page
		.getByRole("textbox", { name: /Mã voucher/ })
		.fill("REPLACEMENT-CODE-1");
	await save(page);

	const calls = await fixtureApi.calls(page, "rewardInventory:configureRewardInventory");
	expect(calls).toHaveLength(1);
	// Replacement wins: the removal flag must NOT be emitted alongside it.
	expect(calls[0].items[0].secretCode).toBe("REPLACEMENT-CODE-1");
	expect(calls[0].items[0].removeSecretCode).toBeUndefined();
	expect(calls[0].items[0].existingItemId).toBe("inv-a-voucher");

	// The saved replacement input was consumed into stored presence.
	await expect(page.getByText("Đã lưu 1 phần thưởng (tổng 20 lượt trúng).")).toBeVisible();
	await expect(
		page.getByText("Đã cấu hình mã cho voucher này. Để trống là giữ nguyên; nhập mã mới để thay thế."),
	).toBeVisible();

	// A later ordinary blank save preserves the stored code (no replay).
	await page.getByRole("textbox", { name: /Mã voucher/ }).fill("");
	await save(page);
	const secondCalls = (await fixtureApi.calls(page, "rewardInventory:configureRewardInventory")).slice(1);
	expect(secondCalls).toHaveLength(1);
	expect(secondCalls[0].items[0].secretCode).toBeUndefined();
	expect(secondCalls[0].items[0].removeSecretCode).toBeUndefined();
	await expect(
		page.getByText("Đã cấu hình mã cho voucher này. Để trống là giữ nguyên; nhập mã mới để thay thế."),
	).toBeVisible();
});

test("desktop checkpoint: readable panel, no horizontal overflow", async ({ page }, testInfo) => {
	await openInventory(page);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(overflow).toBe(false);
	await expect(page.getByTestId("inventory-root")).toHaveScreenshot(
		`inventory-desktop-${testInfo.project.name}.png`,
	);
	await saveFreshCheckpoint(page, testInfo, "inventory-desktop-current");
});

test("390px checkpoint: full-width usable panel, no horizontal overflow", async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openInventory(page);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(overflow).toBe(false);
	// The quantity stepper stays visible/usable at mobile width.
	await expect(page.getByLabel("Số lượng", { exact: true })).toBeVisible();
	await expect(page.getByTestId("inventory-root")).toHaveScreenshot(
		`inventory-390-${testInfo.project.name}.png`,
	);
	await saveFreshCheckpoint(page, testInfo, "inventory-390-current");
});

test("save A -> switch B -> save B -> resolve OLD A while B pending: B stays pending; then resolve B", async ({
	page,
}) => {
	await openInventory(page);
	await fixtureApi.setSaveMode(page, "delayed");

	await save(page); // A pending (oldest)
	const saveButton = page.getByRole("button", { name: "Lưu kho phần thưởng" });
	await expect(saveButton).toBeDisabled();

	await fixtureApi.switchCampaign(page, fixtureApi.campaigns.B);
	await expect(page.getByText("Inventory campaign: campaign-b")).toBeVisible();
	await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Điểm thưởng B");
	await save(page); // B pending (newest)
	expect(await fixtureApi.pendingSaveCount(page)).toBe(2);

	// Resolve the OLD A save while B is still pending: B must stay pending,
	// and no A success may appear.
	await fixtureApi.releaseSave(page);
	expect(await fixtureApi.pendingSaveCount(page)).toBe(1);
	await expect(saveButton).toBeDisabled();
	await expect(page.getByText(/tổng 20 lượt trúng/)).toBeHidden();
	await expect(page.getByText(/Đã lưu phiên bản trước/)).toBeHidden();

	// Now resolve B: its own success and payload apply.
	await fixtureApi.releaseNewestSave(page);
	const bMessage = page.getByText("Đã lưu 1 phần thưởng (tổng 50 lượt trúng).");
	await expect(bMessage).toBeVisible();
	await expect(saveButton).toBeEnabled();

	const calls = await fixtureApi.calls(page, "rewardInventory:configureRewardInventory");
	expect(calls).toHaveLength(2);
	expect(calls[0].campaignId).toBe("campaign-a");
	expect(calls[0].items[0].quantity).toBe(20);
	expect(calls[1].campaignId).toBe("campaign-b");
	expect(calls[1].items[0]).toMatchObject({ existingItemId: "inv-b-points", quantity: 50 });
});
