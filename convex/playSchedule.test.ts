import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buildLuckyWheelGameConfig } from "../lib/gameTemplates";
import {
	DEFAULT_PUBLIC_CLAIM_INSTRUCTIONS,
	DEFAULT_PUBLIC_THANK_YOU_MESSAGE,
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
	shareCode: string;
};

/** Owner campaign + one rewarded lucky-wheel game + one reusable public link. */
async function seedScheduleWorld(
	testContext: ReturnType<typeof convexTest>,
	options: {
		ownerName: string;
		slug: string;
		inventory?: InventorySeed[];
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
		const wheelGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
			name: "Vòng quay may mắn",
			playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
			status: "active",
			createdAt: now,
			updatedAt: now,
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
		const shareCode = "zyxwvutsrqponmkjihgfe" + "d";
		await ctx.db.insert("publicPlayLinks", {
			ownerId,
			campaignId,
			campaignGameId: wheelGameId,
			shareCode,
			channel: "qr",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		return { ownerId, otherOwnerId, campaignId, wheelGameId, shareCode };
	});
}

/** Sets the play window directly; write-path validation is covered separately. */
async function patchWindow(
	testContext: ReturnType<typeof convexTest>,
	world: SeededWorld,
	window: { startsAt?: number | null; endsAt?: number | null },
): Promise<void> {
	await testContext.run(async (ctx) => {
		const game = await ctx.db.get(world.wheelGameId);
		if (!game) throw new Error("missing game");
		// The stored bounds are optional numbers: absent, never null.
		const patch: { startsAt?: number; endsAt?: number } = {};
		if (typeof window.startsAt === "number") patch.startsAt = window.startsAt;
		if (typeof window.endsAt === "number") patch.endsAt = window.endsAt;
		if (window.startsAt === null) patch.startsAt = undefined;
		if (window.endsAt === null) patch.endsAt = undefined;
		await ctx.db.patch(game._id, patch);
	});
}

describe("public link play-window enforcement", () => {
	test("before the window the entry closes as not-started and admission refuses", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Early owner",
			slug: "early-campaign",
		});
		const startsAt = Date.now() + 60 * 60 * 1000;
		await patchWindow(t, world, { startsAt, endsAt: null });

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		expect(entry).toMatchObject({
			state: "closed",
			reason: "not-started",
			scheduledAt: startsAt,
		});
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("Trò chơi chưa mở cửa sổ chơi");
	});

	test("after the window the entry closes as ended and admission refuses", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Late owner",
			slug: "late-campaign",
		});
		const endsAt = Date.now() - 60 * 60 * 1000;
		await patchWindow(t, world, { startsAt: null, endsAt });

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		expect(entry).toMatchObject({
			state: "closed",
			reason: "ended",
			scheduledAt: endsAt,
		});
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("Trò chơi đã kết thúc cửa sổ chơi");
	});

	test("an open bounded window admits and reports the window on the entry", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Open window owner",
			slug: "open-window-campaign",
		});
		const startsAt = Date.now() - 60 * 60 * 1000;
		const endsAt = Date.now() + 60 * 60 * 1000;
		await patchWindow(t, world, { startsAt, endsAt });

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		if (entry.state !== "open") throw new Error("expected open entry");
		expect(entry.game.schedule).toEqual({ startsAt, endsAt });
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).resolves.toMatchObject({ resumed: false });
	});

	test("no window set keeps the entry and admission exactly as before", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "No window owner",
			slug: "no-window-campaign",
		});

		const entry = await t.query(api.publicPlay.getPublicShareEntry, {
			shareCode: world.shareCode,
		});
		if (entry.state !== "open") throw new Error("expected open entry");
		expect(entry.game.schedule).toEqual({ startsAt: null, endsAt: null });
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).resolves.toMatchObject({ resumed: false });
	});

	test("a session admitted inside the window may finish after the window closes", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "In-flight owner",
			slug: "in-flight-campaign",
			inventory: [{ name: "Quà", rewardType: "physical", quantity: 5, weight: 100 }],
		});
		await patchWindow(t, world, {
			startsAt: null,
			endsAt: Date.now() + 60 * 60 * 1000,
		});
		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});

		// The window closes (or is closed) while the participant is mid-play.
		await patchWindow(t, world, { startsAt: null, endsAt: Date.now() - 1000 });

		// The mid-session guard stays a hard-lifecycle check: the admitted
		// play may finish under its frozen snapshot even though no NEW
		// admission would be accepted now.
		await expect(
			t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: world.shareCode }),
		).rejects.toThrow("Trò chơi đã kết thúc cửa sổ chơi");
		const action = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		expect(action.outcome).toMatchObject({ kind: "reward" });
	});
});

