import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertStationPlayableGame } from "./stationPlay";
import { createPinHash } from "./security";
import schema from "./schema";
import {
	buildLuckyWheelGameConfig,
	buildLiXiGameConfig,
	buildQuizGameConfig,
	buildScratchCardGameConfig,
	buildSlotRevealGameConfig,
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
};

type SeededWorld = {
	ownerId: Id<"users">;
	otherOwnerId: Id<"users">;
	campaignId: Id<"campaigns">;
	wheelGameId: Id<"campaignGames">;
	scratchGameId: Id<"campaignGames">;
	quizGameId: Id<"campaignGames">;
	slotGameId: Id<"campaignGames">;
	liXiGameId: Id<"campaignGames">;
};

/**
 * One owner campaign with every station-relevant template variant plus a
 * second owner whose games must never be reachable cross-tenant.
 */
async function seedStationWorld(
	testContext: ReturnType<typeof convexTest>,
	options: {
		ownerName: string;
		slug: string;
		inventory?: InventorySeed[];
		maxTotalSessions?: number | null;
	},
): Promise<SeededWorld> {
	return testContext.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: options.ownerName });
		const otherOwnerId = await ctx.db.insert("users", { name: `${options.ownerName}-khác` });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId,
			name: `Chiến dịch ${options.ownerName}`,
			slug: options.slug,
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("campaigns", {
			ownerId: otherOwnerId,
			name: "Chiến dịch người khác",
			slug: `${options.slug}-other`,
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const playLimits = {
			maxSessionsPerParticipant: 1,
			maxTotalSessions: options.maxTotalSessions ?? null,
		};
		const wheelGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
			name: "Vòng quay trạm",
			playLimits,
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const scratchGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "scratch-card",
			config: buildScratchCardGameConfig({ noRewardWeight: 0, coverStyle: "teal" }),
			name: "Thẻ cào trạm",
			playLimits,
			status: "active",
			createdAt: now + 1,
			updatedAt: now + 1,
		});
		const quizGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "quiz",
			config: buildQuizGameConfig(),
			name: "Trắc nghiệm trạm",
			playLimits,
			status: "active",
			createdAt: now + 2,
			updatedAt: now + 2,
		});
		const slotGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "slot-reveal",
			config: buildSlotRevealGameConfig(),
			name: "Máy quay trạm",
			playLimits,
			status: "active",
			createdAt: now + 3,
			updatedAt: now + 3,
		});
		const liXiGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "li-xi",
			config: buildLiXiGameConfig(),
			name: "Lunar Fortune trạm",
			playLimits,
			status: "active",
			createdAt: now + 4,
			updatedAt: now + 4,
		});
		// A foreign-owner game mirroring the wheel scenario for cross-tenant
		// checks. Seed helper ctx is generically typed, so resolve the row by
		// collect+find instead of an index query.
		const foreignOwnerCampaigns = await ctx.db.query("campaigns").collect();
		const foreignCampaign = foreignOwnerCampaigns.find(
			(row) => row.ownerId === otherOwnerId && row.slug === `${options.slug}-other`,
		);
		if (!foreignCampaign) throw new Error("missing foreign campaign");
		await ctx.db.insert("campaignGames", {
			ownerId: otherOwnerId,
			campaignId: foreignCampaign._id,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
			name: "Vònglauf người khác",
			playLimits,
			status: "active",
			createdAt: now + 5,
			updatedAt: now + 5,
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
				createdAt: now,
				updatedAt: now,
			});
		}
		return {
			ownerId,
			otherOwnerId,
			campaignId,
			wheelGameId,
			scratchGameId,
			quizGameId,
			slotGameId,
			liXiGameId,
		};
	});
}

function ownerClient(t: ReturnType<typeof convexTest>, world: SeededWorld) {
	return t.withIdentity({ subject: world.ownerId });
}

function foreignClient(t: ReturnType<typeof convexTest>, world: SeededWorld) {
	return t.withIdentity({ subject: world.otherOwnerId });
}

