/**
 * Pure policy helpers for the generic play engine: unguessable code/token
 * generation, share-code normalization, weighted reward selection, and
 * participant-provided detail sanitization. No Convex imports so both the
 * backend and Vitest can exercise them directly.
 */

export const SHARE_CODE_LENGTH = 22;
const SHARE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const shareCodePattern = new RegExp(`^[a-z0-9]{${SHARE_CODE_LENGTH}}$`);

export const PARTICIPANT_TOKEN_LENGTH = 32;
export const SESSION_TOKEN_LENGTH = 32;

export type ProvidedDetailBounds = {
	minLength: number;
	maxLength: number;
};

export const PROVIDED_NAME_BOUNDS: ProvidedDetailBounds = {
	minLength: 0,
	maxLength: 48,
};

export const NO_REWARD_OPTION_KEY = "__no-reward__";

function assertPositiveInt(length: number) {
	if (!Number.isSafeInteger(length) || length <= 0) {
		throw new Error("Độ dài mã không hợp lệ");
	}
}

function randomInts(maxExclusive: number, count: number): number[] {
	assertPositiveInt(maxExclusive);
	const uint32Range = 0x100000000;
	if (maxExclusive > uint32Range) {
		throw new Error("Khoảng random không hợp lệ");
	}
	const rejectionThreshold = uint32Range - (uint32Range % maxExclusive);
	const results: number[] = [];
	const buffer = new Uint32Array(1);
	while (results.length < count) {
		crypto.getRandomValues(buffer);
		if (buffer[0] < rejectionThreshold) {
			results.push(buffer[0] % maxExclusive);
		}
	}
	return results;
}

export function generateUnguessableCode(length: number): string {
	assertPositiveInt(length);
	const picks = randomInts(SHARE_CODE_ALPHABET.length, length);
	return picks.map((pick) => SHARE_CODE_ALPHABET[pick]).join("");
}

export function generateShareCode(): string {
	return generateUnguessableCode(SHARE_CODE_LENGTH);
}

export function generateParticipantToken(): string {
	return generateUnguessableCode(PARTICIPANT_TOKEN_LENGTH);
}

export function generateSessionToken(): string {
	return generateUnguessableCode(SESSION_TOKEN_LENGTH);
}

export function normalizeShareCode(value: string): string | null {
	const shareCode = value.trim().toLowerCase();
	return shareCodePattern.test(shareCode) ? shareCode : null;
}

export function assertNonEmptyToken(value: string, label: string): string {
	const token = value.trim();
	if (!token || token.length < 16 || token.length > 128 || /\s/.test(token)) {
		throw new Error(`${label} không hợp lệ`);
	}
	return token;
}

const capabilityTokenPattern = /^[a-z0-9]{16,128}$/;

/**
 * Caller-supplied participant capabilities must look like server-generated
 * tokens before they can ever be stored; malformed values (including empty
 * strings) are rejected instead of persisted.
 */
export function assertParticipantToken(value: string): string {
	const token = value.trim();
	if (!capabilityTokenPattern.test(token)) {
		throw new Error("Token người tham gia không hợp lệ");
	}
	return token;
}

const startKeyPattern = /^[a-f0-9]{32}$/;

/** Client-persisted start idempotency key (32 hex chars). */
export function assertStartKey(value: string): string {
	const startKey = value.trim();
	if (!startKeyPattern.test(startKey)) {
		throw new Error("Start key không hợp lệ");
	}
	return startKey;
}

/** Generates the start idempotency key persisted on the client before the first start. */
export function newStartKey(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const openKeyPattern = /^[a-zA-Z0-9-]{8,64}$/;

export function assertOpenKey(value: string): string {
	const key = value.trim();
	if (!openKeyPattern.test(key)) {
		throw new Error("Open key không hợp lệ");
	}
	return key;
}

export function sanitizeProvidedName(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const clean = value.trim().replace(/\s+/g, " ").slice(0, PROVIDED_NAME_BOUNDS.maxLength);
	return clean ? clean : undefined;
}

export type WeightedSelectionOption = {
	key: string;
	weight: number;
};

export function totalSelectionWeight(
	options: WeightedSelectionOption[],
	noRewardWeight: number,
): number {
	if (!Number.isSafeInteger(noRewardWeight) || noRewardWeight < 0) {
		throw new Error("Trọng số không hợp lệ");
	}
	return options.reduce((sum, option) => {
		if (!Number.isSafeInteger(option.weight) || option.weight < 0) {
			throw new Error("Trọng số không hợp lệ");
		}
		return sum + option.weight;
	}, noRewardWeight);
}

/**
 * Bounded weighted selection. `roll` must be an integer in
 * [0, totalWeight); the no-reward pseudo entry participates as a regular
 * weighted option so exhaustion and configured no-win odds share one path.
 * Returns null only when the total weight is zero (empty pool).
 */
export function selectWeightedOption(
	options: WeightedSelectionOption[],
	noRewardWeight: number,
	roll: number,
): WeightedSelectionOption | null {
	const totalWeight = totalSelectionWeight(options, noRewardWeight);
	if (totalWeight <= 0) {
		return null;
	}
	if (!Number.isSafeInteger(roll) || roll < 0 || roll >= totalWeight) {
		throw new Error("Giá trị chọn phần thưởng không hợp lệ");
	}
	let cursor = roll;
	for (const option of options) {
		cursor -= option.weight;
		if (cursor < 0) {
			return option;
		}
	}
	cursor -= noRewardWeight;
	if (cursor < 0) {
		return { key: NO_REWARD_OPTION_KEY, weight: noRewardWeight };
	}
	throw new Error("Không chọn được phần thưởng");
}

export function secureRandomInt(maxExclusive: number): number {
	const picks = randomInts(maxExclusive, 1);
	return picks[0];
}

export type RewardType = "cash" | "voucher" | "physical" | "points" | "none";

export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
	cash: "Tiền mặt",
	voucher: "Voucher",
	physical: "Quà tặng",
	points: "Điểm",
	none: "Không có phần thưởng",
};

export function rewardOutcomeLabel(args: {
	rewardType: RewardType;
	name: string;
	amount?: number;
	formatCurrency?: (value: number) => string;
}): string {
	const name = args.name.trim();
	if (args.rewardType === "cash" && typeof args.amount === "number") {
		const formatted = args.formatCurrency
			? args.formatCurrency(args.amount)
			: `${args.amount}`;
		return name ? `${name} ${formatted}` : formatted;
	}
	if (args.rewardType === "points" && typeof args.amount === "number") {
		return name ? `${name} (${args.amount} điểm)` : `${args.amount} điểm`;
	}
	return name || REWARD_TYPE_LABELS[args.rewardType];
}
