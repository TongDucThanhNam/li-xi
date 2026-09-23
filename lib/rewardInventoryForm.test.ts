import { describe, expect, test } from "vitest";
import {
	buildInventoryPayload,
	captureSubmittedIntentions,
	changeInventoryRowType,
	createInventoryRow,
	hasUnsavedInventoryEdits,
	inventoryRowFromItem,
	isSaveResponseCurrent,
	reconcileSavedIds,
	saveOutcomeMessage,
	serializeInventoryDraft,
	type IncomingInventoryItem,
	type InventoryFormRow,
} from "./rewardInventoryForm";

function storedItem(overrides: Partial<IncomingInventoryItem> = {}): IncomingInventoryItem {
	return {
		id: "inv-stored-1",
		name: "Stored voucher",
		rewardType: "voucher",
		amount: null,
		hasSecretCode: true,
		quantityTotal: 2,
		weight: 20,
		isActive: true,
		poolTag: "festival",
		...overrides,
	};
}

describe("inventory form hydration and payload", () => {
	test("hydration retains the stored row id, pool tag and secret presence", () => {
		const row = inventoryRowFromItem(storedItem());
		expect(row.existingItemId).toBe("inv-stored-1");
		expect(row.poolTag).toBe("festival");
		expect(row.hasSecretCode).toBe(true);
		// The replacement input starts blank: raw stored codes never hydrate.
		expect(row.secretCode).toBe("");
		expect(row.removeSecret).toBe(false);
	});

	test("an unchanged retained voucher save references its id and omits the secret", () => {
		const row = inventoryRowFromItem(storedItem());
		const payload = buildInventoryPayload([row]);
		expect(payload.ok).toBe(true);
		if (!payload.ok) return;
		expect(payload.keys).toEqual([row.key]);
		expect(payload.items[0].existingItemId).toBe("inv-stored-1");
		expect(payload.items[0].secretCode).toBeUndefined();
		expect(payload.items[0].removeSecretCode).toBeUndefined();
		expect(payload.items[0].poolTag).toBe("festival");
	});

	test("an explicit non-blank input replaces the stored code", () => {
		const row = inventoryRowFromItem(storedItem());
		const payload = buildInventoryPayload([{ ...row, secretCode: "  NEW-CODE  " }]);
		expect(payload.ok).toBe(true);
		if (!payload.ok) return;
		expect(payload.items[0].secretCode).toBe("NEW-CODE");
		expect(payload.items[0].removeSecretCode).toBeUndefined();
	});

	test("code removal requires the explicit intention on a retained voucher", () => {
		const retained = inventoryRowFromItem(storedItem());
		const remove = buildInventoryPayload([{ ...retained, removeSecret: true }]);
		expect(remove.ok).toBe(true);
		if (remove.ok) {
			expect(remove.items[0].removeSecretCode).toBe(true);
			expect(remove.items[0].secretCode).toBeUndefined();
		}
		// A brand-new row has nothing to remove.
		const fresh = createInventoryRow({ name: "New", removeSecret: true });
		const freshPayload = buildInventoryPayload([fresh]);
		expect(freshPayload.ok).toBe(true);
		if (freshPayload.ok) {
			expect(freshPayload.items[0].removeSecretCode).toBeUndefined();
		}
	});

	test("type changes clear incompatible fields and validation follows the type", () => {
		const voucher = inventoryRowFromItem(storedItem());
		const toCash = changeInventoryRowType(voucher, "cash");
		expect(toCash.secretCode).toBe("");
		expect(toCash.removeSecret).toBe(false);
		// Cash needs an amount: blank amount is a clear validation error.
		const missingAmount = buildInventoryPayload([toCash]);
		expect(missingAmount).toEqual({ ok: false, error: "Phần thưởng tiền mặt hoặc điểm cần có giá trị" });
		const validCash = buildInventoryPayload([{ ...toCash, amount: "50000" }]);
		expect(validCash.ok).toBe(true);
		if (validCash.ok) {
			expect(validCash.items[0].amount).toBe(50000);
		}
		// Cash -> voucher drops the amount instead of sending a forbidden one.
		const backToVoucher = changeInventoryRowType(
			{ ...toCash, amount: "50000" },
			"voucher",
		);
		const voucherPayload = buildInventoryPayload([backToVoucher]);
		expect(voucherPayload.ok).toBe(true);
		if (voucherPayload.ok) {
			expect(voucherPayload.items[0].amount).toBeUndefined();
		}
		// Non-cash/points rows never send an amount.
		const physical = buildInventoryPayload([
			changeInventoryRowType({ ...voucher, amount: "12" }, "physical"),
		]);
		expect(physical.ok).toBe(true);
		if (physical.ok) {
			expect(physical.items[0].amount).toBeUndefined();
		}
	});

	test("invalid numeric drafts produce clear validation errors, never NaN", () => {
		const row = inventoryRowFromItem(storedItem());
		expect(buildInventoryPayload([{ ...row, quantity: "NaN" }]).ok).toBe(false);
		expect(buildInventoryPayload([{ ...row, quantity: "" }]).ok).toBe(false);
		expect(buildInventoryPayload([{ ...row, weight: "-3" }]).ok).toBe(false);
		expect(buildInventoryPayload([{ ...row, amount: "NaN" }]).ok).toBe(false);
		const cleared = buildInventoryPayload([
			{ ...row, amount: "" } as InventoryFormRow,
		]);
		expect(cleared.ok).toBe(true);
		if (cleared.ok) {
			// Voucher rows carry no amount at all.
			expect(cleared.items[0].amount).toBeUndefined();
		}
	});
});

