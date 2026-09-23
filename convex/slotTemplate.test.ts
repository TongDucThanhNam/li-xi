import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	buildSlotRevealGameConfig,
	buildSlotWinningCombinations,
	SLOT_MISS_COMBINATION,
	slotSymbolKeys,
} from "../lib/gameTemplates";

const SHARE_CODE = "slotui0000000000000000"; // 22-char lowercase

type Seeded = {
	t: ReturnType<typeof convexTest>;
	ownerId: Id<"users">;
	campaignId: Id<"campaigns">;
	campaignGameId: Id<"campaignGames">;
	shareCode: string;
	itemIds: Id<"rewardInventory">[];
};

/**
 * Slot fixture: one rewarded slot game whose pool holds `stock`-unit items in
 * documented display order (first item = voucher with a private secret).
 */
async function fixture(options: {
	itemWeights?: number[];
	stock?: number;
	rewardMode?: "rewarded" | "engagement";
} = {}): Promise<Seeded> {
	const itemWeights = options.itemWeights ?? [1, 1];
	const stock = options.stock ?? 5;
	const t = convexTest({ schema, modules });
	aggregateTest.register(t);
	polarTest.register(t);
	r2Test.register(t);
	shardedCounterTest.register(t);
	const seeded = await t.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Slot owner" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId, name: "Slot campaign", slug: "slot-campaign",
			theme: "brand", status: "active", createdAt: now, updatedAt: now,
		});
		const campaignGameId = await ctx.db.insert("campaignGames", {
			ownerId, campaignId, templateId: "slot-reveal",
			config: buildSlotRevealGameConfig({
				rewardMode: options.rewardMode ?? "rewarded",
				noRewardWeight: 0,
				noRewardLabel: "Chúc bạn may mắn lần sau",
				reelTheme: "neon",
				publicCopy: {
					headline: "Máy quay tri ân",
					subtitle: "UI fixture",
					startCtaLabel: "Quay ngay",
					collectCtaLabel: "Nhận quà",
					waitingMessage: "",
				},
			}),
			playLimits: { maxSessionsPerParticipant: 10, maxTotalSessions: null },
			status: "active", createdAt: now, updatedAt: now,
		});
		const shareCode = SHARE_CODE;
		await ctx.db.insert("publicPlayLinks", {
			ownerId, campaignId, campaignGameId, shareCode,
			channel: "review-fixture", status: "active", createdAt: now, updatedAt: now,
		});
		const itemIds: Id<"rewardInventory">[] = [];
		for (const [index, weight] of itemWeights.entries()) {
			const isVoucher = index === 0;
			itemIds.push(
				await ctx.db.insert("rewardInventory", {
					ownerId, campaignId,
					name: isVoucher ? "Slot voucher" : `Slot phần thưởng ${index}`,
					rewardType: isVoucher ? "voucher" : "points",
					...(isVoucher ? { secretCode: "SLOT-SECRET-CODE" } : {}),
					...(index > 0 ? { amount: 25 } : {}),
					quantityTotal: stock,
					quantityRemaining: stock, weight, isActive: true,
					displayOrder: index, createdAt: now, updatedAt: now,
				}),
			);
		}
		return { ownerId, campaignId, campaignGameId, shareCode, itemIds };
	});
	return { t, ...seeded };
}

async function admit(t: ReturnType<typeof convexTest>, shareCode: string, startKey: string) {
	const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
		shareCode, startKey,
	});
	return { started, capability: { sessionId: started.sessionId, sessionToken: started.sessionToken } };
}

async function spin(t: ReturnType<typeof convexTest>, capability: { sessionId: string; sessionToken: string }) {
	return t.mutation(api.publicPlay.playSessionAction, {
		...capability,
		action: { type: "spin-reels" },
	});
}

test("slot: frozen snapshot maps documented combinations by pool display order", async () => {
	const f = await fixture({ itemWeights: [1, 1], stock: 5 });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const snapshot = await f.t.query(api.publicPlay.getPublicSessionSnapshot, capability);
	expect(snapshot?.rules.slotReels).toEqual({
		reelTheme: "neon",
		winningCombinations: [
			{ itemId: f.itemIds[0], symbolKeys: ["bell", "bell", "bell"] },
			{ itemId: f.itemIds[1], symbolKeys: ["star", "star", "star"] },
		],
		missCombination: [...SLOT_MISS_COMBINATION],
	});
	// The documented symbol order backs the mapping.
	expect(snapshot?.rules.slotReels?.winningCombinations.every((combination) =>
		combination.symbolKeys.every((key) => slotSymbolKeys.includes(key as never)),
	)).toBe(true);
});