describe("station admission (self-serve station)", () => {
	test("start admits a station-channel session through the shared core with a frozen snapshot", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Station owner",
			slug: "station-owner",
			inventory: [
				{
					name: "Voucher quà tặng",
					rewardType: "voucher",
					secretCode: "STATION-CODE-1",
					quantity: 3,
					weight: 100,
				},
			],
		});
		const client = ownerClient(t, world);

		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		expect(started.resumed).toBe(false);
		expect(started.templateId).toBe("lucky-wheel");

		const session = await t.run(async (ctx) => ctx.db.get(started.sessionId as Id<"playSessions">));
		if (!session) throw new Error("missing session");
		expect(session.channel).toBe("station");
		expect(session.channelLabel).toBe("Trạm chơi");
		expect(session.shareLinkId).toBeUndefined();
		expect(session.status).toBe("active");
		// Snapshot frozen at admission: wheel segment keys are the inventory ids.
		expect(session.rulesSnapshot?.templateId).toBe("lucky-wheel");
		expect(session.rulesSnapshot?.rewardSource).toBe("campaign-inventory");
		expect(session.rulesSnapshot?.wheelSegments?.map((segment) => segment.label)).toEqual([
			"Voucher quà tặng",
		]);
		// Fresh anonymous participant per play: no device token, display-only name.
		const participant = await t.run(async (ctx) => ctx.db.get(session.participantId));
		expect(participant?.token).toBeTruthy();
		expect(participant?.displayName).toBeUndefined();

		// State query exposes the active session to the owner's station page only.
		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.playSession?.sessionId).toBe(started.sessionId);
		expect(state.playSession?.sessionToken).toBe(started.sessionToken);
		expect(state.playSession?.playContext).toMatchObject({
			noRewardKey: "__no-reward__",
		});
		expect(state.inventory).toHaveLength(1);
		expect(state.availability.soldOut).toBe(false);
	});

	test("a second start returns the single active station session idempotently", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Single active owner",
			slug: "single-active",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		const client = ownerClient(t, world);

		const first = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		const second = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		expect(second.sessionId).toBe(first.sessionId);
		expect(second.sessionToken).toBe(first.sessionToken);
		expect(second.resumed).toBe(true);

		const sessions = await t.run(async (ctx) =>
			ctx.db
				.query("playSessions")
				.withIndex("by_campaignGame_status", (q) =>
					q.eq("campaignGameId", world.wheelGameId).eq("status", "active"),
				)
				.collect(),
		);
		expect(sessions).toHaveLength(1);
	});

	test("a completed station session frees the station for the next participant", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Reset owner",
			slug: "station-reset",
			inventory: [
				{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 },
				{ name: "Quà khác", rewardType: "physical", quantity: 5, weight: 100 },
			],
		});
		const client = ownerClient(t, world);

		const first = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			action: { type: "spin" },
		});

		const second = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		expect(second.resumed).toBe(false);
		expect(second.sessionId).not.toBe(first.sessionId);
	});

	test("station claim carries the station channel and reveals the immutable code", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Claim owner",
			slug: "station-claim",
			inventory: [
				{
					name: "Voucher tri ân",
					rewardType: "voucher",
					secretCode: "STATION-CLAIM-CODE",
					quantity: 2,
					weight: 100,
				},
			],
		});
		const client = ownerClient(t, world);

		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		const played = await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		if (!played.outcome) throw new Error("expected an outcome");
		expect(played.outcome.kind).toBe("reward");

		// Stock consumed at allocation, exactly once.
		const stockAfterPlay = await t.run(async (ctx) =>
			ctx.db
				.query("rewardInventory")
				.withIndex("by_campaign_owner_active", (q) =>
					q.eq("campaignId", world.campaignId).eq("ownerId", world.ownerId).eq("isActive", true),
				)
				.collect(),
		);
		expect(stockAfterPlay.map((item) => item.quantityRemaining)).toEqual([1]);

		const claim = await client.mutation(api.publicPlay.claimPublicReward, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		});
		expect(claim.claim.secretCode).toBe("STATION-CLAIM-CODE");
		// Idempotent replay returns the same immutable claim.
		const replay = await client.mutation(api.publicPlay.claimPublicReward, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		});
		expect(replay.alreadyClaimed).toBe(true);
		expect(replay.claim.secretCode).toBe("STATION-CLAIM-CODE");

		const claims = await t.run(async (ctx) => ctx.db.query("rewardClaims").collect());
		expect(claims).toHaveLength(1);
		expect(claims[0].channel).toBe("station");
		expect(claims[0].channelLabel).toBe("Trạm chơi");
	});

	test("capacity gate and accounting init apply to station admissions", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Capacity owner",
			slug: "station-capacity",
			inventory: [
				{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 },
				{ name: "Quà khác", rewardType: "physical", quantity: 5, weight: 100 },
			],
			maxTotalSessions: 1,
		});
		const client = ownerClient(t, world);

		const first = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		// The active session itself idempotently resumes instead of admitting.
		const resumed = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		expect(resumed.sessionId).toBe(first.sessionId);

		// Complete it: now the single capacity slot is consumed for good.
		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: first.sessionId,
			sessionToken: first.sessionToken,
			action: { type: "spin" },
		});
		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, { campaignGameId: world.wheelGameId }),
		).rejects.toThrow("Trò chơi đã hết lượt tham gia");

		const game = await t.run(async (ctx) => ctx.db.get(world.wheelGameId));
		expect(game?.accountingVersion).toBe(1);
	});

	test("station rules freeze at admission: config edits never rewrite an admitted play", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Freeze owner",
			slug: "station-freeze",
			inventory: [
				{ name: "Quà gốc", rewardType: "physical", quantity: 5, weight: 100 },
			],
		});
		const client = ownerClient(t, world);
		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});

		// Owner renames the pool item and swaps the no-reward odds mid-play.
		await t.run(async (ctx) => {
			const item = await ctx.db
				.query("rewardInventory")
				.withIndex("by_campaign_owner_active", (q) =>
					q.eq("campaignId", world.campaignId).eq("ownerId", world.ownerId).eq("isActive", true),
				)
				.first();
			if (!item) throw new Error("missing item");
			await ctx.db.patch(item._id, { name: "Quà đã đổi", updatedAt: Date.now() });
			await ctx.db.patch(world.wheelGameId, {
				config: buildLuckyWheelGameConfig({ noRewardWeight: 100 }),
				updatedAt: Date.now(),
			});
		});

		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		// Presentation still uses the frozen admission snapshot.
		expect(state.playSession?.playContext).toMatchObject({
			segments: [{ label: "Quà gốc" }],
		});
		expect(state.playSession?.copy.headline).toBeTypeOf("string");

		const played = await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		if (!played.outcome) throw new Error("expected an outcome");
		// The frozen snapshot (weight 100 / noRewardWeight 0) still awards.
		expect(played.outcome.kind).toBe("reward");
	});
});