describe("submitted intention consumption (remove -> replace -> blank)", () => {
	function savedSequence() {
		const hydrated = inventoryRowFromItem(storedItem());
		// 1. Explicit removal save.
		const removalDraft = { ...hydrated, removeSecret: true };
		const removalPayload = buildInventoryPayload([removalDraft]);
		expect(removalPayload.ok).toBe(true);
		const intentions1 = captureSubmittedIntentions([removalDraft]);
		const afterRemove = reconcileSavedIds(
			[removalDraft],
			removalPayload.ok ? removalPayload.keys : [],
			["srv-1"],
			intentions1,
		);
		// 2. Replacement save on the now-codeless voucher.
		const replacementDraft = { ...afterRemove[0], secretCode: "SYNTHETIC-REPLACEMENT" };
		const replacementPayload = buildInventoryPayload([replacementDraft]);
		expect(replacementPayload.ok).toBe(true);
		const intentions2 = captureSubmittedIntentions([replacementDraft]);
		const afterReplace = reconcileSavedIds(
			[replacementDraft],
			replacementPayload.ok ? replacementPayload.keys : [],
			["srv-1"],
			intentions2,
		);
		// 3. Ordinary blank save.
		const blankPayload = buildInventoryPayload([afterReplace[0]]);
		return { removalPayload, afterRemove, replacementPayload, afterReplace, blankPayload };
	}

	test("the removal intention is consumed and never replays on the next blank save", () => {
		const { removalPayload, afterRemove, replacementPayload, afterReplace, blankPayload } =
			savedSequence();
		expect(removalPayload.ok && replacementPayload.ok && blankPayload.ok).toBe(true);
		expect(afterRemove[0].removeSecret).toBe(false);
		expect(afterRemove[0].hasSecretCode).toBe(false);
		expect(replacementPayload.ok ? replacementPayload.items[0].secretCode : undefined).toBe(
			"SYNTHETIC-REPLACEMENT",
		);
		// The replacement input was consumed into the stored code.
		expect(afterReplace[0].secretCode).toBe("");
		expect(afterReplace[0].hasSecretCode).toBe(true);
		// The final blank save preserves the replacement code.
		expect(blankPayload.ok ? blankPayload.items[0].removeSecretCode : undefined).toBeUndefined();
		expect(blankPayload.ok ? blankPayload.items[0].secretCode : undefined).toBeUndefined();
	});

	test("a newer edit during the save flight is preserved, server truth still applies", () => {
		const hydrated = inventoryRowFromItem(storedItem());
		const submittedDraft = { ...hydrated, secretCode: "  SUBMITTED  " };
		const intentions = captureSubmittedIntentions([submittedDraft]);
		// The operator kept typing while the request was in flight.
		const newerDraft = { ...hydrated, secretCode: "NEWER-EDIT" };
		const reconciled = reconcileSavedIds(
			[newerDraft],
			[capturedKey(intentions)],
			["srv-9"],
			intentions,
		);
		expect(reconciled[0].secretCode).toBe("NEWER-EDIT");
		expect(reconciled[0].hasSecretCode).toBe(true);
		expect(reconciled[0].existingItemId).toBe("srv-9");
	});

	test("a type change away from voucher resolves stored presence truthfully", () => {
		const voucher = inventoryRowFromItem(storedItem());
		const cashDraft = changeInventoryRowType(voucher, "cash");
		const intentions = captureSubmittedIntentions([{ ...cashDraft, amount: "50000" }]);
		const reconciled = reconcileSavedIds(
			[{ ...cashDraft, amount: "50000" }],
			[cashDraft.key],
			["srv-2"],
			intentions,
		);
		expect(reconciled[0].hasSecretCode).toBe(false);
	});

	test("save responses are scoped to the campaign epoch and the newest request", () => {
		const current = { requestEpoch: 2, requestSeq: 5, currentEpoch: 2, latestSeq: 5 };
		expect(isSaveResponseCurrent(current)).toBe(true);
		// Campaign switched while the request was in flight.
		expect(isSaveResponseCurrent({ ...current, currentEpoch: 3 })).toBe(false);
		// An older finally finishing after a newer request.
		expect(isSaveResponseCurrent({ ...current, latestSeq: 6 })).toBe(false);
		// A->B->A still cannot resurrect the pre-switch request.
		expect(isSaveResponseCurrent({ requestEpoch: 1, requestSeq: 3, currentEpoch: 3, latestSeq: 4 })).toBe(false);
	});
});

