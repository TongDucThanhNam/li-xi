import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import schema from "./schema";
import {
	buildLuckyWheelGameConfig,
	buildLiXiGameConfig,
	configNoRewardWeight,
	configRewardSource,
	configTemplateId,
	luckyWheelInitialCampaignGameConfig,
} from "../lib/gameTemplates";
import { modules } from "./test.setup";

function registerComponents(testContext: ReturnType<typeof convexTest>) {
	aggregateTest.register(testContext);
	r2Test.register(testContext);
	shardedCounterTest.register(testContext);
	polarTest.register(testContext);
}

type InventorySeed = {
	name: string;
	rewardType: "cash" | "voucher" | "physical" | "points";
	amount?: number;
	secretCode?: string;
	quantity: number;
	weight: number;
	poolTag?: string;
};

type SeededCampaign = {
	ownerId: Id<"users">;
	campaignId: Id<"campaigns">;
	liXiGameId: Id<"campaignGames">;
	wheelGameId: Id<"campaignGames">;
	shareLinkId: Id<"publicPlayLinks">;
	shareCode: string;
};

async function seedCampaignGameWorld(
	testContext: ReturnType<typeof convexTest>,
	options: {
		ownerName: string;
		slug: string;
		inventory?: InventorySeed[];
		wheelNoRewardWeight?: number;
		liXiRewardSource?: "campaign-budget" | "campaign-inventory";
	},
): Promise<SeededCampaign> {
	return testContext.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: options.ownerName });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId,
			name: `Chiến dịch ${options.ownerName}`,
			slug: options.slug,
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const liXiGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "li-xi",
			config: buildLiXiGameConfig({
				rewardSource: options.liXiRewardSource ?? "campaign-budget",
			}),
			name: "Lunar Fortune",
			playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const wheelGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({
				noRewardWeight: options.wheelNoRewardWeight ?? 0,
			}),
			name: "Vòng quay may mắn",
			playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
			status: "active",
			createdAt: now + 1,
			updatedAt: now + 1,
		});
		let displayOrder = 0;
		for (const item of options.inventory ?? []) {
			await ctx.db.insert("rewardInventory", {
				ownerId,
				campaignId,
				name: item.name,
				rewardType: item.rewardType,
				amount: item.amount,
				secretCode: item.secretCode,
				quantityTotal: item.quantity,
				quantityRemaining: item.quantity,
				weight: item.weight,
				isActive: true,
				displayOrder: displayOrder++,
				poolTag: item.poolTag,
				createdAt: now,
				updatedAt: now,
			});
		}
		const shareCode = "abcdefghjkmnpqrstuvwxyz234567".slice(0, 22);
		const shareLinkId = await ctx.db.insert("publicPlayLinks", {
			ownerId,
			campaignId,
			campaignGameId: wheelGameId,
			shareCode,
			channel: "qr",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		return { ownerId, campaignId, liXiGameId, wheelGameId, shareLinkId, shareCode };
	});
}

async function seedLinkForGame(
	testContext: ReturnType<typeof convexTest>,
	world: SeededCampaign,
	campaignGameId: Id<"campaignGames">,
): Promise<string> {
	return testContext.run(async (ctx) => {
		const now = Date.now();
		const code = "zyxwvutsrqponmkjihgfe" + "d";
		await ctx.db.insert("publicPlayLinks", {
			ownerId: world.ownerId,
			campaignId: world.campaignId,
			campaignGameId,
			shareCode: code,
			channel: "direct",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		return code;
	});
}

function countEvents(
	rows: Array<{ eventKey: string; metric: string }>,
	metric: string,
): number {
	return rows.filter((row) => row.metric === metric).length;
}

/** Drives both status buckets of one game through the bounded backfill. */
async function runGameBackfillToReady(
	asOwner: {
		mutation: (
			ref: typeof internal.playMaintenance.backfillGameAccountingPage,
			args: { campaignGameId: string; status: "active" | "completed"; limit: number },
		) => Promise<{ complete: boolean }>;
	},
	campaignGameId: string,
	limit = 25,
): Promise<void> {
	for (const status of ["active", "completed"] as const) {
		for (let page = 0; page < 1000; page += 1) {
			const result = await asOwner.mutation(
				internal.playMaintenance.backfillGameAccountingPage,
				{ campaignGameId, status, limit },
			);
			if (result.complete) {
				break;
			}
		}
	}
}

describe("session admission and recovery", () => {
	test("an admitted session resumes even when it fills the final capacity slot", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Cap owner",
			slug: "cap-owner-campaign",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		const link = await seedLinkForGame(t, world, world.wheelGameId);
		await t.run(async (ctx) => {
			const linkRow = await ctx.db
				.query("publicPlayLinks")
				.withIndex("by_shareCode", (q) => q.eq("shareCode", link))
				.first();
			if (!linkRow) throw new Error("missing link");
			const game = await ctx.db.get(linkRow.campaignGameId);
			if (!game) throw new Error("missing game");
			await ctx.db.patch(game._id, {
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: 1 },
			});
		});

		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: link,
			startKey: "a".repeat(32),
		});
		// The owner of the only slot must still resume despite the full cap.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: link,
				participantToken: first.participantToken ?? undefined,
				startKey: "a".repeat(32),
			}),
		).resolves.toMatchObject({
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			resumed: true,
		});

		// An unrelated participant is still rejected at the full cap.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: link }),
		).rejects.toThrow("Trò chơi đã hết lượt tham gia");

		// The admitted session remains playable under the full cap.
		const action = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			action: { type: "spin" },
		});
		expect(action.outcome.kind).toBe("reward");
	});

	test("start keys recover a lost first response instead of duplicating sessions", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Start key owner",
			slug: "start-key-campaign",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});

		const startKey = "b".repeat(32);
		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
			startKey,
		});
		const retry = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
			startKey,
		});
		expect(retry.sessionId).toEqual(first.sessionId);
		expect(retry.sessionToken).toEqual(first.sessionToken);
		expect(retry.resumed).toBe(true);

		const sessions = await t.run(async (ctx) => ctx.db.query("playSessions").collect());
		expect(sessions).toHaveLength(1);
		expect(sessions[0].startKey).toBe(startKey);

		// Malformed keys and tokens fail closed instead of being stored.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
				startKey: "not-hex",
			}),
		).rejects.toThrow("Start key không hợp lệ");
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
				participantToken: "",
			}),
		).rejects.toThrow("Token người tham gia không hợp lệ");
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
				participantToken: "not a valid token!!",
			}),
		).rejects.toThrow("Token người tham gia không hợp lệ");
	});

	test("capabilities recover outcomes and claim details across refreshes", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Recovery owner",
			slug: "recovery-campaign",
			inventory: [
				{ name: "Voucher", rewardType: "voucher", secretCode: "RECOVER-CODE", quantity: 5, weight: 100 },
			],
		});

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const capability = {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		};

		// Refresh before action: no outcome yet.
		await expect(t.query(api.publicPlay.getPublicSessionOutcome, capability)).resolves.toBeNull();
		await expect(t.query(api.publicPlay.getPublicClaimDetail, capability)).resolves.toBeNull();

		const result = await t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "spin" },
		});
		expect(result.outcome.kind).toBe("reward");
		expect(result.outcome.segmentKey).not.toBeNull();

		// Refresh after award, before claim.
		await expect(t.query(api.publicPlay.getPublicSessionOutcome, capability)).resolves.toMatchObject({
			outcome: { kind: "reward", canClaim: true },
		});
		// Leaving without claiming is legal; no claim detail exists yet.
		await expect(t.query(api.publicPlay.getPublicClaimDetail, capability)).resolves.toBeNull();

		await t.mutation(api.publicPlay.claimPublicReward, capability);
		// Refresh after claim recovers the original details.
		await expect(t.query(api.publicPlay.getPublicClaimDetail, capability)).resolves.toMatchObject({
			claim: { secretCode: "RECOVER-CODE" },
		});

		// Wrong capabilities recover nothing.
		await expect(
			t.query(api.publicPlay.getPublicSessionOutcome, {
				sessionId: capability.sessionId,
				sessionToken: "wrong-token-wrong-token",
			}),
		).rejects.toThrow("Phiên chơi không hợp lệ");
	});
});