describe("station fail-closed gates", () => {
	test("missing, malformed, and foreign campaign games fail closed", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Gate owner",
			slug: "station-gates",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		const client = ownerClient(t, world);

		await expect(
			client.query(api.stationPlay.getStationPlayState, { campaignGameId: "zzzzzzzzzzzzzzzzzzzzzzzzzz" }),
		).rejects.toThrow("Không tìm thấy trò chơi");
		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, {
				campaignGameId: "zzzzzzzzzzzzzzzzzzzzzzzzzz",
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");

		// Foreign-owned game: identical message, no existence leak.
		const foreignGame = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("campaignGames")
				.withIndex("by_owner", (q) => q.eq("ownerId", world.otherOwnerId))
				.collect();
			return rows[0];
		});
		if (!foreignGame) throw new Error("missing foreign game");
		await expect(
			client.query(api.stationPlay.getStationPlayState, { campaignGameId: foreignGame._id }),
		).rejects.toThrow("Không tìm thấy trò chơi");
		await expect(
			foreignClient(t, world).mutation(api.stationPlay.startStationPlaySession, {
				campaignGameId: world.wheelGameId,
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");

		// Unauthenticated callers fail closed everywhere.
		await expect(
			t.mutation(api.stationPlay.startStationPlaySession, { campaignGameId: world.wheelGameId }),
		).rejects.toThrow("Cần đăng nhập để tiếp tục");
	});

	test("quiz and slot templates fail closed on station functions", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Template gate owner",
			slug: "station-template-gates",
		});
		const client = ownerClient(t, world);
		for (const campaignGameId of [world.quizGameId, world.slotGameId]) {
			await expect(
				client.mutation(api.stationPlay.startStationPlaySession, { campaignGameId }),
			).rejects.toThrow("Mẫu trò chơi này chưa mở chế độ trạm tự phục vụ");
			await expect(
				client.query(api.stationPlay.getStationPlayState, { campaignGameId }),
			).rejects.toThrow("Mẫu trò chơi này chưa mở chế độ trạm tự phục vụ");
		}
	});

	test("li xi budget games stay on the legacy draw flow, and the source gate holds", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Source gate owner",
			slug: "station-source-gates",
		});
		const client = ownerClient(t, world);
		// li xi keeps its legacy draw flow entirely out of the station engine:
		// the template gate fails closed before the source gate can matter.
		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, {
				campaignGameId: world.liXiGameId,
			}),
		).rejects.toThrow("Mẫu trò chơi này chưa mở chế độ trạm tự phục vụ");

		// The typed builders and config validators pin station-capable
		// templates to campaign-inventory, so the source half of the gate is
		// defense in depth. What IS reachable — an incoherent row — must also
		// fail closed through the same gate instead of admitting.
		expect(() =>
			assertStationPlayableGame({
				templateId: "lucky-wheel",
				config: buildLiXiGameConfig(),
			} as unknown as Parameters<typeof assertStationPlayableGame>[0]),
		).toThrow("Cấu hình không khớp mẫu vòng quay may mắn");
	});

	test("inactive campaigns or games fail closed", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Inactive owner",
			slug: "station-inactive",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		const client = ownerClient(t, world);
		await t.run(async (ctx) => {
			await ctx.db.patch(world.campaignId, { status: "draft", updatedAt: Date.now() });
		});
		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, { campaignGameId: world.wheelGameId }),
		).rejects.toThrow("Chiến dịch hoặc trò chơi hiện không còn hoạt động");
	});
});