function capturedKey(intentions: Array<{ key: string }>): string {
	return intentions[0].key;
}

describe("replacement wins over removal in one save (presence precedence)", () => {
	test("remove+replacement submitted together stores the replacement code", () => {
		const row = inventoryRowFromItem(storedItem());
		const submittedDraft = { ...row, removeSecret: true, secretCode: "SYNTHETIC-REPLACE-WINS" };
		const intentions = captureSubmittedIntentions([submittedDraft]);
		// Payload precedence: only secretCode is emitted; no removal flag.
		const payload = buildInventoryPayload([submittedDraft]);
		expect(payload.ok).toBe(true);
		if (payload.ok) {
			expect(payload.items[0].secretCode).toBe("SYNTHETIC-REPLACE-WINS");
			expect(payload.items[0].removeSecretCode).toBeUndefined();
		}
		// Presence resolves with the same precedence: the replacement is stored.
		expect(intentions[0].resultHasSecret).toBe(true);
		const reconciled = reconcileSavedIds(
			[submittedDraft],
			payload.ok ? payload.keys : [],
			["srv-r"],
			intentions,
		);
		expect(reconciled[0].hasSecretCode).toBe(true);
		// The submitted intention (checkbox AND input) is consumed.
		expect(reconciled[0].removeSecret).toBe(false);
		expect(reconciled[0].secretCode).toBe("");
		// The next blank ordinary save preserves the stored replacement.
		const blank = buildInventoryPayload([reconciled[0]]);
		expect(blank.ok).toBe(true);
		if (blank.ok) {
			expect(blank.items[0].removeSecretCode).toBeUndefined();
			expect(blank.items[0].secretCode).toBeUndefined();
		}
	});
});