describe("awarded inventory and claims", () => {
	test("inventory edits cannot erase an allocated voucher; claims stay recoverable", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Preserve owner",
			slug: "preserve-campaign",
			inventory: [
				{ name: "Voucher gốc", rewardType: "voucher", secretCode: "ORIGINAL-CODE", quantity: 5, weight: 100 },
			],
		});

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const capability = {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		};
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "spin" },
		});
		expect(result.outcome.rewardType).toBe("voucher");

		// Owner edits are safely rejected while stock has been awarded; the
		// claim then recovers the ORIGINAL details from the award snapshot.
		await expect(
			t.withIdentity({ subject: world.ownerId }).mutation(
				api.rewardInventory.configureRewardInventory,
				{
					campaignId: world.campaignId,
					items: [
						{
							name: "Voucher thay thế",
							rewardType: "voucher",
							secretCode: "REPLACEMENT-CODE",
							quantity: 3,
							weight: 100,
							isActive: true,
						},
					],
				},
			),
		).rejects.toThrow("Kho đã có phần thưởng được trao");

		const claim = await t.mutation(api.publicPlay.claimPublicReward, capability);
		expect(claim.claim.secretCode).toBe("ORIGINAL-CODE");
		const retried = await t.mutation(api.publicPlay.claimPublicReward, capability);
		expect(retried.claim).toEqual(claim.claim);
		expect(retried.alreadyClaimed).toBe(true);

		// Even while the edit is locked, a capability-authorized re-claim
		// recovers the original code from the immutable award snapshot.
		const recovered = await t.query(api.publicPlay.getPublicClaimDetail, capability);
		expect(recovered?.claim.secretCode).toBe("ORIGINAL-CODE");

		const rows = await t.run(async (ctx) => ctx.db.query("rewardInventory").collect());
		expect(rows.some((row) => row.secretCode === "REPLACEMENT-CODE")).toBe(false);
	});

	test("resaving unchanged inventory after an award cannot recreate consumed stock", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Resave owner",
			slug: "resave-campaign",
			inventory: [
				{ name: "Voucher gốc", rewardType: "voucher", secretCode: "KEEP-CODE", quantity: 2, weight: 100 },
			],
		});

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});

		// Re-saving the same original total is not an explicit restock: the
		// unsafe edit is rejected and consumed stock is not silently reset.
		await expect(
			t.withIdentity({ subject: world.ownerId }).mutation(
				api.rewardInventory.configureRewardInventory,
				{
					campaignId: world.campaignId,
					items: [
						{
							name: "Voucher gốc",
							rewardType: "voucher",
							secretCode: "KEEP-CODE",
							quantity: 2,
							weight: 100,
							isActive: true,
						},
					],
				},
			),
		).rejects.toThrow("Kho đã có phần thưởng được trao");

		const remaining = await t.run(async (ctx) => {
			const rows = await ctx.db.query("rewardInventory").collect();
			return rows
				.filter((row) => row.campaignId === world.campaignId && row.isActive)
				.reduce((sum, row) => sum + row.quantityRemaining, 0);
		});
		expect(remaining).toBe(1);
	});

	test("sessions predating admission counters still occupy capacity", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Legacy session owner",
			slug: "legacy-session-campaign",
		});
		await t.run(async (ctx) => {
			const now = Date.now();
			const participantId = await ctx.db.insert("participants", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				token: "historicalparticipantcapability001",
				createdAt: now,
				updatedAt: now,
			});
			const link = await ctx.db
				.query("publicPlayLinks")
				.withIndex("by_shareCode", (q) => q.eq("shareCode", world.shareCode))
				.first();
			if (!link) throw new Error("missing link");
			await ctx.db.insert("playSessions", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: world.wheelGameId,
				participantId,
				shareLinkId: link._id,
				channel: "public-link",
				channelLabel: "fixture",
				sessionToken: "historicalsessioncapability000001",
				status: "active",
				startedAt: now,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.patch(world.wheelGameId, {
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: 1 },
			});
		});

		// The pre-backfill row gates new admissions until accounting is
		// initialized (safe while initialization is incomplete).
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("khởi tạo bộ đếm lượt chơi");
	});
});