describe("station game_open analytics", () => {
	test("one open per stable openKey; retries and replays never double count", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Open owner",
			slug: "station-open",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		const client = ownerClient(t, world);

		await client.mutation(api.stationPlay.recordStationPlayOpen, {
			campaignGameId: world.wheelGameId,
			openKey: "openkey-aaaa-bbbb",
		});
		// Same-mount retry with the SAME key: idempotent.
		await client.mutation(api.stationPlay.recordStationPlayOpen, {
			campaignGameId: world.wheelGameId,
			openKey: "openkey-aaaa-bbbb",
		});
		// Next waiting round: a new key counts once more.
		await client.mutation(api.stationPlay.recordStationPlayOpen, {
			campaignGameId: world.wheelGameId,
			openKey: "openkey-cccc-dddd",
		});

		const events = await t.run(async (ctx) =>
			ctx.db.query("analyticsCounterEvents").filter((q) => q.eq(q.field("metric"), "game_open")).collect(),
		);
		const stationOpens = events.filter((event) => event.eventKey.startsWith("station-open:"));
		expect(stationOpens).toHaveLength(2);
		expect(stationOpens.every((event) => event.channel === "station")).toBe(true);
		expect(stationOpens.every((event) => event.channelLabel === "Trạm chơi")).toBe(true);
	});

	test("station opens, starts, completions, and claims stay a non-double-counting funnel", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Funnel owner",
			slug: "station-funnel",
			inventory: [
				{
					name: "Voucher",
					rewardType: "voucher",
					secretCode: "FUNNEL-CODE",
					quantity: 5,
					weight: 100,
				},
			],
		});
		const client = ownerClient(t, world);

		await client.mutation(api.stationPlay.recordStationPlayOpen, {
			campaignGameId: world.wheelGameId,
			openKey: "funnel-open-1",
		});
		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		await client.mutation(api.publicPlay.claimPublicReward, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		});
		// Waiting round for the next participant.
		await client.mutation(api.stationPlay.recordStationPlayOpen, {
			campaignGameId: world.wheelGameId,
			openKey: "funnel-open-2",
		});

		const events = await t.run(async (ctx) =>
			ctx.db.query("analyticsCounterEvents").collect(),
		);
		const byMetric = (metric: string) => events.filter((event) => event.metric === metric);
		expect(byMetric("game_open")).toHaveLength(2);
		expect(byMetric("game_start")).toHaveLength(1);
		expect(byMetric("game_completion")).toHaveLength(1);
		expect(byMetric("reward_outcome")).toHaveLength(1);
		expect(byMetric("reward_claim")).toHaveLength(1);
		const startEvent = byMetric("game_start")[0];
		expect(startEvent.channel).toBe("station");
		expect(startEvent.channelLabel).toBe("Trạm chơi");
	});
});

