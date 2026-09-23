import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { buildScratchCardGameConfig } from "../lib/gameTemplates";

async function fixture(stock = 5) {
	const t = convexTest({ schema, modules });
	aggregateTest.register(t);
	polarTest.register(t);
	r2Test.register(t);
	shardedCounterTest.register(t);
	const seeded = await t.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Scratch owner" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId, name: "Scratch campaign", slug: "scratch-campaign",
			theme: "brand", status: "active", createdAt: now, updatedAt: now,
		});
		const campaignGameId = await ctx.db.insert("campaignGames", {
			ownerId, campaignId, templateId: "scratch-card",
			config: buildScratchCardGameConfig({
				noRewardWeight: 0,
				noRewardLabel: "Chúc bạn may mắn",
				coverStyle: "gold",
				revealThresholdPercent: 55,
				publicCopy: {
					headline: "Thẻ cào tri ân",
					subtitle: "UI fixture",
					startCtaLabel: "Bắt đầu",
					collectCtaLabel: "Nhận quà",
					waitingMessage: "",
				},
			}),
			playLimits: { maxSessionsPerParticipant: 2, maxTotalSessions: null },
			status: "active", createdAt: now, updatedAt: now,
		});
		const shareCode = "scratchui0000000000000"; // 22-char lowercase
		await ctx.db.insert("publicPlayLinks", {
			ownerId, campaignId, campaignGameId, shareCode,
			channel: "review-fixture", status: "active", createdAt: now, updatedAt: now,
		});
		await ctx.db.insert("rewardInventory", {
			ownerId, campaignId, name: "Scratch voucher", rewardType: "voucher",
			secretCode: "SCRATCH-SECRET-CODE", quantityTotal: stock,
			quantityRemaining: stock, weight: 1, isActive: true,
			displayOrder: 0, createdAt: now, updatedAt: now,
		});
		return { ownerId, campaignId, campaignGameId, shareCode, stock };
	});
	return { t, ...seeded };
}

async function admit(
	t: ReturnType<typeof convexTest>,
	shareCode: string,
	startKey: string,
) {
	const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
		shareCode, startKey,
	});
	return {
		started,
		capability: { sessionId: started.sessionId, sessionToken: started.sessionToken },
	};
}

async function reveal(
	t: ReturnType<typeof convexTest>,
	capability: { sessionId: string; sessionToken: string },
) {
	return t.mutation(api.publicPlay.playSessionAction, {
		...capability,
		action: { type: "scratch-reveal" },
	});
}

test("scratch: first deliberate reveal allocates once; replay preserves it", async () => {
	const f = await fixture(5);
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const first = await reveal(f.t, capability);
	expect(first.outcome).toMatchObject({
		kind: "reward", rewardType: "voucher", canClaim: true,
	});
	const replay = await reveal(f.t, capability);
	expect(replay.outcome).toMatchObject({ rewardType: "voucher", canClaim: true });
	// Replay does not draw from stock again.
	const counters = await f.t.run(async (ctx) => {
		const item = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", f.campaignId).eq("ownerId", f.ownerId).eq("isActive", true),
			)
			.first();
		return item?.quantityRemaining;
	});
	expect(counters).toBe(4);
});

test("claim recovers the immutable allocated code; privacy holds before claim", async () => {
	const f = await fixture(5);
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	await reveal(f.t, capability);
	// Before claim: outcome has no secret, claim detail unavailable.
	const outcome = await f.t.query(api.publicPlay.getPublicSessionOutcome, capability);
	expect(outcome?.outcome.canClaim).toBe(true);
	const claimDetailBefore = await f.t.query(api.publicPlay.getPublicClaimDetail, capability);
	expect(claimDetailBefore).toBeNull();
	// Claim once → same code on replay.
	const claim1 = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
	expect(claim1.claim.secretCode).toBe("SCRATCH-SECRET-CODE");
	const claim2 = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
	expect(claim2.claim.secretCode).toBe("SCRATCH-SECRET-CODE");
});

test("mismatched actions are rejected for scratch games", async () => {
	const f = await fixture(5);
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	await expect(
		f.t.mutation(api.publicPlay.playSessionAction, {
			...capability, action: { type: "spin" },
		}),
	).rejects.toThrow("Hành động không hợp lệ cho thẻ cào may mắn");
	await expect(
		f.t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "reveal-envelope", envelopeIndex: 0 },
		}),
	).rejects.toThrow("Hành động không hợp lệ cho thẻ cào may mắn");
	// No outcome was allocated by rejected actions.
	const outcome = await f.t.query(api.publicPlay.getPublicSessionOutcome, capability);
	expect(outcome).toBeNull();
});