describe("public play foundation", () => {
	test("entry resolves open links and fails closed for revoked, malformed, and inactive games", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Entry owner",
			slug: "entry-owner-campaign",
			inventory: [
				{ name: "Voucher trà sữa", rewardType: "voucher", secretCode: "TEA-2026", quantity: 5, weight: 50 },
			],
		});

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		expect(entry).toMatchObject({ state: "open" });
		if (entry.state !== "open") throw new Error("expected open entry");
		expect(entry.game.templateId).toBe("lucky-wheel");
		expect(entry.game.selfServe).toBe(true);
		expect(entry.game.wheel).toMatchObject({
			segments: [{ key: expect.any(String), label: "Voucher trà sữa" }],
		});
		// Public catalog never leaks inventory secrets or stock.
		const entryText = JSON.stringify(entry);
		expect(entryText).not.toContain("TEA-2026");
		expect(entryText).not.toContain("quantityRemaining");

		expect(
			await t.query(api.publicPlay.getPublicShareEntry, { shareCode: "not-a-code" }),
		).toMatchObject({ state: "invalid" });

		await t.run(async (ctx) => {
			await ctx.db.patch(world.shareLinkId, { status: "revoked" });
		});
		expect(
			await t.query(api.publicPlay.getPublicShareEntry, { shareCode: world.shareCode }),
		).toMatchObject({ state: "revoked" });
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("đã bị thu hồi");

		await t.run(async (ctx) => {
			await ctx.db.patch(world.shareLinkId, { status: "active" });
			await ctx.db.patch(world.wheelGameId, { status: "draft" });
		});
		expect(
			await t.query(api.publicPlay.getPublicShareEntry, { shareCode: world.shareCode }),
		).toMatchObject({ state: "closed" });

		await t.run(async (ctx) => {
			await ctx.db.patch(world.wheelGameId, { status: "active" });
			await ctx.db.patch(world.campaignId, { status: "archived" });
		});
		expect(
			await t.query(api.publicPlay.getPublicShareEntry, { shareCode: world.shareCode }),
		).toMatchObject({ state: "closed" });
	});

	test("two independent customers share one reusable link without closing it", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Shared link owner",
			slug: "shared-link-campaign",
			inventory: [
				{ name: "Tiền mặt 50.000đ", rewardType: "cash", amount: 50000, quantity: 10, weight: 100 },
			],
		});

		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const second = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		expect(first.sessionId).not.toEqual(second.sessionId);
		expect(first.sessionToken).not.toEqual(second.sessionToken);
		expect(second.resumed).toBe(false);

		const firstResult = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			action: { type: "spin" },
		});
		expect(firstResult.outcome).toMatchObject({
			kind: "reward",
			rewardType: "cash",
			amount: 50000,
		});

		// The first completed play must not close the reusable link for others.
		const third = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		expect(third.sessionId).not.toEqual(first.sessionId);

		const stock = await t.run(async (ctx) => ctx.db.query("rewardInventory").collect());
		expect(stock).toHaveLength(1);
		expect(stock[0].quantityRemaining).toBe(9);
	});

	test("retries resume the same session and replayed actions never allocate twice", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Retry owner",
			slug: "retry-campaign",
			inventory: [{ name: "Quà tặng", rewardType: "physical", quantity: 3, weight: 100 }],
		});

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const resumed = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
			participantToken: started.participantToken ?? undefined,
		});
		expect(resumed.resumed).toBe(true);
		expect(resumed.sessionId).toEqual(started.sessionId);
		expect(resumed.sessionToken).toEqual(started.sessionToken);

		const firstAction = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		const replayedAction = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(replayedAction).toEqual(firstAction);

		const state = await t.run(async (ctx) => {
			return {
				stock: (await ctx.db.query("rewardInventory").collect()).map((item) => item.quantityRemaining),
				sessions: await ctx.db.query("playSessions").collect(),
				outcomes: await ctx.db.query("rewardOutcomes").collect(),
				events: await ctx.db.query("analyticsCounterEvents").collect(),
			};
		});
		expect(state.stock).toEqual([2]);
		expect(state.sessions).toHaveLength(1);
		expect(state.outcomes).toHaveLength(1);

		// Funnel events recorded exactly once per transition.
		expect(countEvents(state.events, "game_start")).toBe(1);
		expect(countEvents(state.events, "game_completion")).toBe(1);
		expect(countEvents(state.events, "reward_outcome")).toBe(1);
	});

	test("wrong session tokens, foreign tokens, and cross-template actions fail closed", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Capability owner",
			slug: "capability-campaign",
			inventory: [{ name: "Điểm 100", rewardType: "points", amount: 100, quantity: 5, weight: 100 }],
			liXiRewardSource: "campaign-inventory",
		});
		const liXiShareCode = await seedLinkForGame(t, world, world.liXiGameId);

		const wheelSession = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const liXiSession = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: liXiShareCode,
		});

		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: wheelSession.sessionId,
				sessionToken: "wrong-token-wrong-token-wrong",
				action: { type: "spin" },
			}),
		).rejects.toThrow("Phiên chơi không hợp lệ");

		// A token from one session cannot act on another session.
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: liXiSession.sessionId,
				sessionToken: wheelSession.sessionToken,
				action: { type: "reveal-envelope", envelopeIndex: 0 },
			}),
		).rejects.toThrow("Phiên chơi không hợp lệ");

		// Envelope actions are li-xi only; spin actions are wheel-only.
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: wheelSession.sessionId,
				sessionToken: wheelSession.sessionToken,
				action: { type: "reveal-envelope", envelopeIndex: 0 },
			}),
		).rejects.toThrow("Hành động không hợp lệ cho vòng quay may mắn");
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: liXiSession.sessionId,
				sessionToken: liXiSession.sessionToken,
				action: { type: "spin" },
			}),
		).rejects.toThrow("Hành động không hợp lệ cho trò chơi này");
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: liXiSession.sessionId,
				sessionToken: liXiSession.sessionToken,
				action: { type: "reveal-envelope", envelopeIndex: 42 },
			}),
		).rejects.toThrow("Phong bao không hợp lệ");

		// The li-xi generic flow awards from the shared inventory.
		const liXiResult = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: liXiSession.sessionId,
			sessionToken: liXiSession.sessionToken,
			action: { type: "reveal-envelope", envelopeIndex: 3 },
		});
		expect(liXiResult.outcome).toMatchObject({ kind: "reward", rewardType: "points" });
	});

	test("budget-sourced li xi games are blocked from the self-serve flow", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Budget li-xi owner",
			slug: "budget-lixi-campaign",
		});
		const liXiShareCode = await seedLinkForGame(t, world, world.liXiGameId);

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: liXiShareCode,
		});
		if (entry.state !== "open") throw new Error("expected open entry");
		expect(entry.game.selfServe).toBe(false);
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: liXiShareCode }),
		).rejects.toThrow("không hỗ trợ chơi tự phục vụ");
	});

	test("overlapping last-unit completions allocate exactly once and the loser gets an explicit exhausted outcome", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Last unit owner",
			slug: "last-unit-campaign",
			inventory: [{ name: "Giải độc đắc", rewardType: "physical", quantity: 1, weight: 100 }],
		});

		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const second = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});

		// Overlapping calls. convex-test serializes writes locally, so this is
		// replay/exhaustion evidence under local concurrency, not proof of
		// remote load behavior.
		const [firstResult, secondResult] = await Promise.all([
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: first.sessionId,
				sessionToken: first.sessionToken,
				action: { type: "spin" },
			}),
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: second.sessionId,
				sessionToken: second.sessionToken,
				action: { type: "spin" },
			}),
		]);

		const winners = [firstResult, secondResult].filter(
			(result) => result.outcome.kind === "reward",
		);
		expect(winners).toHaveLength(1);
		const loser = firstResult.outcome.kind === "no-reward" ? firstResult : secondResult;
		expect(loser.outcome.kind).toBe("no-reward");
		expect(loser.outcome.label).toContain("Phần thưởng đã hết");
		expect(loser.outcome.canClaim).toBe(false);

		const state = await t.run(async (ctx) => {
			return {
				stock: (await ctx.db.query("rewardInventory").collect()).map((item) => item.quantityRemaining),
				outcomes: await ctx.db.query("rewardOutcomes").collect(),
				events: await ctx.db.query("analyticsCounterEvents").collect(),
			};
		});
		expect(state.stock).toEqual([0]);
		expect(state.outcomes).toHaveLength(2);
		expect(state.outcomes.filter((outcome) => outcome.rewardType === "none")).toHaveLength(1);
		expect(countEvents(state.events, "game_completion")).toBe(2);
		expect(countEvents(state.events, "reward_outcome")).toBe(1);
	});

	test("overlapping duplicate starts with one token resume into a single session", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Overlap start owner",
			slug: "overlap-start-campaign",
		});

		const initial = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		// Two overlapping duplicate starts with the same participant token.
		const [first, second] = await Promise.all([
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
				participantToken: initial.participantToken ?? undefined,
			}),
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
				participantToken: initial.participantToken ?? undefined,
			}),
		]);
		expect(first.sessionId).toBe(initial.sessionId);
		expect(second.sessionId).toBe(initial.sessionId);
		const sessions = await t.run(async (ctx) => ctx.db.query("playSessions").collect());
		expect(sessions).toHaveLength(1);
	});

	test("overlapping admission at cap=1 admits exactly one unrelated participant", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Admission owner",
			slug: "admission-campaign",
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(world.wheelGameId, {
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: 1 },
			});
		});

		const attempts = await Promise.allSettled([
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		]);
		const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
		const rejected = attempts.filter((attempt) => attempt.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
	});

	test("per-participant limits block replays while fresh participants keep playing", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Limit owner",
			slug: "limit-campaign",
			inventory: [
				{ name: "Voucher", rewardType: "voucher", secretCode: "LM-777", quantity: 10, weight: 100 },
			],
		});

		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			action: { type: "spin" },
		});

		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
				participantToken: first.participantToken ?? undefined,
			}),
		).rejects.toThrow("Bạn đã hết lượt tham gia trò chơi này");

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
			participantToken: first.participantToken ?? undefined,
		});
		expect(entry).toMatchObject({ state: "open", viewer: { canPlay: false, reason: "limit" } });

		// A different device (no token) still gets a fresh eligible session.
		const next = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		expect(next.sessionId).not.toEqual(first.sessionId);
	});

	test("voucher secrets stay private until the claim transition and claims are idempotent", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Claim owner",
			slug: "claim-campaign",
			inventory: [
				{ name: "Voucher 100k", rewardType: "voucher", secretCode: "SECRET-100K", quantity: 5, weight: 100 },
			],
		});

		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome).toMatchObject({ kind: "reward", rewardType: "voucher" });
		expect(JSON.stringify(result)).not.toContain("SECRET-100K");

		const claim = await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});
		expect(claim.claim.secretCode).toBe("SECRET-100K");
		expect(claim.alreadyClaimed).toBe(false);

		const replayedClaim = await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});
		expect(replayedClaim.claim).toEqual(claim.claim);
		expect(replayedClaim.alreadyClaimed).toBe(true);

		// A wrong token cannot claim someone else's reward.
		const other = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await expect(
			t.mutation(api.publicPlay.claimPublicReward, {
				sessionId: session.sessionId,
				sessionToken: other.sessionToken,
			}),
		).rejects.toThrow("Phiên chơi không hợp lệ");

		const state = await t.run(async (ctx) => {
			return {
				claims: await ctx.db.query("rewardClaims").collect(),
				outcomes: await ctx.db.query("rewardOutcomes").collect(),
				events: await ctx.db.query("analyticsCounterEvents").collect(),
			};
		});
		expect(state.claims).toHaveLength(1);
		expect(state.claims[0]).toMatchObject({ channel: "public-link", fulfilmentState: "pending" });
		expect(state.outcomes[0].status).toBe("claimed");
		expect(countEvents(state.events, "reward_claim")).toBe(1);
	});

	test("no-reward claims are rejected and duplicate opens stay idempotent", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "No reward owner",
			slug: "no-reward-campaign",
			inventory: [],
		});

		const openKey = "openevent0001";
		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome.kind).toBe("no-reward");
		expect(result.outcome.label).toContain("Phần thưởng đã hết");

		await expect(
			t.mutation(api.publicPlay.claimPublicReward, {
				sessionId: session.sessionId,
				sessionToken: session.sessionToken,
			}),
		).rejects.toThrow("không có phần thưởng");

		await expect(
			t.mutation(api.publicPlay.recordShareEntryOpen, { shareCode: world.shareCode, openKey }),
		).resolves.toMatchObject({ recorded: true });
		await expect(
			t.mutation(api.publicPlay.recordShareEntryOpen, { shareCode: world.shareCode, openKey }),
		).resolves.toMatchObject({ recorded: true });

		const events = await t.run(async (ctx) => ctx.db.query("analyticsCounterEvents").collect());
		expect(countEvents(events, "public_play_link_open")).toBe(1);
		expect(countEvents(events, "game_open")).toBe(1);
		expect(countEvents(events, "game_start")).toBe(1);
		expect(countEvents(events, "game_completion")).toBe(1);
		expect(countEvents(events, "reward_outcome")).toBe(0);
	});

	test("funnel events keep campaign-game and channel/link attribution", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Attribution owner",
			slug: "attribution-campaign",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});

		await t.mutation(api.publicPlay.recordShareEntryOpen, {
			shareCode: world.shareCode,
			openKey: "attribution01",
		});
		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});

		const events = await t.run(async (ctx) => ctx.db.query("analyticsCounterEvents").collect());
		const genericMetrics = [
			"game_open",
			"public_play_link_open",
			"game_start",
			"game_completion",
			"reward_outcome",
			"reward_claim",
		];
		const genericEvents = events.filter((event) => genericMetrics.includes(event.metric));
		expect(genericEvents.length).toBeGreaterThan(0);
		for (const event of genericEvents) {
			expect(event.campaignGameId).toBe(world.wheelGameId);
			expect(event.channel).toBe("public-link");
			expect(event.shareLinkId).toBe(world.shareLinkId);
			expect(event.channelLabel).toBe("qr");
			expect(JSON.stringify(event)).not.toContain("secretCode");
		}
	});

	test("independent games keep their own config, name, status, and reward pool", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Isolation owner",
			slug: "isolation-campaign",
			inventory: [{ name: "Quà chung", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });

		const wheelContext = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
			campaignGameId: world.wheelGameId,
		});
		if (!wheelContext) throw new Error("expected wheel context");
		expect(configTemplateId(wheelContext.campaignGame.config)).toBe("lucky-wheel");
		expect(configRewardSource(wheelContext.campaignGame.config)).toBe("campaign-inventory");

		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({
				noRewardWeight: 40,
				publicCopy: { headline: "Quay phát cuối năm" },
			}),
			name: "Vòng quay Tết",
			status: "active",
		});

		const afterUpdate = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
			campaignGameId: world.liXiGameId,
		});
		if (!afterUpdate) throw new Error("expected li-xi context");
		expect(configRewardSource(afterUpdate.campaignGame.config)).toBe("campaign-budget");
		expect(afterUpdate.campaignGame.name).toBe("Lunar Fortune");
		const wheelAfter = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
			campaignGameId: world.wheelGameId,
		});
		if (!wheelAfter) throw new Error("expected wheel context after update");
		expect(wheelAfter.campaignGame.name).toBe("Vòng quay Tết");
		expect(configTemplateId(wheelAfter.campaignGame.config)).toBe("lucky-wheel");
		expect(configNoRewardWeight(wheelAfter.campaignGame.config)).toBe(40);

		// Cross-owner access fails closed.
		const foreignOwner = await t.run(async (ctx) => {
			return ctx.db.insert("users", { name: "Foreign owner" });
		});
		const asForeign = t.withIdentity({ subject: foreignOwner });
		await expect(
			asForeign.mutation(api.campaignGames.updateCampaignGame, {
				campaignGameId: world.wheelGameId,
				config: buildLuckyWheelGameConfig(),
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");
		await expect(
			asForeign.mutation(api.rewardInventory.configureRewardInventory, {
				campaignId: world.campaignId,
				items: [
					{ name: "Hack", rewardType: "cash", amount: 1, quantity: 1, weight: 1, isActive: true },
				],
			}),
		).rejects.toThrow("Không tìm thấy chiến dịch");
		await expect(
			asForeign.mutation(api.shareLinks.revokeShareLink, {
				shareLinkId: world.shareLinkId,
			}),
		).rejects.toThrow("Không tìm thấy liên kết");
	});

	test("games draw from their configured reward pool tag", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Pool owner",
			slug: "pool-campaign",
		});
		await t.run(async (ctx) => {
			const now = Date.now();
			for (const item of [
				{ name: "Quà pool A", poolTag: "pool-a" },
				{ name: "Quà pool B", poolTag: "pool-b" },
			]) {
				await ctx.db.insert("rewardInventory", {
					ownerId: world.ownerId,
					campaignId: world.campaignId,
					name: item.name,
					rewardType: "physical",
					quantityTotal: 5,
					quantityRemaining: 5,
					weight: 100,
					isActive: true,
					displayOrder: 0,
					poolTag: item.poolTag,
					createdAt: now,
					updatedAt: now,
				});
			}
			const game = await ctx.db.get(world.wheelGameId);
			if (!game) throw new Error("missing game");
			await ctx.db.patch(game._id, {
				config: buildLuckyWheelGameConfig({ rewardPoolTag: "pool-a", noRewardWeight: 0 }),
			});
		});

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		if (entry.state !== "open") throw new Error("expected open entry");
		expect(entry.game.wheel?.segments.map((segment) => segment.label)).toEqual(["Quà pool A"]);

		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome.label).toBe("Quà pool A");
	});

	test("campaigns stay independently active and the preferred default pointer changes nothing else", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		// Lift the free-tier campaign cap so two campaigns can coexist in this
		// entitlement-focused scenario.
		const previousDefaultPlan = process.env.LI_XI_DEFAULT_PLAN;
		const previousPaidFallback = process.env.LI_XI_ENABLE_PAID_PLAN_FALLBACK;
		process.env.LI_XI_DEFAULT_PLAN = "business";
		process.env.LI_XI_ENABLE_PAID_PLAN_FALLBACK = "true";
		try {
			const world = await seedCampaignGameWorld(t, {
				ownerName: "Multi owner",
				slug: "multi-owner-campaign",
			});
			const asOwner = t.withIdentity({ subject: world.ownerId });

			const secondCampaign = await asOwner.mutation(api.campaigns.saveCampaign, {
				name: "Chiến dịch thứ hai",
				status: "active",
				theme: "brand",
				gameTemplateId: "lucky-wheel",
				gameConfig: luckyWheelInitialCampaignGameConfig,
			});

			const campaigns = await t.run(async (ctx) => {
				return ctx.db
					.query("campaigns")
					.withIndex("by_owner_status", (q) =>
						q.eq("ownerId", world.ownerId).eq("status", "active"),
					)
					.collect();
			});
			const activeIds = campaigns.map((campaign) => campaign._id).sort();
			expect(activeIds).toEqual([world.campaignId, secondCampaign.campaignId].sort());

			// Deactivating the second campaign keeps the first untouched.
			await asOwner.mutation(api.campaigns.saveCampaign, {
				campaignId: secondCampaign.campaignId,
				name: "Chiến dịch thứ hai",
				status: "draft",
				theme: "brand",
				gameTemplateId: "lucky-wheel",
				gameConfig: luckyWheelInitialCampaignGameConfig,
			});
			const after = await t.run(async (ctx) => {
				return ctx.db
					.query("campaigns")
					.withIndex("by_owner_status", (q) =>
						q.eq("ownerId", world.ownerId).eq("status", "active"),
					)
					.collect();
			});
			expect(after.map((campaign) => campaign._id)).toEqual([world.campaignId]);
		} finally {
			if (previousDefaultPlan === undefined) {
				delete process.env.LI_XI_DEFAULT_PLAN;
			} else {
				process.env.LI_XI_DEFAULT_PLAN = previousDefaultPlan;
			}
			if (previousPaidFallback === undefined) {
				delete process.env.LI_XI_ENABLE_PAID_PLAN_FALLBACK;
			} else {
				process.env.LI_XI_ENABLE_PAID_PLAN_FALLBACK = previousPaidFallback;
			}
		}
	});
});


