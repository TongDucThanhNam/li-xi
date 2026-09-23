import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildLuckyWheelGameConfig } from "../lib/gameTemplates";

type Fixture = {
	t: ReturnType<typeof convexTest>;
	ownerId: Id<"users">;
	campaignId: Id<"campaigns">;
	campaignGameId: Id<"campaignGames">;
	shareCode: string;
};

async function fixture(): Promise<Fixture> {
	const t = convexTest({ schema, modules });
	aggregateTest.register(t);
	polarTest.register(t);
	r2Test.register(t);
	shardedCounterTest.register(t);
	const seeded = await t.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Inventory owner" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId, name: "Inventory campaign", slug: "inventory-campaign",
			theme: "brand", status: "active", createdAt: now, updatedAt: now,
		});
		const campaignGameId = await ctx.db.insert("campaignGames", {
			ownerId, campaignId, templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0 }),
			playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
			status: "active", createdAt: now, updatedAt: now,
		});
		const shareCode = "abcdefghijklmnopqrstuv";
		await ctx.db.insert("publicPlayLinks", {
			ownerId, campaignId, campaignGameId, shareCode,
			channel: "review-fixture", status: "active", createdAt: now, updatedAt: now,
		});
		await ctx.db.insert("rewardInventory", {
			ownerId, campaignId, name: "Stored voucher", rewardType: "voucher",
			secretCode: "SYNTHETIC-ORIGINAL-CODE", quantityTotal: 2, quantityRemaining: 2,
			weight: 1, isActive: true, displayOrder: 0, createdAt: now, updatedAt: now,
		});
		return { ownerId, campaignId, campaignGameId, shareCode };
	});
	return { t, ...seeded };
}

async function loadItems(t: Fixture["t"], ownerId: Id<"users">, campaignId: Id<"campaigns">) {
	return t.withIdentity({ subject: ownerId }).query(api.rewardInventory.getRewardInventory, { campaignId });
}

/** The NEW panel payload for an unchanged save: ids/poolTags retained, blank secret omitted. */
function unchangedPayload(items: Array<Record<string, unknown>>) {
	return items.map((item) => ({
		existingItemId: item.id as Id<"rewardInventory">,
		name: item.name as string,
		rewardType: item.rewardType as "cash" | "voucher" | "physical" | "points",
		amount: (item.amount ?? undefined) as number | undefined,
		quantity: item.quantityTotal as number,
		weight: item.weight as number,
		isActive: item.isActive as boolean,
		poolTag: item.poolTag as string,
		secretCode: undefined,
	}));
}