describe("station play-window enforcement", () => {
	test("station start refuses before the window and the state reports the schedule", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Station early owner",
			slug: "station-early",
		});
		const startsAt = Date.now() + 60 * 60 * 1000;
		await patchWindow(t, world, { startsAt, endsAt: null });
		const client = t.withIdentity({ subject: world.ownerId });

		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, {
				campaignGameId: world.wheelGameId,
			}),
		).rejects.toThrow("Trò chơi chưa mở cửa sổ chơi");

		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.schedule).toEqual({ startsAt, endsAt: null, state: "not-started" });
	});

	test("station start refuses after the window ends", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Station late owner",
			slug: "station-late",
		});
		await patchWindow(t, world, { startsAt: null, endsAt: Date.now() - 1000 });
		const client = t.withIdentity({ subject: world.ownerId });

		await expect(
			client.mutation(api.stationPlay.startStationPlaySession, {
				campaignGameId: world.wheelGameId,
			}),
		).rejects.toThrow("Trò chơi đã kết thúc cửa sổ chơi");
	});

	test("station start inside an open window admits with the schedule reported", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Station open owner",
			slug: "station-open",
		});
		const endsAt = Date.now() + 60 * 60 * 1000;
		await patchWindow(t, world, { startsAt: null, endsAt });
		const client = t.withIdentity({ subject: world.ownerId });

		const started = await client.mutation(api.stationPlay.startStationPlaySession, {
			campaignGameId: world.wheelGameId,
		});
		expect(started.resumed).toBe(false);
		const state = await client.query(api.stationPlay.getStationPlayState, {
			campaignGameId: world.wheelGameId,
		});
		expect(state.schedule).toEqual({ startsAt: null, endsAt, state: "open" });
	});
});