describe("accounting initialization and backfill", () => {
	async function seedHistoricalSessions(
		t: { run: (callback: (ctx: QueryCtx & MutationCtx) => Promise<unknown>) => Promise<unknown> },
		world: SeededCampaign,
		count: number,
		status: "active" | "completed" = "active",
	): Promise<void> {
		await t.run(async (ctx) => {
			const now = Date.now();
			const link = await ctx.db
				.query("publicPlayLinks")
				.withIndex("by_shareCode", (q) => q.eq("shareCode", world.shareCode))
				.first();
			if (!link) throw new Error("missing link");
			for (let index = 0; index < count; index += 1) {
				const participantId = await ctx.db.insert("participants", {
					ownerId: world.ownerId,
					campaignId: world.campaignId,
					token: `historical${world.shareCode}${index}${status}`.slice(0, 40),
					createdAt: now,
					updatedAt: now,
				});
				await ctx.db.insert("playSessions", {
					ownerId: world.ownerId,
					campaignId: world.campaignId,
					campaignGameId: world.wheelGameId,
					participantId,
					shareLinkId: link._id,
					channel: "public-link",
					channelLabel: "fixture",
					sessionToken: `historicaltoken${index}${status}${world.shareCode.slice(0, 8)}`,
					status,
					startedAt: now + index,
					createdAt: now + index,
					updatedAt: now,
				});
			}
		});
	}

	test("cap 501 with 501 historical sessions gates admission until backfill, then enforces the cap", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Large cap owner",
			slug: "large-cap-campaign",
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(world.wheelGameId, {
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: 501 },
			});
		});
		await seedHistoricalSessions(t, world, 501);

		// Uninitialized accounting with history: safe gate, no over-admission.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("khởi tạo bộ đếm lượt chơi");
		const entryGated = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		expect(entryGated).toMatchObject({ state: "open", availability: { soldOut: true } });

		// Server-owned traversal: twenty-one bounded pages of 25 (twenty full
		// pages plus the 1-row tail), then the empty completed bucket stamps
		// readiness automatically — no client finalize.
		const asOwner = t.withIdentity({ subject: world.ownerId });
		let totalBackfilled = 0;
		for (let page = 0; page < 21; page += 1) {
			const result = await asOwner.mutation(
				internal.playMaintenance.backfillGameAccountingPage,
				{
					campaignGameId: world.wheelGameId,
					status: "active",
					limit: 25,
				},
			);
			expect(result.alreadyReady).toBe(false);
			totalBackfilled += result.backfilled ?? 0;
			if (page < 20) {
				expect(result.complete).toBe(false);
			}
		}
		expect(totalBackfilled).toBe(501);
		await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "completed",
			limit: 25,
		});

		// Accounting exact: 501 admitted sessions fill the 501 cap.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("Trò chơi đã hết lượt tham gia");

		const game = await t.run(async (ctx) => ctx.db.get(world.wheelGameId));
		expect(game?.accountingVersion).toBe(1);
	});

	test("backfill progress persists across invocations and replays never double count", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Replay backfill owner",
			slug: "replay-backfill-campaign",
		});
		await seedHistoricalSessions(t, world, 5);
		const asOwner = t.withIdentity({ subject: world.ownerId });

		const page1 = await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "active",
			limit: 2,
		});
		expect(page1.backfilled).toBe(2);
		expect(page1.complete).toBe(false);

		// Server-owned progress persisted between invocations.
		const marker = await t.run(async (ctx) => {
			return ctx.db
				.query("analyticsCounterEvents")
				.withIndex("by_eventKey", (q) =>
					q.eq("eventKey", `play-backfill:${world.wheelGameId}:active`),
				)
				.unique();
		});
		expect(marker).not.toBeNull();

		const page2 = await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "active",
			limit: 2,
		});
		expect(page2.backfilled).toBe(2);
		const page3 = await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "active",
			limit: 2,
		});
		expect(page3.backfilled ?? 0).toBe(1);
		expect(page3.complete).toBe(true);
		// Draining the sibling bucket completes readiness; post-completion
		// invocations are already-ready no-ops.
		await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "completed",
			limit: 2,
		});
		const page4 = await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "active",
			limit: 2,
		});
		expect(page4.alreadyReady).toBe(true);

		// New admissions after initialization are counted alongside history.
		await t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode });
		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		expect(entry).toMatchObject({ state: "open", availability: { soldOut: false } });

		const counted = await t.run(async (ctx) => {
			const { countGameSessionsExact } = await import("./analytics");
			return countGameSessionsExact(ctx, world.wheelGameId);
		});
		expect(counted).toBe(6);

		// Foreign-owner isolation on the backfill mutation.
		const foreignOwner = await t.run(async (ctx) => {
			return ctx.db.insert("users", { name: "Backfill foreign owner" });
		});
		await expect(
			t.withIdentity({ subject: foreignOwner }).mutation(
				internal.playMaintenance.backfillGameAccountingPage,
				{
					campaignGameId: world.wheelGameId,
					status: "active",
				},
			),
		).rejects.toThrow("Chỉ chủ trò chơi");
	});

	test("an active historical session completing between pages is still accounted", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Transition owner",
			slug: "transition-campaign",
		});
		await seedHistoricalSessions(t, world, 2, "active");
		const asOwner = t.withIdentity({ subject: world.ownerId });

		const page1 = await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "active",
			limit: 1,
		});
		expect(page1.backfilled ?? 0).toBe(1);

		// The not-yet-scanned historical session completes between pages: it
		// moves into the completed bucket, which the traversal drains next.
		await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("playSessions")
				.withIndex("by_campaignGame_status", (q) =>
					q.eq("campaignGameId", world.wheelGameId).eq("status", "active"),
				)
				.collect();
			for (const row of rows) {
				await ctx.db.patch(row._id, { status: "completed" });
			}
		});

		// Drain the completed bucket (A dedupes, B is new), then drain the
		// emptied active bucket — every row accounted exactly once.
		await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "completed",
			limit: 1,
		});
		await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "completed",
			limit: 1,
		});
		await asOwner.mutation(internal.playMaintenance.backfillGameAccountingPage, {
			campaignGameId: world.wheelGameId,
			status: "active",
			limit: 1,
		});

		const counted = await t.run(async (ctx) => {
			const { countGameSessionsExact } = await import("./analytics");
			return countGameSessionsExact(ctx, world.wheelGameId);
		});
		expect(counted).toBe(2);
	});

	test("empty games initialize accounting inline and keep enforcing caps", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Empty init owner",
			slug: "empty-init-campaign",
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(world.wheelGameId, {
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: 2 },
			});
		});

		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		void first;
		const game = await t.run(async (ctx) => ctx.db.get(world.wheelGameId));
		expect(game?.accountingVersion).toBe(1);

		await t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode });
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("Trò chơi đã hết lượt tham gia");
	});
});

	test("an empty game is publicly available before its first accounting initialization", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Empty entry owner",
			slug: "empty-entry-campaign",
		});
		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		expect(entry).toMatchObject({ state: "open", availability: { soldOut: false } });
	});

	test("an engagement completion does not force maintenance before the first rewarded completion", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Engagement first owner",
			slug: "engagement-first-campaign",
			inventory: [
				{ name: "Voucher sau engagement", rewardType: "voucher", secretCode: "EF-1", quantity: 5, weight: 100 },
			],
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({
				rewardMode: "engagement",
				noRewardLabel: "Cảm ơn Synthetic!",
				noRewardWeight: 0,
			}),
			status: "active",
		});
		const engaged = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: engaged.sessionId,
			sessionToken: engaged.sessionToken,
			action: { type: "spin" },
		});
		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({ rewardMode: "rewarded", noRewardWeight: 0 }),
			status: "active",
		});
		const rewarded = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: rewarded.sessionId,
				sessionToken: rewarded.sessionToken,
				action: { type: "spin" },
			}),
		).resolves.toMatchObject({ outcome: { rewardType: "voucher", canClaim: true } });
		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.usage.redemptions).toBe(1);
	});

