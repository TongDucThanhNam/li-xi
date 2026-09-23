export type InventoryRewardType = "cash" | "voucher" | "physical" | "points";

/** Shape returned by the owner inventory query (never raw secret codes). */
export type IncomingInventoryItem = {
	id: string;
	name: string;
	rewardType: string;
	amount: number | null;
	hasSecretCode: boolean;
	quantityTotal: number;
	weight: number;
	isActive: boolean;
	poolTag: string;
};

/** One item of the configureRewardInventory payload. */
export type InventoryPayloadItem = {
	existingItemId?: string;
	name: string;
	rewardType: InventoryRewardType;
	amount?: number;
	secretCode?: string;
	removeSecretCode?: boolean;
	quantity: number;
	weight: number;
	isActive: boolean;
	poolTag: string;
};

export type InventoryFormRow = {
	key: string;
	existingItemId: string | null;
	name: string;
	rewardType: InventoryRewardType;
	amount: string;
	secretCode: string;
	removeSecret: boolean;
	hasSecretCode: boolean;
	quantity: string;
	weight: string;
	isActive: boolean;
	poolTag: string;
};

export const inventoryAmountTypes = new Set<InventoryRewardType>(["cash", "points"]);

export function createInventoryFormKey(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createInventoryRow(partial?: Partial<InventoryFormRow>): InventoryFormRow {
	return {
		key: partial?.key ?? createInventoryFormKey(),
		existingItemId: partial?.existingItemId ?? null,
		name: partial?.name ?? "",
		rewardType: partial?.rewardType ?? "voucher",
		amount: partial?.amount ?? "",
		secretCode: partial?.secretCode ?? "",
		removeSecret: false,
		hasSecretCode: partial?.hasSecretCode ?? false,
		quantity: partial?.quantity ?? "10",
		weight: partial?.weight ?? "20",
		isActive: partial?.isActive ?? true,
		poolTag: partial?.poolTag ?? "",
	};
}

/**
 * Hydration from the owner inventory query: the stored row id and poolTag are
 * retained for the connected save, and only the PRESENCE of a secret is
 * known — raw stored codes are never sent to the client.
 */
export function inventoryRowFromItem(item: IncomingInventoryItem): InventoryFormRow {
	return createInventoryRow({
		key: `stored-${item.id}`,
		existingItemId: item.id,
		name: item.name,
		rewardType: item.rewardType as InventoryRewardType,
		amount: item.amount !== null ? String(item.amount) : "",
		hasSecretCode: item.hasSecretCode,
		quantity: String(item.quantityTotal),
		weight: String(item.weight),
		isActive: item.isActive,
		poolTag: item.poolTag ?? "",
	});
}

/**
 * Changing the reward type intentionally clears fields that are incompatible
 * with the new type so the connected save stays valid: voucher-only secret
 * inputs and cash/points-only amounts.
 */
export function changeInventoryRowType(
	row: InventoryFormRow,
	rewardType: InventoryRewardType,
): InventoryFormRow {
	return {
		...row,
		rewardType,
		...(inventoryAmountTypes.has(rewardType) ? {} : { amount: "" }),
		...(rewardType === "voucher" ? {} : { secretCode: "", removeSecret: false }),
	};
}

function parsePositiveInteger(raw: string): number | null {
	if (!raw.trim()) {
		return null;
	}
	const parsed = Number(raw);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Map the form draft onto the owner write payload. Returned row keys run in
 * payload order so a completed save can reconcile the server's row ids back
 * to the exact form rows — even if other edits happened while the save was
 * in flight.
 */
export function buildInventoryPayload(rows: InventoryFormRow[]):
	| { ok: true; items: InventoryPayloadItem[]; keys: string[] }
	| { ok: false; error: string } {
	const items: InventoryPayloadItem[] = [];
	const keys: string[] = [];
	for (const row of rows) {
		const name = row.name.trim();
		if (!name) {
			return { ok: false, error: "Mỗi phần thưởng cần có tên hiển thị" };
		}
		const quantity = parsePositiveInteger(row.quantity);
		if (quantity === null) {
			return { ok: false, error: "Số lượng phần thưởng phải là số nguyên dương" };
		}
		const weight = parsePositiveInteger(row.weight);
		if (weight === null || weight > 100) {
			return { ok: false, error: "Trọng số trúng thưởng phải từ 1 đến 100" };
		}
		let amount: number | undefined;
		if (inventoryAmountTypes.has(row.rewardType)) {
			amount = parsePositiveInteger(row.amount) ?? undefined;
			if (amount === undefined) {
				return { ok: false, error: "Phần thưởng tiền mặt hoặc điểm cần có giá trị" };
			}
		} else if (row.amount.trim()) {
			return {
				ok: false,
				error: "Chỉ phần thưởng tiền mặt hoặc điểm mới có giá trị số",
			};
		}
		const secretCode = row.secretCode.trim();
		if (secretCode && row.rewardType !== "voucher") {
			return { ok: false, error: "Chỉ phần thưởng voucher mới có mã bí mật" };
		}
		const item: InventoryPayloadItem = {
			name,
			rewardType: row.rewardType,
			quantity,
			weight,
			isActive: row.isActive,
			poolTag: row.poolTag.trim(),
		};
		if (row.existingItemId) {
			item.existingItemId = row.existingItemId;
		}
		if (amount !== undefined) {
			item.amount = amount;
		}
		if (row.rewardType === "voucher" && secretCode) {
			// An explicit non-blank replacement code.
			item.secretCode = secretCode;
		}
		if (
			row.rewardType === "voucher" &&
			row.removeSecret &&
			!secretCode &&
			row.existingItemId
		) {
			// Explicit removal intention; a blank input alone never erases.
			item.removeSecretCode = true;
		}
		items.push(item);
		keys.push(row.key);
	}
	return { ok: true, items, keys };
}

/**
 * Reconcile the server's returned row ids back onto the form rows that were
 * saved (matched by stable form keys, not by index into current rows), so
 * consecutive saves keep referencing retained rows without a reload. A
 * saved-but-then-removed key is skipped; rows added during the save flight
 * are untouched. Secret presence is updated from what was actually saved.
 */
/**
 * Snapshot of the intention each form row submitted with a save. Captured
 * BEFORE the request so the response can resolve stored secret presence and
 * consume one-shot intentions without touching newer edits made during the
 * request flight.
 */
export type SubmittedIntention = {
	key: string;
	rewardType: InventoryRewardType;
	/** Trimmed secret included in the payload ("" when omitted). */
	secretCode: string;
	/** Raw checkbox state at submission (consumption still matches on it). */
	rawRemoveSecret: boolean;
	/** Stored secret presence before this save. */
	hadSecret: boolean;
	/** Presence the server holds after this save, using payload precedence. */
	resultHasSecret: boolean;
};

export function captureSubmittedIntentions(rows: InventoryFormRow[]): SubmittedIntention[] {
	return rows.map((row) => {
		const secretCode = row.secretCode.trim();
		// Same precedence as buildInventoryPayload: a non-blank replacement is
		// the stored code; an actual applied removal (no replacement) clears
		// it; otherwise the prior stored presence stands.
		const resultHasSecret =
			row.rewardType !== "voucher"
				? false
				: secretCode
					? true
					: row.removeSecret
						? false
						: row.hasSecretCode;
		return {
			key: row.key,
			rewardType: row.rewardType,
			secretCode,
			rawRemoveSecret: row.removeSecret,
			hadSecret: row.hasSecretCode,
			resultHasSecret,
		};
	});
}

/** Canonical comparable form of an inventory draft (whole-draft revision). */
export function serializeInventoryDraft(rows: InventoryFormRow[]): string {
	return JSON.stringify(rows);
}

/**
 * Status message for a completed save: when the mounted draft moved on while
 * the request was in flight (any field edit, addition or removal), the saved
 * version is called out as previous and the newer edits are explicitly still
 * unsaved. Identical drafts report the ordinary success.
 */
export function saveOutcomeMessage(args: {
	submittedRows: InventoryFormRow[];
	currentRows: InventoryFormRow[];
	savedCount: number;
	totalUnits: number;
}): { newerEdits: boolean; message: string } {
	const newerEdits =
		serializeInventoryDraft(args.currentRows) !==
		serializeInventoryDraft(args.submittedRows);
	return newerEdits
		? {
				message: "Đã lưu phiên bản trước; các thay đổi hiện tại chưa được lưu.",
				newerEdits,
			}
		: {
				message: `Đã lưu ${args.savedCount} phần thưởng (tổng ${args.totalUnits} lượt trúng).`,
				newerEdits,
			};
}

/** True when a saved snapshot exists and the current draft differs from it. */
export function hasUnsavedInventoryEdits(
	rows: InventoryFormRow[],
	savedSnapshot: string | null,
): boolean {
	return savedSnapshot !== null && serializeInventoryDraft(rows) !== savedSnapshot;
}

/**
 * True when a save response still belongs to the mounted campaign instance
 * and to the newest request: a campaign switch bumps the epoch, and every
 * new save attempt bumps the sequence, so stale success/error/finally work
 * (including an older finally finishing after a newer request) is discarded.
 */
export function isSaveResponseCurrent(args: {
	requestEpoch: number;
	requestSeq: number;
	currentEpoch: number;
	latestSeq: number;
}): boolean {
	return args.requestEpoch === args.currentEpoch && args.requestSeq === args.latestSeq;
}

export function reconcileSavedIds(
	rows: InventoryFormRow[],
	savedKeys: string[],
	savedIds: string[],
	submitted: SubmittedIntention[],
): InventoryFormRow[] {
	const idByKey = new Map<string, string>();
	savedKeys.forEach((key, index) => {
		const id = savedIds[index];
		if (id) {
			idByKey.set(key, id);
		}
	});
	const intentionByKey = new Map<string, SubmittedIntention>();
	for (const intention of submitted) {
		intentionByKey.set(intention.key, intention);
	}
	return rows.map((row) => {
		const id = idByKey.get(row.key);
		if (!id) {
			return row;
		}
		const intention = intentionByKey.get(row.key);
		if (!intention) {
			return { ...row, existingItemId: id };
		}
		// Consume the one-shot replacement/removal inputs only when the draft
		// still matches what was submitted (the raw checkbox state included);
		// a newer edit during the request flight is preserved for the next save.
		const draftMatchesSubmission =
			row.secretCode.trim() === intention.secretCode &&
			row.removeSecret === intention.rawRemoveSecret;
		return {
			...row,
			existingItemId: id,
			hasSecretCode: intention.resultHasSecret,
			...(draftMatchesSubmission ? { secretCode: "", removeSecret: false } : {}),
		};
	});
}