describe("save outcome status and unsaved edits", () => {
	const submitted = [
		{
			...inventoryRowFromItem(storedItem({ quantityTotal: 20 })),
			quantity: "20",
		},
	];

	test("an identical draft reports the ordinary saved message", () => {
		const outcome = saveOutcomeMessage({
			currentRows: submitted,
			savedCount: 1,
			submittedRows: submitted,
			totalUnits: 20,
		});
		expect(outcome.newerEdits).toBe(false);
		expect(outcome.message).toBe("Đã lưu 1 phần thưởng (tổng 20 lượt trúng).");
	});

	test("a newer quantity edit reports previous-version-saved with unsaved edits", () => {
		const edited = [{ ...submitted[0], quantity: "27" }];
		const outcome = saveOutcomeMessage({
			currentRows: edited,
			savedCount: 1,
			submittedRows: submitted,
			totalUnits: 20,
		});
		expect(outcome.newerEdits).toBe(true);
		expect(outcome.message).toBe("Đã lưu phiên bản trước; các thay đổi hiện tại chưa được lưu.");
	});

	test("an added or removed row after submission also counts as newer edits", () => {
		const withAddition = [
			...submitted,
			createInventoryRow({ name: "Thêm mới", rewardType: "voucher" }),
		];
		expect(
			saveOutcomeMessage({
				currentRows: withAddition,
				savedCount: 1,
				submittedRows: submitted,
				totalUnits: 20,
			}).newerEdits,
		).toBe(true);
		expect(
			saveOutcomeMessage({
				currentRows: [],
				savedCount: 1,
				submittedRows: submitted,
				totalUnits: 20,
			}).newerEdits,
		).toBe(true);
	});

	test("unsaved-edit detection compares against the saved snapshot", () => {
		const snapshot = serializeInventoryDraft(submitted);
		expect(hasUnsavedInventoryEdits(submitted, snapshot)).toBe(false);
		expect(hasUnsavedInventoryEdits([{ ...submitted[0], quantity: "27" }], snapshot)).toBe(true);
		expect(hasUnsavedInventoryEdits(submitted, null)).toBe(false);
	});
});