describe("reward accounting initialization", () => {
	async function seedLegacyGenericOutcome(
		t: { run: (callback: (ctx: QueryCtx & MutationCtx) => Promise<unknown>) => Promise<unknown> },
		world: SeededCampaign,
	): Promise<void> {
		await t.run(async (ctx) => {
			const now = Date.now();
			const link = await ctx.db
				.query("publicPlayLinks")
				.withIndex("by_shareCode", (q) => q.eq("shareCode", world.shareCode))
				.first();
			if (!link) throw new Error("missing link");
			const participantId = await ctx.db.insert("participants", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				token: `legacyreward${world.shareCode}`.slice(0, 40),
				createdAt: now,
				updatedAt: now,
			});
			const sessionId = await ctx.db.insert("playSessions", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: world.wheelGameId,
				participantId,
				shareLinkId: link._id,
				channel: "public-link",
				status: "completed",
				sessionToken: "legacyrewardsessiontoken0001",
				startedAt: now,
				completedAt: now,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("rewardOutcomes", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: world.wheelGameId,
				playSessionId: sessionId,
				rewardType: "cash",
				label: "Legacy cash",
				amount: 25000,
				status: "claimed",
				grantedAt: now,
				claimedAt: now,
			});
			// The seeded game stays un-initialized: reward readiness derives
			// from its bounded backfill, which also carries this outcome into
			// the owner reward aggregate.
		});
	}

	/** Drives the owner reward traversal to completion (server-owned phases). */
	async function runOwnerRewardTraversal(
		asOwner: {
			mutation: (
				ref: typeof internal.playMaintenance.backfillRewardAccountingPage,
				args: { limit: number },
			) => Promise<{ complete: boolean; stamped: boolean; alreadyReady?: boolean }>;
		},
	): Promise<{ complete: boolean; stamped: boolean }> {
		let last: { complete: boolean; stamped: boolean } | null = null;
		for (let page = 0; page < 100; page += 1) {
			last = await asOwner.mutation(
				internal.playMaintenance.backfillRewardAccountingPage,
				{ limit: 25 },
			);
			if (last.complete) {
				return last;
			}
		}
		throw new Error("owner reward traversal did not finish");
	}

	/** Seeds one raw historical reward outcome that no aggregate holds yet. */
	async function seedRawRewardOutcome(
		t: { run: (callback: (ctx: QueryCtx & MutationCtx) => Promise<unknown>) => Promise<unknown> },
		world: SeededCampaign,
		options: {
			campaignGameId: Id<"campaignGames">;
			rewardType: "cash" | "voucher" | "physical" | "points";
			label: string;
			suffix: string;
			amount?: number;
		},
	): Promise<void> {
		await t.run(async (ctx) => {
			const now = Date.now();
			const participantId = await ctx.db.insert("participants", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				token: `rawreward${options.suffix}`.slice(0, 40),
				createdAt: now,
				updatedAt: now,
			});
			const sessionId = await ctx.db.insert("playSessions", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: options.campaignGameId,
				participantId,
				channel: "public-link",
				status: "completed",
				sessionToken: `rawrewardsession${options.suffix}${"0".repeat(8)}`,
				startedAt: now,
				completedAt: now,
				createdAt: now,
				updatedAt: now,
			});
			const outcomeId = await ctx.db.insert("rewardOutcomes", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: options.campaignGameId,
				playSessionId: sessionId,
				rewardType: options.rewardType,
				label: options.label,
				amount: options.amount,
				status: "granted",
				grantedAt: now,
			});
			await ctx.db.patch(sessionId, { outcomeId });
		});
	}

	test("one legacy + one generic award gives combined usage 3 with each count/sum exact", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Combined quota owner",
			slug: "combined-quota-campaign",
			inventory: [
				{ name: "Voucher combo", rewardType: "voucher", secretCode: "CB-1", quantity: 5, weight: 100 },
			],
		});
		await seedLegacyGenericOutcome(t, world);
		const asOwner = t.withIdentity({ subject: world.ownerId });

		// One legacy draw-era redemption (aggregate-backed usage).
		await t.run(async (ctx) => {
			const { redemptionsByOwnerAmount } = await import("./analytics");
			const now = Date.now();
			const budgetItemId = await ctx.db.insert("budgetItems", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				amount: 10000,
				rarity: "common",
				initialQuantity: 1,
				remainingQuantity: 1,
				displayOrder: 0,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			});
			const drawSessionId = await ctx.db.insert("drawSessions", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				guestNameDisplay: "Legacy draw",
				guestNameNormalized: "legacy draw",
				status: "redeemed",
				createdAt: now,
			});
			const redemptionId = await ctx.db.insert("redemptions", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				drawSessionId,
				guestNameDisplay: "Legacy draw",
				guestNameNormalized: "legacy draw",
				amount: 10000,
				rarity: "common",
				budgetItemId,
				envelopeIndex: 0,
				createdAt: now,
			});
			const redemption = await ctx.db.get(redemptionId);
			if (redemption) {
				await redemptionsByOwnerAmount.insert(ctx, redemption);
			}
		});

		// Backfill the game accounting: this carries the legacy rewarded
		// outcome into the owner aggregate but must NOT certify owner-wide
		// reward history — sibling games could hold uncounted rewards.
		await runGameBackfillToReady(asOwner, world.wheelGameId);
		const preStarted = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: preStarted.sessionId,
				sessionToken: preStarted.sessionToken,
				action: { type: "spin" },
			}),
		).rejects.toThrow("khởi tạo số liệu thưởng");

		// The owner reward traversal proves the real history and stamps
		// readiness; the game-carried outcome dedupes to exactly one entry.
		const traversed = await runOwnerRewardTraversal(asOwner);
		expect(traversed.complete).toBe(true);
		expect(traversed.stamped).toBe(true);

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		});

		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		// 1 legacy redemption + 2 rewarded generic outcomes (1 backfilled
		// historical + 1 new award) = 3 combined usage.
		expect(plan.usage.redemptions).toBe(3);
		expect(plan.rewardAccountingReady).toBe(true);
		const aggregates = await t.run(async (ctx) => {
			const { redemptionsByOwnerAmount, rewardedOutcomesByOwner } = await import("./analytics");
			return {
				legacyCount: await redemptionsByOwnerAmount.count(ctx, { namespace: world.ownerId }),
				legacySum: await redemptionsByOwnerAmount.sum(ctx, { namespace: world.ownerId }),
				genericCount: await rewardedOutcomesByOwner.count(ctx, {
					namespace: `rewarded:${world.ownerId}`,
				}),
				genericSum: await rewardedOutcomesByOwner.sum(ctx, {
					namespace: `rewarded:${world.ownerId}`,
				}),
			};
		});
		expect(aggregates.legacyCount).toBe(1);
		expect(aggregates.legacySum).toBe(10000);
		expect(aggregates.genericCount).toBe(2);
		// The backfilled legacy generic outcome carries the only numeric amount;
		// the new voucher award has none.
		expect(aggregates.genericSum).toBe(25000);
	});

	test("owners with legacy rewarded outcomes are gated until their game backfills; the carried outcome counts once", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Gate quota owner",
			slug: "gate-quota-campaign",
			inventory: [
				{ name: "Voucher gated", rewardType: "voucher", secretCode: "G-1", quantity: 5, weight: 100 },
			],
		});
		await seedLegacyGenericOutcome(t, world);

		// The legacy-outcome game is admission-gated until its backfill runs.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("khởi tạo bộ đếm lượt chơi");

		const asOwner = t.withIdentity({ subject: world.ownerId });
		await runGameBackfillToReady(asOwner, world.wheelGameId);
		// Replayed game backfill invocations are idempotent (already ready).
		await runGameBackfillToReady(asOwner, world.wheelGameId);

		// Game readiness alone must not open reward allocation: the owner-wide
		// history is still unproven, so the first award stays gated.
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const capability = {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		};
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				...capability,
				action: { type: "spin" },
			}),
		).rejects.toThrow("khởi tạo số liệu thưởng");

		// The owner reward traversal proves the real history and stamps
		// readiness; replaying it stays idempotent.
		const traversed = await runOwnerRewardTraversal(asOwner);
		expect(traversed.complete).toBe(true);
		expect(traversed.stamped).toBe(true);
		const replayed = await asOwner.mutation(
			internal.playMaintenance.backfillRewardAccountingPage,
			{ limit: 25 },
		);
		expect(replayed.alreadyReady).toBe(true);
		expect(replayed.stamped).toBe(false);

		// After the traversal completes, the carried legacy outcome counts
		// toward shared usage exactly once.
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "spin" },
		});
		expect(result.outcome.kind).toBe("reward");
		await t.mutation(api.publicPlay.claimPublicReward, capability);

		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.usage.redemptions).toBe(2);
		expect(plan.rewardAccountingReady).toBe(true);
	});

	test("backfilling an empty game cannot certify sibling-game reward history", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Sibling reward owner",
			slug: "sibling-reward-campaign",
			inventory: [
				{ name: "Voucher sibling", rewardType: "voucher", secretCode: "SB-1", quantity: 5, weight: 100 },
			],
		});
		// A sibling game carries historical rewarded outcomes; the shared
		// wheel game itself holds none.
		const siblingGameId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("campaignGames", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				templateId: "lucky-wheel",
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
				name: "Vòng quay lịch sử",
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
				status: "active",
				createdAt: now,
				updatedAt: now,
			});
		});
		await seedRawRewardOutcome(t, world, {
			campaignGameId: siblingGameId,
			rewardType: "voucher",
			label: "Sibling award one",
			suffix: "sibone",
		});
		await seedRawRewardOutcome(t, world, {
			campaignGameId: siblingGameId,
			rewardType: "voucher",
			label: "Sibling award two",
			suffix: "sibtwo",
		});

		// Backfilling the EMPTY shared game readies only that game.
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await runGameBackfillToReady(asOwner, world.wheelGameId);
		const planAfterGame = await asOwner.query(api.entitlements.getPlanState, {});
		expect(planAfterGame.rewardAccountingReady).toBe(false);

		// Allocation stays gated: game readiness never certifies owner history.
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await expect(
			t.mutation(api.publicPlay.playSessionAction, {
				sessionId: started.sessionId,
				sessionToken: started.sessionToken,
				action: { type: "spin" },
			}),
		).rejects.toThrow("khởi tạo số liệu thưởng");
		const gatedPlan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(gatedPlan.usage.redemptions).toBe(0);

		// The owner traversal proves the sibling history exactly once.
		const traversed = await runOwnerRewardTraversal(asOwner);
		expect(traversed.complete).toBe(true);
		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.rewardAccountingReady).toBe(true);
		expect(plan.usage.redemptions).toBe(2);

		// The previously gated session can now complete its award.
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome.kind).toBe("reward");
		const finalPlan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(finalPlan.usage.redemptions).toBe(3);
	});

	test("reward dry-run previews read-only and its cursor cannot publish readiness", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Dry-run reward owner",
			slug: "dry-run-reward-campaign",
		});
		await seedRawRewardOutcome(t, world, {
			campaignGameId: world.wheelGameId,
			rewardType: "cash",
			label: "Preview award",
			suffix: "preview",
			amount: 25000,
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });

		// A preview that would complete the whole traversal still writes
		// nothing: no stamp, no state, no aggregate entries.
		const completingPreview = await asOwner.mutation(
			internal.playMaintenance.backfillRewardAccountingPage,
			{ limit: 25, dryRun: true },
		);
		expect(completingPreview.complete).toBe(true);
		expect(completingPreview.stamped).toBe(false);
		let state = await t.run(async (ctx) =>
			ctx.db
				.query("accountingStates")
				.withIndex("by_owner", (q) => q.eq("ownerId", world.ownerId))
				.first(),
		);
		expect(state).toBeNull();
		let aggregateCount = await t.run(async (ctx) => {
			const { rewardedOutcomesByOwner } = await import("./analytics");
			return rewardedOutcomesByOwner.count(ctx, { namespace: `rewarded:${world.ownerId}` });
		});
		expect(aggregateCount).toBe(0);

		// A smaller page stops the preview mid-traversal and returns a cursor.
		await seedRawRewardOutcome(t, world, {
			campaignGameId: world.wheelGameId,
			rewardType: "cash",
			label: "Preview award two",
			suffix: "previewtwo",
			amount: 1000,
		});
		const preview = await asOwner.mutation(
			internal.playMaintenance.backfillRewardAccountingPage,
			{ limit: 1, dryRun: true },
		);
		expect(preview.complete).toBe(false);
		expect(preview.continueCursor).toBeTruthy();
		expect(preview.stamped).toBe(false);
		state = await t.run(async (ctx) =>
			ctx.db
				.query("accountingStates")
				.withIndex("by_owner", (q) => q.eq("ownerId", world.ownerId))
				.first(),
		);
		expect(state).toBeNull();
		aggregateCount = await t.run(async (ctx) => {
			const { rewardedOutcomesByOwner } = await import("./analytics");
			return rewardedOutcomesByOwner.count(ctx, { namespace: `rewarded:${world.ownerId}` });
		});
		expect(aggregateCount).toBe(0);

		// A cursor from the read-only preview proves nothing was applied.
		await expect(
			asOwner.mutation(internal.playMaintenance.backfillRewardAccountingPage, {
				limit: 1,
				cursor: preview.continueCursor ?? "",
				finalize: true,
			}),
		).rejects.toThrow("chưa được bắt đầu");

		// The owner stays gated after the rejected shortcut.
		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.rewardAccountingReady).toBe(false);
	}, 30_000);

	test("owner traversal finishes while real engagement plays continue", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Finite traversal owner",
			slug: "finite-traversal-campaign",
		});
		await seedRawRewardOutcome(t, world, {
			campaignGameId: world.wheelGameId,
			rewardType: "voucher",
			label: "Finite award one",
			suffix: "finone",
		});
		await seedRawRewardOutcome(t, world, {
			campaignGameId: world.wheelGameId,
			rewardType: "voucher",
			label: "Finite award two",
			suffix: "fintwo",
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await runGameBackfillToReady(asOwner, world.wheelGameId);

		// Real public engagement traffic keeps flowing between pages: none
		// outcomes must never extend or restart the reward traversal.
		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({
				rewardMode: "engagement",
				noRewardLabel: "Cảm ơn!",
				noRewardWeight: 0,
			}),
			status: "active",
		});
		let complete = false;
		let pages = 0;
		for (let page = 0; page < 12 && !complete; page += 1) {
			const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
				shareCode: world.shareCode,
			});
			await expect(
				t.mutation(api.publicPlay.playSessionAction, {
					sessionId: session.sessionId,
					sessionToken: session.sessionToken,
					action: { type: "spin" },
				}),
			).resolves.toMatchObject({ outcome: { rewardType: "none" } });
			const result = await asOwner.mutation(
				internal.playMaintenance.backfillRewardAccountingPage,
				{ limit: 1 },
			);
			complete = result.complete;
			pages += 1;
		}
		expect(complete).toBe(true);
		expect(pages).toBeLessThanOrEqual(12);
		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.rewardAccountingReady).toBe(true);
		expect(plan.usage.redemptions).toBe(2);
	});

	test("populated owner aggregates drain within enforced transaction limits at the 25-page budget", async () => {
		// Behavioral resource instrumentation: convex-test enforces the same
		// per-transaction index-range limits as production. A 1500-entry owner
		// aggregate must tolerate DEFAULT_PAGE_LIMIT (25) pages; raising the
		// budget back toward whole-history collection breaches those limits.
		const t = convexTest({ schema, modules, transactionLimits: true });
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Populated tree owner",
			slug: "populated-tree-campaign",
		});
		const now = Date.now();
		for (let batch = 0; batch < 15; batch += 1) {
			await t.run(async (ctx) => {
				const { rewardedOutcomesByOwner } = await import("./analytics");
				for (let index = 0; index < 100; index += 1) {
					const ordinal = batch * 100 + index;
					const participantId = await ctx.db.insert("participants", {
						ownerId: world.ownerId,
						campaignId: world.campaignId,
						token: `populated${ordinal.toString().padStart(12, "0")}`,
						createdAt: now,
						updatedAt: now,
					});
					const sessionId = await ctx.db.insert("playSessions", {
						ownerId: world.ownerId,
						campaignId: world.campaignId,
						campaignGameId: world.wheelGameId,
						participantId,
						channel: "public-link",
						status: "completed",
						sessionToken: `populatedsession${ordinal.toString().padStart(12, "0")}`,
						startedAt: now,
						completedAt: now,
						createdAt: now,
						updatedAt: now,
					});
					const outcomeId = await ctx.db.insert("rewardOutcomes", {
						ownerId: world.ownerId,
						campaignId: world.campaignId,
						campaignGameId: world.wheelGameId,
						playSessionId: sessionId,
						rewardType: "voucher",
						label: `Populated award ${ordinal}`,
						status: "granted",
						grantedAt: now + ordinal,
					});
					const outcome = await ctx.db.get(outcomeId);
					if (outcome) {
						await rewardedOutcomesByOwner.insert(ctx, outcome);
					}
				}
			});
		}
		// Ten uncounted cash outcomes await the traversal (voucher tree is
		// already fully aggregated, exercising dedupe re-inserts).
		for (const suffix of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
			await seedRawRewardOutcome(t, world, {
				campaignGameId: world.wheelGameId,
				rewardType: "cash",
				label: `New cash award ${suffix}`,
				suffix: `newcash${suffix}`,
				amount: 5000,
			});
		}

		const asOwner = t.withIdentity({ subject: world.ownerId });
		// An oversized page budget is rejected before any traversal work.
		await expect(
			asOwner.mutation(internal.playMaintenance.backfillRewardAccountingPage, {
				limit: 100,
			}),
		).rejects.toThrow("limit phải là số nguyên từ 1 đến 25");

		const traversed = await runOwnerRewardTraversal(asOwner);
		expect(traversed.complete).toBe(true);
		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.rewardAccountingReady).toBe(true);
		expect(plan.usage.redemptions).toBe(1510);
	}, 120_000);
});

