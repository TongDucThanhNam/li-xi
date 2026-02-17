import { ENVELOPE_COUNT } from "@/lib/lixiPolicy";
import type { CardState, Prize, RewardPoolItem } from "./types";

export function createInitialCards(): CardState[] {
	return Array.from({ length: ENVELOPE_COUNT }, () => ({
		isIn: false,
		isOpened: false,
		isMissed: false,
		prize: null,
	}));
}

function clonePool(pool: RewardPoolItem[]) {
	return pool
		.filter((item) => item.remainingQuantity > 0)
		.map((item) => ({ ...item }));
}

function consumePrize(
	pool: RewardPoolItem[],
	prize: Prize,
): RewardPoolItem[] {
	const index = pool.findIndex(
		(item) =>
			item.amount === prize.amount &&
			item.rarity === prize.rarity &&
			item.remainingQuantity > 0,
	);
	if (index < 0) {
		return pool;
	}

	const next = [...pool];
	next[index] = {
		...next[index],
		remainingQuantity: next[index].remainingQuantity - 1,
	};
	return next;
}

function drawPrizeWithoutReplacement(
	pool: RewardPoolItem[],
): { prize: Prize | null; nextPool: RewardPoolItem[] } {
	const available = pool.filter((item) => item.remainingQuantity > 0);
	if (available.length === 0) {
		return { prize: null, nextPool: pool };
	}

	const totalWeight = available.reduce(
		(sum, item) => sum + item.remainingQuantity,
		0,
	);
	let threshold = Math.floor(Math.random() * totalWeight);
	for (const item of available) {
		threshold -= item.remainingQuantity;
		if (threshold < 0) {
			const prize: Prize = { amount: item.amount, rarity: item.rarity };
			return {
				prize,
				nextPool: consumePrize(pool, prize),
			};
		}
	}

	const fallback = available[available.length - 1];
	const fallbackPrize: Prize = {
		amount: fallback.amount,
		rarity: fallback.rarity,
	};
	return {
		prize: fallbackPrize,
		nextPool: consumePrize(pool, fallbackPrize),
	};
}

/**
 * Pre-assign cosmetic prizes to all cards at stage start.
 * Values are purely visual (the real prize is determined by the backend on click).
 * By assigning here — while rewardPool is guaranteed fresh — we avoid
 * any stale-closure issues during the later reveal timeout.
 */
export function buildPreAssignedPrizes(
	pool: RewardPoolItem[],
	count: number,
): Array<Prize | null> {
	let workingPool = clonePool(pool);
	const prizes: Array<Prize | null> = [];

	// Fallback kinds for recycling when the working pool is exhausted.
	// IMPORTANT: only include items that are still available (remainingQuantity > 0)
	// so we never show a depleted prize (e.g. 200k Legend already gone).
	const prizeKinds = pool
		.filter((item) => item.amount > 0 && item.remainingQuantity > 0)
		.map((item) => ({ amount: item.amount, rarity: item.rarity }));

	for (let i = 0; i < count; i += 1) {
		const draw = drawPrizeWithoutReplacement(workingPool);
		if (draw.prize) {
			prizes.push(draw.prize);
			workingPool = draw.nextPool;
		} else if (prizeKinds.length > 0) {
			const kind =
				prizeKinds[Math.floor(Math.random() * prizeKinds.length)];
			prizes.push({ amount: kind.amount, rarity: kind.rarity });
		} else {
			prizes.push(null);
		}
	}
	return prizes;
}

export function getAvailablePrizeKinds(pool: RewardPoolItem[]): Prize[] {
	const unique = new Map<string, Prize>();
	for (const item of pool) {
		if (item.remainingQuantity <= 0) {
			continue;
		}
		const key = `${item.amount}-${item.rarity}`;
		if (!unique.has(key)) {
			unique.set(key, { amount: item.amount, rarity: item.rarity });
		}
	}
	return Array.from(unique.values());
}