describe("configured public copy flow", () => {
	test("configured thank-you and claim instructions freeze into the session and surface at claim", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Copy owner",
			slug: "copy-campaign",
			inventory: [
				{
					name: "Voucher 200k",
					rewardType: "voucher",
					secretCode: "COPY-CODE-1",
					quantity: 3,
					weight: 100,
				},
			],
		});
		const customThankYou = "Cảm ơn chú đã tham gia hội chợ của chúng tôi!";
		const customInstructions = "Chụp màn hình mã này và đưa cho quầy bán hàng A.";
		const client = t.withIdentity({ subject: world.ownerId });
		await client.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({
				noRewardWeight: 0,
				publicCopy: {
					thankYouMessage: customThankYou,
					claimInstructions: customInstructions,
				},
			}),
		});

		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});
		// The snapshot frozen at admission carries the configured copy.
		const sessionRow = await t.run(async (ctx) => ctx.db.get(session.sessionId as Id<"playSessions">));
		expect(sessionRow?.rulesSnapshot?.publicCopy?.thankYouMessage).toBe(customThankYou);
		expect(sessionRow?.rulesSnapshot?.publicCopy?.claimInstructions).toBe(customInstructions);

		await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		const claimed = await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});
		expect(claimed.claim.secretCode).toBe("COPY-CODE-1");
		// Voucher-only instructions come from the frozen copy, not the default.
		expect(claimed.claim.instructions).toBe(customInstructions);

		const detail = await t.query(api.publicPlay.getPublicClaimDetail, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});
		expect(detail?.claim.instructions).toBe(customInstructions);
	});

	test("snapshots written before the fields existed still surface the built-in default", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Legacy copy owner",
			slug: "legacy-copy-campaign",
			inventory: [
				{
					name: "Voucher 100k",
					rewardType: "voucher",
					secretCode: "LEGACY-CODE-1",
					quantity: 3,
					weight: 100,
				},
			],
		});
		const session = await t.mutation(api.publicPlay.startPublicPlaySession, {
			shareCode: world.shareCode,
		});

		// Simulate a pre-4d-2 snapshot: the new copy fields are absent.
		await t.run(async (ctx) => {
			const sessionRow = await ctx.db.get(session.sessionId as Id<"playSessions">);
			if (!sessionRow?.rulesSnapshot?.publicCopy) throw new Error("missing snapshot copy");
			const legacyCopy = { ...sessionRow.rulesSnapshot.publicCopy };
			delete legacyCopy.thankYouMessage;
			delete legacyCopy.claimInstructions;
			await ctx.db.patch(sessionRow._id, {
				rulesSnapshot: { ...sessionRow.rulesSnapshot, publicCopy: legacyCopy },
			});
		});

		const result = await t.mutation(api.publicPlay.playSessionAction, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			action: { type: "spin" },
		});
		if (!result.outcome || result.outcome.kind !== "reward") {
			throw new Error("expected a rewarded play");
		}
		const claimed = await t.mutation(api.publicPlay.claimPublicReward, {
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});
		expect(claimed.claim.secretCode).toBe("LEGACY-CODE-1");
		expect(claimed.claim.instructions).toBe(DEFAULT_PUBLIC_CLAIM_INSTRUCTIONS);
		// The built-in defaults stay exactly the long-standing strings.
		expect(DEFAULT_PUBLIC_THANK_YOU_MESSAGE.length).toBeGreaterThan(0);
	});
});

describe("play window write path", () => {
	test("the owner sets and clears the window; an invalid window is rejected", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Window owner",
			slug: "window-campaign",
		});
		const client = t.withIdentity({ subject: world.ownerId });
		const startsAt = Date.UTC(2026, 9, 1, 0, 0);
		const endsAt = Date.UTC(2026, 9, 2, 0, 0);

		await client.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
			startsAt,
			endsAt,
		});
		let game = await t.run(async (ctx) => ctx.db.get(world.wheelGameId));
		expect(game?.startsAt).toBe(startsAt);
		expect(game?.endsAt).toBe(endsAt);

		// An omitted bound clears that bound (whole-field semantics), so a
		// partial editor can never leave one stale half of a window behind.
		await client.mutation(api.campaignGames.updateCampaignGame, {
			campaignGameId: world.wheelGameId,
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
			endsAt,
		});
		game = await t.run(async (ctx) => ctx.db.get(world.wheelGameId));
		expect(game?.startsAt).toBeUndefined();
		expect(game?.endsAt).toBe(endsAt);

		await expect(
			client.mutation(api.campaignGames.updateCampaignGame, {
				campaignGameId: world.wheelGameId,
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
				startsAt: endsAt,
				endsAt,
			}),
		).rejects.toThrow("Thời gian bắt đầu phải trước thời gian kết thúc");
	});

	test("a foreign identity cannot rewrite another owner's window", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedScheduleWorld(t, {
			ownerName: "Guard owner",
			slug: "guard-campaign",
		});
		const foreign = t.withIdentity({ subject: world.otherOwnerId });

		await expect(
			foreign.mutation(api.campaignGames.updateCampaignGame, {
				campaignGameId: world.wheelGameId,
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
				endsAt: Date.now() + 1000,
			}),
		).rejects.toThrow();

		const game = await t.run(async (ctx) => ctx.db.get(world.wheelGameId));
		expect(game?.startsAt).toBeUndefined();
		expect(game?.endsAt).toBeUndefined();
	});
});