describe("guaranteed engagement (no-reward) mode", () => {
	test("engagement wheel never allocates, never consumes quota, shows the thank-you result", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Engagement owner",
			slug: "engagement-campaign",
			inventory: [
				{ name: "Voucher có thật", rewardType: "voucher", secretCode: "ENG-1", quantity: 5, weight: 100 },
			],
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({
				rewardMode: "engagement",
				noRewardLabel: "Cảm ơn bạn đã đồng hành!",
			}),
			name: "Vòng quay cảm ơn",
			status: "active",
		});

		// Entry hides prize segments in engagement mode.
		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		if (entry.state !== "open") throw new Error("expected open entry");
		expect(entry.game.wheel?.segments).toEqual([]);

		const before = await asOwner.query(api.entitlements.getPlanState, {});
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome).toMatchObject({
			kind: "no-reward",
			rewardType: "none",
			label: "Cảm ơn bạn đã đồng hành!",
			canClaim: false,
		});

		const state = await t.run(async (ctx) => {
			return {
				stock: (await ctx.db.query("rewardInventory").collect()).map((item) => item.quantityRemaining),
				outcomes: await ctx.db.query("rewardOutcomes").collect(),
				claims: await ctx.db.query("rewardClaims").collect(),
				events: await ctx.db.query("analyticsCounterEvents").collect(),
			};
		});
		expect(state.stock).toEqual([5]);
		expect(state.outcomes).toHaveLength(1);
		expect(state.outcomes[0].rewardType).toBe("none");
		expect(state.claims).toHaveLength(0);
		expect(countEvents(state.events, "reward_outcome")).toBe(0);
		expect(countEvents(state.events, "game_completion")).toBe(1);
		await expect(
			t.mutation(api.publicPlay.claimPublicReward, {
				sessionId: started.sessionId,
				sessionToken: started.sessionToken,
			}),
		).rejects.toThrow("không có phần thưởng");

		const after = await asOwner.query(api.entitlements.getPlanState, {});
		expect(after.usage.redemptions).toBe(before.usage.redemptions);

		// Recovery of the engagement outcome works through the capability.
		await expect(
			t.query(api.publicPlay.getPublicSessionOutcome, {
				sessionId: started.sessionId,
				sessionToken: started.sessionToken,
			}),
		).resolves.toMatchObject({ outcome: { kind: "no-reward", label: "Cảm ơn bạn đã đồng hành!" } });
	});

	test("engagement li xi completes through reveal-envelope and never touches stock", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Engagement li-xi owner",
			slug: "engagement-lixi-campaign",
			inventory: [{ name: "Quà có thật", rewardType: "physical", quantity: 3, weight: 100 }],
			liXiRewardSource: "campaign-inventory",
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.liXiGameId,
			config: buildLiXiGameConfig({
				rewardSource: "campaign-inventory",
				rewardMode: "engagement",
				noRewardLabel: "Tri ân bạn đã ghé chơi!",
			}),
			status: "active",
		});
		const liXiShareCode = await seedLinkForGame(t, world, world.liXiGameId);

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: liXiShareCode,
		});
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "reveal-envelope", envelopeIndex: 4 },
		});
		expect(result.outcome).toMatchObject({
			kind: "no-reward",
			label: "Tri ân bạn đã ghé chơi!",
		});
		const stock = await t.run(async (ctx) => ctx.db.query("rewardInventory").collect());
		expect(stock.map((row) => row.quantityRemaining)).toEqual([3]);
	});

	test("engagement combined with the legacy budget source is rejected explicitly", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Engagement budget owner",
			slug: "engagement-budget-campaign",
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await expect(
			asOwner.mutation(api.campaignGames.updateCampaignGame, {
				campaignGameId: world.liXiGameId,
				config: {
					...buildLiXiGameConfig(),
					rewardMode: "engagement",
				},
				status: "active",
			}),
		).rejects.toThrow("Chế độ không thưởng chỉ hỗ trợ nguồn kho");
	});
});