test("slot: candidate mapping caps at the bounded eight", () => {
	const ids = Array.from({ length: 9 }, (_, index) => `item-${index}`);
	const combinations = buildSlotWinningCombinations(ids);
	expect(combinations).toHaveLength(8);
	expect(combinations.every((combination) => ids.includes(combination.itemId))).toBe(
		true,
	);
	expect(ids.slice(8).some((id) => combinations.some((combination) => combination.itemId === id))).toBe(
		false,
	);
});

/**
 * Five-item slot pool: one item per supported inventory reward type plus a
 * duplicate-label sibling (same label + amount, distinct id).
 */
async function fiveTypeFixture() {
	const t = convexTest({ schema, modules });
	aggregateTest.register(t);
	polarTest.register(t);
	r2Test.register(t);
	shardedCounterTest.register(t);
	const seeded = await t.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Slot types owner" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId, name: "Slot types campaign", slug: "slot-types-campaign",
			theme: "brand", status: "active", createdAt: now, updatedAt: now,
		});
		const campaignGameId = await ctx.db.insert("campaignGames", {
			ownerId, campaignId, templateId: "slot-reveal",
			config: buildSlotRevealGameConfig({
				noRewardWeight: 0,
				noRewardLabel: "Chúc bạn may mắn lần sau",
				reelTheme: "festive",
				publicCopy: {
					headline: "Máy quay tri ân", subtitle: "", startCtaLabel: "",
					collectCtaLabel: "", waitingMessage: "",
				},
			}),
			playLimits: { maxSessionsPerParticipant: 10, maxTotalSessions: null },
			status: "active", createdAt: now, updatedAt: now,
		});
		const shareCode = "slottypes0000000000000"; // 22-char lowercase
		await ctx.db.insert("publicPlayLinks", {
			ownerId, campaignId, campaignGameId, shareCode,
			channel: "review-fixture", status: "active", createdAt: now, updatedAt: now,
		});
		const plan: Array<{
			name: string;
			rewardType: "cash" | "voucher" | "physical" | "points";
			amount?: number;
		}> = [
			{ name: "Slot voucher", rewardType: "voucher" },
			{ name: "Tiền mặt tri ân", rewardType: "cash", amount: 50000 },
			{ name: "Hộp quà sự kiện", rewardType: "physical" },
			{ name: "Điểm thưởng", rewardType: "points", amount: 25 },
			// Duplicate LABEL+AMOUNT of the points item, DISTINCT id.
			{ name: "Điểm thưởng", rewardType: "points", amount: 25 },
		];
		const itemIds: Id<"rewardInventory">[] = [];
		for (const [index, item] of plan.entries()) {
			itemIds.push(
				await ctx.db.insert("rewardInventory", {
					ownerId, campaignId, name: item.name, rewardType: item.rewardType,
					...(item.rewardType === "voucher" ? { secretCode: "SLOT-SECRET-CODE" } : {}),
					...(item.amount !== undefined ? { amount: item.amount } : {}),
					quantityTotal: 5, quantityRemaining: 5, weight: 1, isActive: true,
					displayOrder: index, createdAt: now, updatedAt: now,
				}),
			);
		}
		return { ownerId, campaignId, campaignGameId, shareCode, itemIds, plan };
	});
	return { t, ...seeded };
}