describe("saved baseline derives from the reconciled SUBMITTED draft", () => {
	// Mirrors the exact caller pipeline in RewardInventoryPanel.handleSave:
	// submitted rows reconstruct the server version for the saved baseline,
	// while current rows are reconciled only for display.
	test("submit 20, edit 27 during the request, resolve: 27 stays unsaved until reverted to 20", () => {
		const submittedRow = createInventoryRow({
			name: "Voucher 20",
			rewardType: "voucher",
			secretCode: "SUBMITTED-CODE",
			quantity: "20",
			weight: "10",
		});
		const submitted = [submittedRow];
		const payload = buildInventoryPayload(submitted);
		expect(payload.ok).toBe(true);
		if (!payload.ok) return;
		const keys = payload.keys;
		const intentions = captureSubmittedIntentions(submitted);
		const ids = ["srv-row-1"];

		// The server version comes from reconciling the SUBMITTED rows.
		const serverVersion = reconcileSavedIds(submitted, keys, ids, intentions);
		const snapshot = serializeInventoryDraft(serverVersion);

		// Quantity edited to 27 while the request was pending.
		const duringFlight = [{ ...submittedRow, quantity: "27" }];
		const display = reconcileSavedIds(duringFlight, keys, ids, intentions);
		expect(hasUnsavedInventoryEdits(display, snapshot)).toBe(true);

		// Edit 28 -> still unsaved; revert 27 -> STILL unsaved (only 20 saved).
		const display28 = display.map((row) => ({ ...row, quantity: "28" }));
		expect(hasUnsavedInventoryEdits(display28, snapshot)).toBe(true);
		const display27 = display28.map((row) => ({ ...row, quantity: "27" }));
		expect(hasUnsavedInventoryEdits(display27, snapshot)).toBe(true);

		// Reverting to the actually saved 20 is clean.
		const display20 = display28.map((row) => ({ ...row, quantity: "20" }));
		expect(hasUnsavedInventoryEdits(display20, snapshot)).toBe(false);

		// Automatic metadata (returned id, consumed secret intention) matches
		// in both reconciled versions, so it is never counted as dirty.
		expect(display27[0].existingItemId).toBe("srv-row-1");
		expect(display20[0].existingItemId).toBe("srv-row-1");
		expect(display27[0].hasSecretCode).toBe(true);
		expect(display27[0].removeSecret).toBe(false);
		expect(display20[0].secretCode).toBe("");
	});

	test("a row added or removed during the request keeps the draft unsaved", () => {
		const submitted = [inventoryRowFromItem(storedItem())];
		const payload = buildInventoryPayload(submitted);
		expect(payload.ok).toBe(true);
		if (!payload.ok) return;
		const intentions = captureSubmittedIntentions(submitted);
		const serverVersion = reconcileSavedIds(submitted, payload.keys, ["srv-1"], intentions);
		const snapshot = serializeInventoryDraft(serverVersion);

		const addedDuringFlight = [
			...submitted.map((row) => ({ ...row })),
			createInventoryRow({ name: "Thêm lúc đang lưu" }),
		];
		const addedDisplay = reconcileSavedIds(addedDuringFlight, payload.keys, ["srv-1"], intentions);
		expect(hasUnsavedInventoryEdits(addedDisplay, snapshot)).toBe(true);

		const removedDisplay = reconcileSavedIds([], payload.keys, ["srv-1"], intentions);
		expect(hasUnsavedInventoryEdits(removedDisplay, snapshot)).toBe(true);
	});
});

describe("campaign and delayed-save isolation", () => {
	test("reconciled ids map back to the exact saved rows by form key", () => {
		const savedRow = inventoryRowFromItem(storedItem());
		const addedDuringFlight = createInventoryRow({ name: "Thêm lúc đang lưu" });
		const rows = [savedRow, addedDuringFlight];
		const payload = buildInventoryPayload([savedRow]);
		expect(payload.ok).toBe(true);
		if (!payload.ok) return;
		const reconciled = reconcileSavedIds(
			rows,
			payload.keys,
			["new-server-id"],
			captureSubmittedIntentions([savedRow]),
		);
		expect(reconciled[0].existingItemId).toBe("new-server-id");
		// The row added during the save flight is untouched.
		expect(reconciled[1].existingItemId).toBeNull();
		// The blank replacement preserved the stored code, so presence stays.
		expect(reconciled[0].hasSecretCode).toBe(true);
	});

	test("a response for campaign A never populates campaign B's draft", () => {
		const campaignADraft = [inventoryRowFromItem(storedItem())];
		const campaignAKeys = buildInventoryPayload(campaignADraft);
		expect(campaignAKeys.ok).toBe(true);
		if (!campaignAKeys.ok) return;
		// The operator switched to campaign B, whose draft rows have their own keys.
		const campaignBRows = [
			createInventoryRow({ name: "B voucher" }),
			createInventoryRow({ name: "B points", rewardType: "points", amount: "50" }),
		];
		const reconciled = reconcileSavedIds(
			campaignBRows,
			campaignAKeys.keys,
			["stale-id-a"],
			captureSubmittedIntentions(campaignADraft),
		);
		expect(reconciled.map((row) => row.existingItemId)).toEqual([null, null]);
		// A removed row's key simply skips reconciliation.
		expect(
			reconcileSavedIds([], campaignAKeys.keys, ["orphan-id"], captureSubmittedIntentions([])),
		).toEqual([]);
	});
});