describe("station result recovery", () => {
	test("a completed rewarded station play surfaces as recoverable until collect acknowledges it", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Recovery owner",
			slug: "station-recovery",
			inventory: [
				{
					name: "Voucher phục hồi",
					rewardType: "voucher",
					secretCode: "RECOVERY-CODE",
					quantity: 3,
					weight: 100,
				},
			],
		});
		const client = ownerClient(t, world);

		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		// While the session is active there is nothing to recover.
		const activeState = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(activeState.playSession?.sessionId).toBe(started.sessionId);
		expect(activeState.recoverable).toBeNull();

		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});

		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.playSession).toBeNull();
		expect(state.recoverable?.sessionId).toBe(started.sessionId);
		// Owner-only capability + frozen presentation come with the recovery.
		expect(state.recoverable?.sessionToken).toBe(started.sessionToken);
		expect(state.recoverable?.outcome).toMatchObject({
			kind: "reward",
			label: "Voucher phục hồi",
			canClaim: true,
		});
		expect(state.recoverable?.claim).toBeNull();

		// Collect ("Hoàn tất") acknowledges: the result never resurfaces.
		await client.mutation(api.stationPlay.acknowledgeStationPlayResult, {
			campaignGameId: world.wheelGameId,
			sessionId: started.sessionId,
		});
		const acknowledgedState = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(acknowledgedState.recoverable).toBeNull();
		// Idempotent replay keeps the session handled.
		await client.mutation(api.stationPlay.acknowledgeStationPlayResult, {
			campaignGameId: world.wheelGameId,
			sessionId: started.sessionId,
		});
		expect(
			(await client.query(api.stationPlay.getStationPlayState, { campaignGameId: world.wheelGameId }))
				.recoverable,
		).toBeNull();
	});

	test("a claimed-but-unacknowledged result resurfaces with its code, and claims stay exactly-once", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Claim recovery owner",
			slug: "station-claim-recovery",
			inventory: [
				{
					name: "Voucher đã nhận",
					rewardType: "voucher",
					secretCode: "CLAIMED-CODE",
					quantity: 2,
					weight: 100,
				},
			],
		});
		const client = ownerClient(t, world);

		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		const claim = await client.mutation(api.publicPlay.claimPublicReward, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
		});
		expect(claim.alreadyClaimed).toBe(false);

		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.recoverable?.sessionId).toBe(started.sessionId);
		expect(state.recoverable?.outcome.canClaim).toBe(false);
		// The lost code re-reveals through the immutable claim view.
		expect(state.recoverable?.claim?.secretCode).toBe("CLAIMED-CODE");

		// Resuming the recoverable session claims idempotently: same claim,
		// still exactly one reward_claim event.
		const replay = await client.mutation(api.publicPlay.claimPublicReward, {
			sessionId: state.recoverable!.sessionId,
			sessionToken: state.recoverable!.sessionToken,
		});
		expect(replay.alreadyClaimed).toBe(true);
		expect(replay.claim.secretCode).toBe("CLAIMED-CODE");
		const events = await t.run(async (ctx) =>
			ctx.db
				.query("analyticsCounterEvents")
				.filter((q) => q.eq(q.field("metric"), "reward_claim"))
				.collect(),
		);
		expect(events).toHaveLength(1);
	});

	test("dismiss requires the host PIN and clears the pending result", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Dismiss owner",
			slug: "station-dismiss",
			inventory: [
				{ name: "Quà bỏ đi", rewardType: "physical", quantity: 2, weight: 100 },
			],
		});
		const client = ownerClient(t, world);
		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});

		await expect(
			client.mutation(api.stationPlay.dismissStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: started.sessionId,
				pin: "000000",
			}),
		).rejects.toThrow("Host chưa thiết lập PIN");
		// Seeded users carry no PIN hash; set one the same way the auth layer
		// does, then retry with a wrong and a correct PIN.
		await t.run(async (ctx) => {
			const { salt, hash } = await createPinHash("246810");
			await ctx.db.patch(world.ownerId, { pinSalt: salt, pinHash: hash });
		});
		await expect(
			client.mutation(api.stationPlay.dismissStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: started.sessionId,
				pin: "000000",
			}),
		).rejects.toThrow("PIN host không đúng");
		const stateBefore = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(stateBefore.recoverable?.sessionId).toBe(started.sessionId);

		await client.mutation(api.stationPlay.dismissStationPlayResult, {
			campaignGameId: world.wheelGameId,
			sessionId: started.sessionId,
			pin: "246810",
		});
		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.recoverable).toBeNull();
	});

	test("acknowledge and dismiss fail closed for foreign, malformed, or active sessions", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Guard owner",
			slug: "station-dismiss-guards",
			inventory: [
				{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 },
			],
		});
		const client = ownerClient(t, world);
		await t.run(async (ctx) => {
			const { salt, hash } = await createPinHash("246810");
			await ctx.db.patch(world.ownerId, { pinSalt: salt, pinHash: hash });
		});
		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		// Active (not completed) sessions have no result to resolve.
		await expect(
			client.mutation(api.stationPlay.acknowledgeStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: started.sessionId,
			}),
		).rejects.toThrow("Chỉ có thể hoàn tất kết quả của lượt chơi đã hoàn thành");
		await expect(
			client.mutation(api.stationPlay.dismissStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: started.sessionId,
				pin: "246810",
			}),
		).rejects.toThrow("Chỉ có thể bỏ kết quả của lượt chơi đã hoàn thành");

		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		// Malformed session ids fail closed with the shared message.
		await expect(
			client.mutation(api.stationPlay.dismissStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: "zzzzzzzzzzzzzzzzzzzzzzzzzz",
				pin: "246810",
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");
		// Foreign owners fail closed on the game gate, and a foreign client
		// cannot dismiss through its own game either.
		const foreignGame = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("campaignGames")
				.withIndex("by_owner", (q) => q.eq("ownerId", world.otherOwnerId))
				.collect();
			return rows[0];
		});
		if (!foreignGame) throw new Error("missing foreign game");
		await expect(
			foreignClient(t, world).mutation(api.stationPlay.dismissStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: started.sessionId,
				pin: "246810",
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");
		// Unauthenticated callers fail closed before the PIN check matters.
		await expect(
			t.mutation(api.stationPlay.dismissStationPlayResult, {
				campaignGameId: world.wheelGameId,
				sessionId: started.sessionId,
				pin: "246810",
			}),
		).rejects.toThrow("Cần đăng nhập để tiếp tục");
	});

	test("engagement and no-reward completions never surface as recoverable", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Engagement owner",
			slug: "station-engagement",
			inventory: [
				{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 },
			],
		});
		const client = ownerClient(t, world);
		await t.run(async (ctx) => {
			await ctx.db.patch(world.wheelGameId, {
				config: buildLuckyWheelGameConfig({ rewardMode: "engagement", noRewardWeight: 0 }),
				updatedAt: Date.now(),
			});
		});
		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		const played = await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(played.outcome?.kind).toBe("no-reward");
		let state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.recoverable).toBeNull();

		// A no-reward completion on a rewarded game likewise has nothing to
		// collect. The no-reward weight competes against item weights, so pin
		// the pool to zero weight to land the no-reward segment every time.
		await t.run(async (ctx) => {
			await ctx.db.patch(world.wheelGameId, {
				config: buildLuckyWheelGameConfig({ rewardMode: "rewarded", noRewardWeight: 100 }),
				updatedAt: Date.now(),
			});
			const item = await ctx.db
				.query("rewardInventory")
				.withIndex("by_campaign_owner_active", (q) =>
					q.eq("campaignId", world.campaignId).eq("ownerId", world.ownerId).eq("isActive", true),
				)
				.first();
			if (!item) throw new Error("missing item");
			await ctx.db.patch(item._id, { weight: 0, updatedAt: Date.now() });
		});
		const second = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		await client.mutation(api.publicPlay.playSessionAction, {
			sessionId: second.sessionId,
			sessionToken: second.sessionToken,
			action: { type: "spin" },
		});
		state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.recoverable).toBeNull();
	});
});