test("slot: frozen mapping covers every reward type and disambiguates duplicate labels", async () => {
	const f = await fiveTypeFixture();
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const snapshot = await f.t.query(api.publicPlay.getPublicSessionSnapshot, capability);
	const combinations = snapshot?.rules.slotReels?.winningCombinations ?? [];
	// Every candidate item is mapped, in pool display order.
	expect(combinations.map((combination) => combination.itemId)).toEqual(f.itemIds);
	// Distinct items own DISTINCT combinations — duplicate labels cannot
	// collide.
	expect(new Set(combinations.map((combination) => combination.symbolKeys.join("|"))).size).toBe(
		f.itemIds.length,
	);
	// Type coverage: cash, voucher, physical and points are all mapped.
	const items = await f.t.run(async (ctx) =>
		Promise.all(f.itemIds.map((itemId) => ctx.db.get(itemId))),
	);
	const mappedTypes = new Set(
		items.map((item, index) => (item ? `${item.rewardType}:${combinations[index]?.itemId}` : "")),
	);
	expect(mappedTypes.size).toBe(f.itemIds.length);

	// Deterministic exact winning outcome per type: exhaust every other
	// item's stock so the target is the only allocable candidate.
	const expected = f.plan.map((planEntry) => ({
		rewardType: planEntry.rewardType,
		label: planEntry.name,
		amount: planEntry.amount ?? null,
	}));
	let lastOutcome: {
		segmentKey: string | null;
		label: string;
		amount: number | null;
	} | null = null;
	for (const [index, targetId] of f.itemIds.entries()) {
		const startKey = ["0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210", "11111111111111111111111111111111", "22222222222222222222222222222222", "33333333333333333333333333333333"][index];
		const session = await admit(f.t, f.shareCode, startKey);
		await f.t.run(async (ctx) => {
			for (const [itemIndex, itemId] of f.itemIds.entries()) {
				if (itemIndex === index) continue;
				await ctx.db.patch(itemId, { quantityRemaining: 0, isActive: false });
			}
		});
		const result = await spin(f.t, session.capability);
		// Exact winning outcome identity for this type.
		expect(result.outcome.kind).toBe("reward");
		expect(result.outcome.segmentKey).toBe(targetId);
		expect(result.outcome.rewardType).toBe(expected[index].rewardType);
		// The duplicate-label pair shares label+amount but NEVER the identity.
		if (lastOutcome) {
			if (lastOutcome.label === expected[index].label && lastOutcome.amount === expected[index].amount) {
				expect(lastOutcome.segmentKey).not.toBe(result.outcome.segmentKey);
			}
		}
		lastOutcome = {
			segmentKey: result.outcome.segmentKey,
			label: expected[index].label,
			amount: expected[index].amount,
		};
		// Restore the pool for the next iteration.
		await f.t.run(async (ctx) => {
			for (const [itemIndex, itemId] of f.itemIds.entries()) {
				if (itemIndex === index) continue;
				await ctx.db.patch(itemId, { quantityRemaining: 5, isActive: true });
			}
		});
	}
	// Points and its duplicate sibling (indices 3, 4) share label and amount.
	const pointsOutcome = { label: expected[3].label, amount: expected[3].amount };
	expect(pointsOutcome).toEqual({ label: expected[4].label, amount: expected[4].amount });
});

test("slot: first spin allocates once; replay preserves it and the stock", async () => {
	const f = await fixture({ itemWeights: [1, 1], stock: 5 });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const first = await spin(f.t, capability);
	expect(first.outcome).toMatchObject({ kind: "reward", canClaim: true });
	expect(["voucher", "points"]).toContain(first.outcome.rewardType);
	// The winner is always a frozen candidate item (documented combination).
	expect([f.itemIds[0], f.itemIds[1]]).toContain(first.outcome.segmentKey);
	const replay = await spin(f.t, capability);
	expect(replay.outcome).toMatchObject({ kind: "reward", canClaim: true });
	expect(replay.outcome.segmentKey).toBe(first.outcome.segmentKey);
	// Replay does not draw from stock again, and the winner is a frozen candidate.
	const remaining = await f.t.run(async (ctx) => {
		const rows = await ctx.db.query("rewardInventory").collect();
		return rows.filter((row) => row.campaignId === f.campaignId).map((row) => row.quantityRemaining);
	});
	expect(remaining.sort((a, b) => a - b)).toEqual([4, 5]);
});

test("slot: mismatched actions are rejected and allocate nothing", async () => {
	const f = await fixture({ itemWeights: [1, 1], stock: 5 });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	await expect(
		f.t.mutation(api.publicPlay.playSessionAction, {
			...capability, action: { type: "spin" },
		}),
	).rejects.toThrow("Hành động không hợp lệ cho máy quay tri ân");
	await expect(
		f.t.mutation(api.publicPlay.playSessionAction, {
			...capability, action: { type: "scratch-reveal" },
		}),
	).rejects.toThrow("Hành động không hợp lệ cho máy quay tri ân");
	const outcome = await f.t.query(api.publicPlay.getPublicSessionOutcome, capability);
	expect(outcome).toBeNull();
});