describe("frozen session rules", () => {
	test("owner edits never change an admitted session; the next session uses the new rules", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Freeze owner",
			slug: "freeze-campaign",
			inventory: [
				{ name: "Quà pool A", rewardType: "physical", quantity: 5, weight: 100, poolTag: "pool-a" },
			],
		});
		await t.run(async (ctx) => {
			await ctx.db.insert("rewardInventory", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				name: "Quà pool B",
				rewardType: "physical",
				quantityTotal: 5,
				quantityRemaining: 5,
				weight: 100,
				isActive: true,
				displayOrder: 1,
				poolTag: "pool-b",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		// The admitted game plays the pool-a pool at admission time.
		await t.run(async (ctx) => {
			const game = await ctx.db.get(world.wheelGameId);
			if (!game) throw new Error("missing game");
			await ctx.db.patch(game._id, {
				config: buildLuckyWheelGameConfig({ rewardPoolTag: "pool-a", noRewardWeight: 0 }),
			});
		});

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		// Owner switches the admitted game to the other pool and engagement mode.
		const asOwner = t.withIdentity({ subject: world.ownerId });
		await asOwner.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({
				rewardMode: "engagement",
				rewardPoolTag: "pool-b",
				noRewardLabel: "Cảm ơn!",
			}),
			name: "Vòng quay đã chỉnh",
			status: "active",
		});

		// The admitted session still completes under its frozen rules.
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome).toMatchObject({ kind: "reward", label: "Quà pool A" });
		const snapshot = await t.query(api.publicPlay.getPublicSessionSnapshot, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		});
		expect(snapshot?.rules.wheel!.segments.map((segment) => segment.label)).toEqual(["Quà pool A"]);

		// Inventory edits are gated while a session is active.
		await expect(
			asOwner.mutation(api.rewardInventory.configureRewardInventory, {
				campaignId: world.campaignId,
				items: [
					{ name: "Thay thế", rewardType: "physical", quantity: 9, weight: 100, isActive: true },
				],
			}),
		// Either safety gate is acceptable: consumed stock or an in-flight
		// admitted session blocks the edit.
		).rejects.toThrow(/không thể thay thế trực tiếp|lượt chơi chưa hoàn thành/);

		// The next session plays by the NEW rules.
		const next = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		expect(next.sessionId).not.toEqual(started.sessionId);
		const nextResult = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: next.sessionId,
			sessionToken: next.sessionToken,
			action: { type: "spin" },
		});
		expect(nextResult.outcome).toMatchObject({ kind: "no-reward", label: "Cảm ơn!" });
	});

	test("claim privacy and previous-claim recovery survive next plays", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Multi play owner",
			slug: "multi-play-campaign",
			inventory: [
				{ name: "Voucher nhiều lượt", rewardType: "voucher", secretCode: "MULTI-9", quantity: 9, weight: 100 },
			],
		});
		await t.run(async (ctx) => {
			const game = await ctx.db.get(world.wheelGameId);
			if (!game) throw new Error("missing game");
			await ctx.db.patch(game._id, {
				playLimits: { maxSessionsPerParticipant: 2, maxTotalSessions: null },
			});
		});

		const first = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			action: { type: "spin" },
		});
		const firstClaim = await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
		});
		expect(JSON.stringify(firstClaim)).toContain("MULTI-9");

		// Explicit second play (new persisted start key, explicit action).
		const second = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
			participantToken: first.participantToken ?? undefined,
			startKey: "c".repeat(32),
		});
		expect(second.sessionId).not.toEqual(first.sessionId);
		// The previous claim stays recoverable through its capability.
		await expect(
			t.query(api.publicPlay.getPublicClaimDetail, {
				sessionId: first.sessionId,
				sessionToken: first.sessionToken,
			}),
		).resolves.toMatchObject({ claim: { secretCode: "MULTI-9" } });
	});

	test("completed results stay recoverable after the link is revoked", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Revoked recovery owner",
			slug: "revoked-recovery-campaign",
			inventory: [
				{ name: "Voucher revoked", rewardType: "voucher", secretCode: "REV-1", quantity: 5, weight: 100 },
			],
		});
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const capability = {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		};
		await t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "spin" },
		});
		await t.mutation(api.publicPlay.claimPublicReward, capability);

		await t.run(async (ctx) => {
			await ctx.db.patch(world.shareLinkId, { status: "revoked" });
		});
		// New participants are blocked; the completed capability still recovers.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("đã bị thu hồi");
		await expect(
			t.query(api.publicPlay.getPublicSessionOutcome, capability),
		).resolves.toMatchObject({ outcome: { kind: "reward" } });
		await expect(
			t.query(api.publicPlay.getPublicClaimDetail, capability),
		).resolves.toMatchObject({ claim: { secretCode: "REV-1" } });
		await expect(
			t.query(api.publicPlay.getPublicSessionSnapshot, capability),
		).resolves.toMatchObject({ rules: { templateId: "lucky-wheel" } });
	});
});