describe("public path regression through the shared admission core", () => {
	test("public start still admits a public-link session with identical semantics", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Public regression owner",
			slug: "public-regression",
			inventory: [
				{
					name: "Voucher",
					rewardType: "voucher",
					secretCode: "PUBLIC-CODE",
					quantity: 3,
					weight: 100,
				},
			],
		});
		const shareCode = "abcdefghjkmnpqrstuvwxyz234567".slice(0, 22);
		await t.run(async (ctx) => {
			await ctx.db.insert("publicPlayLinks", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: world.wheelGameId,
				shareCode,
				channel: "qr",
				status: "active",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode,
			startKey: "b".repeat(32),
		});
		expect(started.resumed).toBe(false);
		const session = await t.run(async (ctx) =>
			ctx.db.get(started.sessionId as Id<"playSessions">),
		);
		if (!session) throw new Error("missing session");
		expect(session.channel).toBe("public-link");
		expect(session.rulesSnapshot?.wheelSegments?.length).toBe(1);

		const played = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: started.sessionId,
			sessionToken: started.sessionToken,
			action: { type: "spin" },
		});
		expect(played.outcome?.kind).toBe("reward");
	});

	test("li xi draw sessions remain untouched by the station engine", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedStationWorld(t, {
			ownerName: "Li xi owner",
			slug: "li-xi-untouched",
		});
		// The station engine refuses li-xi rows; the draw surface keeps its own
		// functions (api.draw.*) and deliveryMode semantics. The station
		// functions never touch drawSessions.
		const client = ownerClient(t, world);
		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, {
				campaignGameId: world.liXiGameId,
			}),
		).rejects.toThrow("Mẫu trò chơi này chưa mở chế độ trạm tự phục vụ");
		const drawSessions = await t.run(async (ctx) => ctx.db.query("drawSessions").collect());
		expect(drawSessions).toHaveLength(0);
		// Sanity: buildLiXiGameConfig remains the budget source builder.
		expect(buildLiXiGameConfig().rewardSource).toBe("campaign-budget");
	});
});