test("last-unit concurrency: second scratch after exhaustion gets no-reward", async () => {
	const f = await fixture(1);
	const first = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const firstResult = await reveal(f.t, first.capability);
	expect(firstResult.outcome.kind).toBe("reward");
	const second = await admit(f.t, f.shareCode, "fedcba9876543210fedcba9876543210");
	const secondResult = await reveal(f.t, second.capability);
	// Stock exhausted: server truthfully reports the no-reward outcome.
	expect(secondResult.outcome.kind).toBe("no-reward");
});

test("frozen config: scratch outcome survives live config edits after admission", async () => {
	const f = await fixture(5);
	const { capability, started } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const first = await reveal(f.t, capability);
	expect(first.outcome.rewardType).toBe("voucher");
	// Owner flips the admitted game to engagement-only afterwards.
	await f.t.run(async (ctx) => {
		const game = await ctx.db.get(f.campaignGameId);
		if (!game) throw new Error("missing game");
		await ctx.db.patch(game._id, {
			config: buildScratchCardGameConfig({
				rewardMode: "engagement",
				noRewardLabel: "Chúc bạn may mắn",
				publicCopy: {
					headline: "Thẻ cào tri ân (sửa)",
					subtitle: "",
					startCtaLabel: "",
					collectCtaLabel: "",
					waitingMessage: "",
				},
			}),
		});
	});
	// The completed session keeps its original immutable outcome.
	const outcome = await f.t.query(api.publicPlay.getPublicSessionOutcome, capability);
	expect(outcome?.outcome.rewardType).toBe("voucher");
	void started;
});

test("scratch: wrong-token capability reads return null (fail closed)", async () => {
	const f = await fixture(5);
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	await reveal(f.t, capability);
	const wrongToken = { sessionId: capability.sessionId, sessionToken: "wrong-token-0000" };
	await expect(
		f.t.query(api.publicPlay.getPublicSessionOutcome, wrongToken),
	).rejects.toThrow("Phiên chơi không hợp lệ");
	await expect(
		f.t.query(api.publicPlay.getPublicSessionSnapshot, wrongToken),
	).rejects.toThrow("Phiên chơi không hợp lệ");
	await expect(
		f.t.query(api.publicPlay.getPublicClaimDetail, wrongToken),
	).rejects.toThrow("Phiên chơi không hợp lệ");
});

test("scratch: two concurrent reveals against the last unit allocate exactly one reward", async () => {
	const f = await fixture(1);
	const first = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const second = await admit(f.t, f.shareCode, "fedcba9876543210fedcba9876543210");
	const [firstResult, secondResult] = await Promise.all([
		reveal(f.t, first.capability),
		reveal(f.t, second.capability),
	]);
	const kinds = [firstResult.outcome.kind, secondResult.outcome.kind].sort();
	expect(kinds).toEqual(["no-reward", "reward"]);
	// Exact stock identity: the single unit went to exactly one session.
	// (Allocation deactivates an exhausted item, so read without the active
	// index here.)
	const remaining = await f.t.run(async (ctx) => {
		const rows = await ctx.db.query("rewardInventory").collect();
		return rows.find((row) => row.campaignId === f.campaignId)?.quantityRemaining;
	});
	expect(remaining).toBe(0);
	// Outcome identity: the rewarded session carries the allocated inventory
	// item; the losing session carries no claimable outcome.
	const rewardResult = firstResult.outcome.kind === "reward" ? firstResult : secondResult;
	const noRewardResult = firstResult.outcome.kind === "reward" ? secondResult : firstResult;
	expect(rewardResult.outcome.canClaim).toBe(true);
	expect(rewardResult.outcome.rewardType).toBe("voucher");
	expect(noRewardResult.outcome.canClaim).toBe(false);
	// Replay of the losing capability keeps the same truthful no-reward.
	const noRewardReplay = await reveal(f.t, noRewardResult === secondResult ? second.capability : first.capability);
	expect(noRewardReplay.outcome.kind).toBe("no-reward");
});