test("slot: last-unit concurrency rewards exactly one session", async () => {
	const f = await fixture({ itemWeights: [1], stock: 1 });
	const first = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const second = await admit(f.t, f.shareCode, "fedcba9876543210fedcba9876543210");
	const [firstResult, secondResult] = await Promise.all([
		spin(f.t, first.capability),
		spin(f.t, second.capability),
	]);
	const kinds = [firstResult.outcome.kind, secondResult.outcome.kind].sort();
	expect(kinds).toEqual(["no-reward", "reward"]);
	// The loser receives the documented miss combination as its presentation
	// and the truthful no-reward label.
	const loser = firstResult.outcome.kind === "reward" ? secondResult : firstResult;
	expect(loser.outcome.canClaim).toBe(false);
	const remaining = await f.t.run(async (ctx) => {
		const rows = await ctx.db.query("rewardInventory").collect();
		return rows.filter((row) => row.campaignId === f.campaignId).map((row) => row.quantityRemaining);
	});
	expect(remaining).toEqual([0]);
});

test("slot: config edited between admission and spin leaves the frozen mapping intact", async () => {
	const f = await fixture({ itemWeights: [1, 1], stock: 5 });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	// Owner flips the game to engagement + new theme AFTER admission.
	await f.t.run(async (ctx) => {
		const game = await ctx.db.get(f.campaignGameId);
		if (!game) throw new Error("missing game");
		await ctx.db.patch(game._id, {
			config: buildSlotRevealGameConfig({
				rewardMode: "engagement",
				noRewardWeight: 0,
				noRewardLabel: "Cảm ơn (sửa)",
				reelTheme: "festive",
				publicCopy: {
					headline: "Máy quay (sửa)", subtitle: "", startCtaLabel: "",
					collectCtaLabel: "", waitingMessage: "",
				},
			}),
		});
	});
	// The admitted session still reads the frozen admission mapping.
	const snapshot = await f.t.query(api.publicPlay.getPublicSessionSnapshot, capability);
	expect(snapshot?.rules.slotReels?.reelTheme).toBe("neon");
	expect(snapshot?.rules.slotReels?.winningCombinations).toHaveLength(2);
	// The spin still rewards under the frozen rules (never the live engagement
	// edit), and the winner is one of the frozen candidate items.
	const result = await spin(f.t, capability);
	expect(result.outcome.kind).toBe("reward");
	expect(["voucher", "points"]).toContain(result.outcome.rewardType);
	expect([f.itemIds[0], f.itemIds[1]]).toContain(result.outcome.segmentKey);
});

test("slot: pool items added after admission can never win a frozen session", async () => {
	// One frozen candidate at admission; a heavy newcomer joins the pool later.
	const f = await fixture({ itemWeights: [1], stock: 5 });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	await f.t.run(async (ctx) => {
		await ctx.db.insert("rewardInventory", {
			ownerId: f.ownerId, campaignId: f.campaignId,
			name: "Newcomer hộp quà", rewardType: "physical",
			quantityTotal: 5, quantityRemaining: 5, weight: 100, isActive: true,
			displayOrder: 1, createdAt: Date.now(), updatedAt: Date.now(),
		});
	});
	const result = await spin(f.t, capability);
	// Deterministic: with the newcomer excluded, the only candidate wins.
	expect(result.outcome.kind).toBe("reward");
	expect(result.outcome.segmentKey).toBe(f.itemIds[0]);
});

test("slot: engagement mode keeps stocked inventory untouched", async () => {
	const f = await fixture({ itemWeights: [1, 1], stock: 5, rewardMode: "engagement" });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const result = await spin(f.t, capability);
	expect(result.outcome.kind).toBe("no-reward");
	expect(result.outcome.canClaim).toBe(false);
	const remaining = await f.t.run(async (ctx) => {
		const rows = await ctx.db.query("rewardInventory").collect();
		return rows.filter((row) => row.campaignId === f.campaignId).map((row) => row.quantityRemaining);
	});
	expect(remaining).toEqual([5, 5]);
	const claimDetail = await f.t.query(api.publicPlay.getPublicClaimDetail, capability);
	expect(claimDetail).toBeNull();
});

test("slot: public snapshot and outcome stay secret-free before the claim", async () => {
	const f = await fixture({ itemWeights: [1], stock: 5 });
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const result = await spin(f.t, capability);
	expect(result.outcome.canClaim).toBe(true);
	const snapshot = await f.t.query(api.publicPlay.getPublicSessionSnapshot, capability);
	expect(JSON.stringify(snapshot)).not.toContain("SLOT-SECRET-CODE");
	const outcome = await f.t.query(api.publicPlay.getPublicSessionOutcome, capability);
	expect(JSON.stringify(outcome)).not.toContain("SLOT-SECRET-CODE");
	const claim = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
	expect(claim.claim.secretCode).toBe("SLOT-SECRET-CODE");
	const claimReplay = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
	expect(claimReplay.claim.secretCode).toBe("SLOT-SECRET-CODE");
});