describe("saved reward recovery", () => {
	async function leaveVoucherUnclaimed(
		t: ReturnType<typeof convexTest>,
		world: SeededCampaign,
	) {
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		return started;
	}

	test("an unclaimed saved award stays claimable through its capability without new stock or metrics", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Saved owner",
			slug: "saved-campaign",
			inventory: [
				{ name: "Voucher saved", rewardType: "voucher", secretCode: "SAVE-9", quantity: 5, weight: 100 },
			],
		});

		const started = await leaveVoucherUnclaimed(t, world);
		const capability = {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		};

		// Saved-results recovery surfaces the unclaimed award.
		const summaries = await t.query(api.publicPlay.getSavedRewardSummaries, {
			shareCode: world.shareCode,
			entries: [capability],
		});
		expect(summaries.entries).toHaveLength(1);
		expect(summaries.entries[0]).toMatchObject({
			status: "completed",
			claimed: false,
			outcome: { kind: "reward", canClaim: true },
		});
		expect(JSON.stringify(summaries)).not.toContain("SAVE-9");

		// Claim happens through the capability, once.
		const claim = await t.mutation(api.publicPlay.claimPublicReward, capability);
		expect(claim.claim.secretCode).toBe("SAVE-9");

		// The same recovery now reads the previously claimed private details.
		const after = await t.query(api.publicPlay.getSavedRewardSummaries, {
			shareCode: world.shareCode,
			entries: [capability],
		});
		expect(after.entries[0]).toMatchObject({
			status: "completed",
			claimed: true,
			outcome: { secretCode: "SAVE-9" },
		});

		// Recovery never allocated stock again or fabricated metrics.
		const state = await t.run(async (ctx) => {
			return {
				stock: (await ctx.db.query("rewardInventory").collect()).map((item) => item.quantityRemaining),
				outcomes: await ctx.db.query("rewardOutcomes").collect(),
				claims: await ctx.db.query("rewardClaims").collect(),
				events: await ctx.db.query("analyticsCounterEvents").collect(),
			};
		});
		expect(state.stock).toEqual([4]);
		expect(state.outcomes).toHaveLength(1);
		expect(state.claims).toHaveLength(1);
		const funnelMetrics = state.events.filter((event) =>
			["game_start", "game_completion", "reward_outcome", "reward_claim"].includes(event.metric),
		);
		// One start, one completion, one outcome, one claim — recovery added none.
		expect(funnelMetrics.length).toBe(4);
	});

	test("saved summaries stay available on a revoked link and reject foreign capabilities", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Revoked saved owner",
			slug: "revoked-saved-campaign",
			inventory: [
				{ name: "Voucher", rewardType: "voucher", secretCode: "RV-1", quantity: 5, weight: 100 },
			],
		});
		const started = await leaveVoucherUnclaimed(t, world);
		await t.run(async (ctx) => {
			await ctx.db.patch(world.shareLinkId, { status: "revoked" });
		});

		const summaries = await t.query(api.publicPlay.getSavedRewardSummaries, {
			shareCode: world.shareCode,
			entries: [
				{ sessionId: started.sessionId, sessionToken: started.sessionToken },
				{ sessionId: started.sessionId, sessionToken: "forged-token-forged-token" },
			],
		});
		expect(summaries.entries).toHaveLength(2);
		expect(summaries.entries[0]).toMatchObject({ status: "completed", claimed: false });
		expect(summaries.entries[1]).toMatchObject({ status: "invalid" });
	});
});

describe("game and reward entitlements", () => {
	test("a second game joins an existing campaign at the campaign cap, a second campaign is rejected", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Quota game owner",
			slug: "quota-game-campaign",
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });

		const plan = await asOwner.query(api.entitlements.getPlanState, {});
		expect(plan.tier).toBe("free");
		expect(plan.usage.campaigns).toBe(plan.limits.campaigns);

		// A second game in the SAME campaign consumes game quota, not campaign quota.
		await expect(
			asOwner.mutation(api.campaignGames.createCampaignGame, {
				campaignId: world.campaignId,
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
				name: "Second independent experience",
				status: "draft",
				templateId: "lucky-wheel",
			}),
		).resolves.toHaveProperty("campaignGameId");

		// A second campaign at the free cap is still rejected.
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				name: "Chiến dịch thứ hai bị chặn",
				status: "active",
				theme: "brand",
			}),
		).rejects.toThrow("Đã đạt giới hạn số chiến dịch");

		// Owner isolation on the game creation helper.
		const foreignOwner = await t.run(async (ctx) => {
			return ctx.db.insert("users", { name: "Quota foreign owner" });
		});
		await expect(
			t.withIdentity({ subject: foreignOwner }).mutation(api.campaignGames.createCampaignGame, {
				campaignId: world.campaignId,
				config: buildLuckyWheelGameConfig(),
				status: "draft",
				templateId: "lucky-wheel",
			}),
		).rejects.toThrow("Không tìm thấy chiến dịch");
	});

	test("generic rewarded plays consume the shared reward quota once; no-reward does not", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Reward quota owner",
			slug: "reward-quota-campaign",
			inventory: [
				{ name: "Voucher quota", rewardType: "voucher", secretCode: "Q-100", quantity: 10, weight: 100 },
			],
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });

		const before = await asOwner.query(api.entitlements.getPlanState, {});
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const capability = {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		};
		await t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "spin" },
		});
		await t.mutation(api.publicPlay.claimPublicReward, capability);
		// Repeated actions/claims never consume quota twice.
		await t.mutation(api.publicPlay.playSessionAction, {
			...capability,
			action: { type: "spin" },
		});
		await t.mutation(api.publicPlay.claimPublicReward, capability);

		const after = await asOwner.query(api.entitlements.getPlanState, {});
		expect(after.usage.redemptions).toBe(before.usage.redemptions + 1);
	});

	test("no-reward completion succeeds at exhausted rewarded quota and consumes nothing", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedCampaignGameWorld(t, {
			ownerName: "Exhausted quota owner",
			slug: "exhausted-quota-campaign",
			inventory: [],
		});
		const asOwner = t.withIdentity({ subject: world.ownerId });

		// Saturate the free-tier redemption quota with legacy usage.
		const before = await asOwner.query(api.entitlements.getPlanState, {});
		const legacyLimit = before.limits.redemptions;
		if (legacyLimit === null) throw new Error("expected a finite legacy redemption limit");
		await t.run(async (ctx) => {
			const { redemptionsByOwnerAmount } = await import("./analytics");
			const now = Date.now();
			const budgetItemId = await ctx.db.insert("budgetItems", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				amount: 1000,
				rarity: "common",
				initialQuantity: legacyLimit,
				remainingQuantity: legacyLimit,
				displayOrder: 0,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			});
			for (let index = 0; index < legacyLimit; index += 1) {
				const drawSessionId = await ctx.db.insert("drawSessions", {
					ownerId: world.ownerId,
					campaignId: world.campaignId,
					guestNameDisplay: `Legacy ${index}`,
					guestNameNormalized: `legacy-${index}`,
					status: "redeemed",
					createdAt: now,
				});
				const redemptionId = await ctx.db.insert("redemptions", {
					ownerId: world.ownerId,
					campaignId: world.campaignId,
					drawSessionId,
					guestNameDisplay: `Legacy ${index}`,
					guestNameNormalized: `legacy-${index}`,
					amount: 1000,
					rarity: "common",
					budgetItemId,
					envelopeIndex: 0,
					createdAt: now,
				});
				const redemption = await ctx.db.get(redemptionId);
				if (redemption) {
					await redemptionsByOwnerAmount.insert(ctx, redemption);
				}
			}
		});

		const atLimit = await asOwner.query(api.entitlements.getPlanState, {});
		expect(atLimit.usage.redemptions).toBe(legacyLimit);

		// A no-reward engagement play still completes without quota error.
		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(result.outcome.kind).toBe("no-reward");

		const unchanged = await asOwner.query(api.entitlements.getPlanState, {});
		expect(unchanged.usage.redemptions).toBe(legacyLimit);
	});
});