describe("configureRewardInventory row retention", () => {
	test("an unchanged save preserves the stored voucher code for claiming", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(loaded.items[0].hasSecretCode).toBe(true);

		await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: unchangedPayload(loaded.items),
		});

		const reloaded = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(reloaded.items[0].hasSecretCode).toBe(true);
		expect(reloaded.items[0].id).toBe(loaded.items[0].id);
		const started = await f.t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: f.shareCode });
		const capability = { sessionId: started.sessionId, sessionToken: started.sessionToken };
		await f.t.mutation(api.publicPlay.playSessionAction, { ...capability, action: { type: "spin" } });
		const claimed = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
		expect(claimed.claim.secretCode).toBe("SYNTHETIC-ORIGINAL-CODE");
	});

	test("an explicit non-blank code replaces the stored one", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: unchangedPayload(loaded.items).map((item) => ({
				...item,
				secretCode: "REPLACEMENT-CODE",
			})),
		});
		const started = await f.t.mutation(api.publicPlay.startPublicPlaySession, { shareCode: f.shareCode });
		const capability = { sessionId: started.sessionId, sessionToken: started.sessionToken };
		await f.t.mutation(api.publicPlay.playSessionAction, { ...capability, action: { type: "spin" } });
		const claimed = await f.t.mutation(api.publicPlay.claimPublicReward, capability);
		expect(claimed.claim.secretCode).toBe("REPLACEMENT-CODE");
	});

	test("explicit removal intention clears the stored code", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: unchangedPayload(loaded.items).map((item) => ({
				...item,
				removeSecretCode: true,
			})),
		});
		const reloaded = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(reloaded.items[0].hasSecretCode).toBe(false);
	});

	test("a new voucher row (no existing id) carries its own code", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		const result = await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: [
				...unchangedPayload(loaded.items),
				{
					name: "New voucher", rewardType: "voucher" as const,
					secretCode: "BRAND-NEW-CODE", quantity: 5, weight: 5, isActive: true,
				},
			],
		});
		expect(result.ids).toHaveLength(2);
		// The new row got a fresh id, the retained row kept its identity.
		expect(result.ids[0]).toBe(loaded.items[0].id);
		expect(result.ids[1]).not.toBe(loaded.items[0].id);
	});

	test("non-default pool tags round-trip and survive consecutive saves", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		const first = await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: unchangedPayload(loaded.items).map((item) => ({
				...item,
				poolTag: "festival",
			})),
		});
		const afterFirst = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(afterFirst.items[0].poolTag).toBe("festival");
		// Consecutive save uses the returned ids and keeps the pool.
		await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: afterFirst.items.map((item) => ({
				existingItemId: item.id as Id<"rewardInventory">,
				name: item.name, rewardType: item.rewardType as "voucher",
				amount: item.amount ?? undefined,
				quantity: item.quantityTotal, weight: item.weight,
				isActive: item.isActive, poolTag: item.poolTag,
			})),
		});
		void first;
		const afterSecond = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(afterSecond.items[0].poolTag).toBe("festival");
		expect(afterSecond.items[0].id).toBe(afterFirst.items[0].id);
	});

	test("foreign, unknown and duplicate ids are rejected atomically", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		const storedId = loaded.items[0].id as Id<"rewardInventory">;

		// A row belonging to a different campaign/owner.
		const foreignId = await f.t.run(async (ctx) => {
			const now = Date.now();
			const otherOwner = await ctx.db.insert("users", { name: "Other owner" });
			const otherCampaign = await ctx.db.insert("campaigns", {
				ownerId: otherOwner, name: "Other", slug: "other-campaign",
				theme: "brand", status: "active", createdAt: now, updatedAt: now,
			});
			return ctx.db.insert("rewardInventory", {
				ownerId: otherOwner, campaignId: otherCampaign, name: "Foreign",
				rewardType: "voucher", secretCode: "FOREIGN", quantityTotal: 1,
				quantityRemaining: 1, weight: 1, isActive: true,
				displayOrder: 0, createdAt: now, updatedAt: now,
			});
		});

		const validItems = unchangedPayload(loaded.items);
		const cases = [
			{ label: "foreign", items: validItems.map((item) => ({ ...item, existingItemId: foreignId })) },
			{ label: "unknown", items: validItems.map((item) => ({ ...item, existingItemId: "zzzzzzzzzzzzzzzzzzzzzzzzzz" as Id<"rewardInventory"> })) },
			{
				label: "duplicate",
				items: [
					...validItems,
					{ ...validItems[0], name: "Bản sao", existingItemId: storedId },
				],
			},
		];
		for (const testCase of cases) {
			await expect(
				owner.mutation(api.rewardInventory.configureRewardInventory, {
					campaignId: f.campaignId, items: testCase.items,
				}),
			).rejects.toThrow();
		}

		// Atomic: the stored row is untouched after every rejection.
		const reloaded = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(reloaded.items).toHaveLength(1);
		expect(reloaded.items[0].id).toBe(storedId);
		expect(reloaded.items[0].hasSecretCode).toBe(true);
		void storedId;
	});

	test("changing reward type clears incompatible secret and amount fields", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		// Voucher -> cash: stored secret must be dropped; amount becomes required.
		await owner.mutation(api.rewardInventory.configureRewardInventory, {
			campaignId: f.campaignId,
			items: [
				{
					existingItemId: loaded.items[0].id as Id<"rewardInventory">,
					name: loaded.items[0].name, rewardType: "cash" as const,
					amount: 50000, quantity: loaded.items[0].quantityTotal,
					weight: loaded.items[0].weight, isActive: true,
				},
			],
		});
		const reloaded = await loadItems(f.t, f.ownerId, f.campaignId);
		expect(reloaded.items[0].rewardType).toBe("cash");
		expect(reloaded.items[0].hasSecretCode).toBe(false);
		expect(reloaded.items[0].amount).toBe(50000);
	});

	test("existing locks still protect consumed stock and active sessions", async () => {
		const f = await fixture();
		const owner = f.t.withIdentity({ subject: f.ownerId });
		const loaded = await loadItems(f.t, f.ownerId, f.campaignId);
		// Consumed stock: quantityRemaining below total blocks replace-style saves.
		await f.t.run(async (ctx) => {
			const row = await ctx.db.get(loaded.items[0].id as Id<"rewardInventory">);
			if (!row) throw new Error("missing row");
			await ctx.db.patch(row._id, { quantityRemaining: row.quantityTotal - 1 });
		});
		await expect(
			owner.mutation(api.rewardInventory.configureRewardInventory, {
				campaignId: f.campaignId, items: unchangedPayload(loaded.items),
			}),
		).rejects.toThrow("đã có phần thưởng được trao");

		// Active admitted session blocks inventory edits.
		await f.t.run(async (ctx) => {
			const row = await ctx.db.get(loaded.items[0].id as Id<"rewardInventory">);
			if (!row) throw new Error("missing row");
			await ctx.db.patch(row._id, { quantityRemaining: row.quantityTotal });
			const now = Date.now();
			const participantId = await ctx.db.insert("participants", {
				ownerId: f.ownerId, campaignId: f.campaignId,
				token: "lockparticipant0001", createdAt: now, updatedAt: now,
			});
			await ctx.db.insert("playSessions", {
				ownerId: f.ownerId, campaignId: f.campaignId, campaignGameId: f.campaignGameId,
				participantId, channel: "public-link", status: "active",
				sessionToken: "locksessiontoken00000001", startedAt: now,
				createdAt: now, updatedAt: now,
			});
		});
		await expect(
			owner.mutation(api.rewardInventory.configureRewardInventory, {
				campaignId: f.campaignId, items: unchangedPayload(loaded.items),
			}),
		).rejects.toThrow("lượt chơi chưa hoàn thành");
	});
});