test("scratch: config edited after admission leaves the frozen snapshot intact", async () => {
	const f = await fixture(5);
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	// Owner rewrites cover, threshold and reward mode AFTER admission but
	// BEFORE the reveal.
	await f.t.run(async (ctx) => {
		const game = await ctx.db.get(f.campaignGameId);
		if (!game) throw new Error("missing game");
		await ctx.db.patch(game._id, {
			config: buildScratchCardGameConfig({
				rewardMode: "engagement",
				noRewardLabel: "Cảm ơn (sửa)",
				coverStyle: "crimson",
				revealThresholdPercent: 100,
				publicCopy: {
					headline: "Thẻ cào (sửa)",
					subtitle: "",
					startCtaLabel: "",
					collectCtaLabel: "",
					waitingMessage: "",
				},
			}),
		});
	});
	// The admitted session still reads the frozen admission snapshot.
	const snapshot = await f.t.query(api.publicPlay.getPublicSessionSnapshot, capability);
	expect(snapshot?.rules.scratchCard).toEqual({
		coverStyle: "gold",
		revealThresholdPercent: 55,
	});
	// The reveal resolves under the frozen rules: still rewarded, still the
	// original cover — never the live engagement edit.
	const result = await reveal(f.t, capability);
	expect(result.outcome.kind).toBe("reward");
	expect(result.outcome.rewardType).toBe("voucher");
	const remaining = await f.t.run(async (ctx) => {
		const item = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", f.campaignId).eq("ownerId", f.ownerId).eq("isActive", true),
			)
			.first();
		return item?.quantityRemaining;
	});
	expect(remaining).toBe(4);
});

test("scratch: explicit engagement mode keeps stocked inventory untouched", async () => {
	const t = convexTest({ schema, modules });
	aggregateTest.register(t);
	polarTest.register(t);
	r2Test.register(t);
	shardedCounterTest.register(t);
	const seeded = await t.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Engagement owner" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId, name: "Engagement campaign", slug: "engagement-campaign",
			theme: "brand", status: "active", createdAt: now, updatedAt: now,
		});
		const campaignGameId = await ctx.db.insert("campaignGames", {
			ownerId, campaignId, templateId: "scratch-card",
			config: buildScratchCardGameConfig({
				rewardMode: "engagement",
				noRewardLabel: "Cảm ơn bạn đã tham gia",
				publicCopy: {
					headline: "Thẻ cào tri ân",
					subtitle: "",
					startCtaLabel: "",
					collectCtaLabel: "",
					waitingMessage: "",
				},
			}),
			playLimits: { maxSessionsPerParticipant: 2, maxTotalSessions: null },
			status: "active", createdAt: now, updatedAt: now,
		});
		const shareCode = "engagementscratch00000"; // 22-char lowercase
		await ctx.db.insert("publicPlayLinks", {
			ownerId, campaignId, campaignGameId, shareCode,
			channel: "review-fixture", status: "active", createdAt: now, updatedAt: now,
		});
		await ctx.db.insert("rewardInventory", {
			ownerId, campaignId, name: "Untouched voucher", rewardType: "voucher",
			secretCode: "ENGAGEMENT-SECRET", quantityTotal: 5,
			quantityRemaining: 5, weight: 1, isActive: true,
			displayOrder: 0, createdAt: now, updatedAt: now,
		});
		return { ownerId, campaignId, campaignGameId, shareCode };
	});
	const { capability } = await admit(t, seeded.shareCode, "0123456789abcdef0123456789abcdef");
	const result = await reveal(t, capability);
	expect(result.outcome.kind).toBe("no-reward");
	expect(result.outcome.canClaim).toBe(false);
	// Engagement never allocates or consumes stocked inventory.
	const remaining = await t.run(async (ctx) => {
		const item = await ctx.db
			.query("rewardInventory")
			.withIndex("by_campaign_owner_active", (q) =>
				q.eq("campaignId", seeded.campaignId).eq("ownerId", seeded.ownerId).eq("isActive", true),
			)
			.first();
		return item?.quantityRemaining;
	});
	expect(remaining).toBe(5);
	const claimDetail = await t.query(api.publicPlay.getPublicClaimDetail, capability);
	expect(claimDetail).toBeNull();
});

test("scratch: public snapshot and outcome stay secret-free before the claim", async () => {
	const f = await fixture(5);
	const { capability } = await admit(f.t, f.shareCode, "0123456789abcdef0123456789abcdef");
	const revealed = await reveal(f.t, capability);
	expect(revealed.outcome.canClaim).toBe(true);
	const snapshot = await f.t.query(api.publicPlay.getPublicSessionSnapshot, capability);
	expect(JSON.stringify(snapshot)).not.toContain("SCRATCH-SECRET-CODE");
	const outcome = await f.t.query(api.publicPlay.getPublicSessionOutcome, capability);
	expect(JSON.stringify(outcome)).not.toContain("SCRATCH-SECRET-CODE");
	// The code exists only inside the claim detail after claiming.
	const claim = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
	expect(claim.claim.secretCode).toBe("SCRATCH-SECRET-CODE");
});
