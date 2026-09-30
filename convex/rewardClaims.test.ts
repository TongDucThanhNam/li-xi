import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
	buildLuckyWheelGameConfig,
	buildScratchCardGameConfig,
} from "../lib/gameTemplates";
import { modules } from "./test.setup";

function registerComponents(testContext: ClaimsTest) {
	aggregateTest.register(testContext);
	r2Test.register(testContext);
	shardedCounterTest.register(testContext);
	polarTest.register(testContext);
}

/** Non-generic factory so helpers keep the schema-resolved index types. */
function buildTest() {
	return convexTest(schema, modules);
}
type ClaimsTest = ReturnType<typeof buildTest>;

type InventorySeed = {
	name: string;
	rewardType: "cash" | "voucher" | "physical" | "points";
	amount?: number;
	secretCode?: string;
	quantity: number;
	weight: number;
	poolTag: "wheel" | "scratch";
};

type SeededWorld = {
	ownerId: Id<"users">;
	otherOwnerId: Id<"users">;
	campaignId: Id<"campaigns">;
	foreignCampaignId: Id<"campaigns">;
	wheelGameId: Id<"campaignGames">;
	scratchGameId: Id<"campaignGames">;
};

/**
 * One owner campaign with two generic games on SEPARATE reward pools (wheel
 * → "wheel", scratch → "scratch"), so each play's awarded item is
 * deterministic. A second owner's campaign must never be reachable
 * cross-tenant.
 */
async function seedClaimsWorld(
	testContext: ClaimsTest,
	options: { inventory?: InventorySeed[] } = {},
): Promise<SeededWorld> {
	return testContext.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Claims owner" });
		const otherOwnerId = await ctx.db.insert("users", { name: "Claims owner khác" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId,
			name: "Chiến dịch claims",
			slug: "claims-campaign",
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const foreignCampaignId = await ctx.db.insert("campaigns", {
			ownerId: otherOwnerId,
			name: "Chiến dịch người khác",
			slug: "claims-campaign-other",
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const playLimits = { maxSessionsPerParticipant: 5, maxTotalSessions: null };
		const wheelGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({ noRewardWeight: 0, rewardPoolTag: "wheel" }),
			name: "Vòng quay claims",
			playLimits,
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const scratchGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "scratch-card",
			config: buildScratchCardGameConfig({
				noRewardWeight: 0,
				coverStyle: "teal",
				rewardPoolTag: "scratch",
			}),
			name: "Thẻ cào claims",
			playLimits,
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
		return { ownerId, otherOwnerId, campaignId, foreignCampaignId, wheelGameId, scratchGameId };
	});
}

function ownerClient(t: ClaimsTest, world: SeededWorld) {
	return t.withIdentity({ subject: world.ownerId });
}

function foreignClient(t: ClaimsTest, world: SeededWorld) {
	return t.withIdentity({ subject: world.otherOwnerId });
}

/** Valid [a-z0-9]{22} share codes derived from short seeds. */
function testShareCode(seed: string) {
	return (seed + "0".repeat(22)).slice(0, 22);
}

async function insertShareLink(
	t: ClaimsTest,
	world: SeededWorld,
	campaignGameId: Id<"campaignGames">,
	seed: string,
) {
	return t.run(async (ctx) =>
		ctx.db.insert("publicPlayLinks", {
			ownerId: world.ownerId,
			campaignId: world.campaignId,
			campaignGameId,
			shareCode: testShareCode(seed),
			channel: "qr",
			label: "Link QR",
			status: "active",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}),
	);
}

let startKeyCounter = 0;
function nextStartKey() {
	startKeyCounter += 1;
	return (startKeyCounter.toString(16).padStart(4, "0") + "a".repeat(28)).slice(0, 32);
}

type CreatedClaim = Id<"rewardClaims">;
type PlayAction = "spin" | "scratch-reveal";

/** Resolves the single claim of a play session through its 1:1 outcome. */
async function resolveSessionClaimId(
	t: ClaimsTest,
	sessionId: string,
): Promise<CreatedClaim> {
	return t.run(async (ctx) => {
		const outcome = await ctx.db
			.query("rewardOutcomes")
			.withIndex("by_playSession", (q) => q.eq("playSessionId", sessionId as Id<"playSessions">))
			.unique();
		if (!outcome) throw new Error("missing outcome");
		const claim = await ctx.db
			.query("rewardClaims")
			.withIndex("by_outcome", (q) => q.eq("outcomeId", outcome._id))
			.unique();
		if (!claim) throw new Error("missing claim");
		return claim._id;
	});
}

/** A valid-format claim id that resolves to nothing (created then deleted). */
async function deletedCopyOfClaim(
	t: ClaimsTest,
	claimId: CreatedClaim,
): Promise<CreatedClaim> {
	return t.run(async (ctx) => {
		const claim = await ctx.db.get(claimId);
		if (!claim) throw new Error("missing claim to copy");
		const { _id: droppedId, _creationTime: droppedCreationTime, ...fields } = claim;
		void droppedId;
		void droppedCreationTime;
		const id = await ctx.db.insert("rewardClaims", fields);
		await ctx.db.delete(id);
		return id;
	});
}

/** Runs one full public-link play → claim through the real mutations. */
async function claimViaPublicLink(
	t: ClaimsTest,
	world: SeededWorld,
	campaignGameId: Id<"campaignGames">,
	seed: string,
	action: PlayAction,
): Promise<CreatedClaim> {
	const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
		shareCode: testShareCode(seed),
		displayName: "Khách " + seed,
		startKey: nextStartKey(),
	});
	await t.mutation(api.publicPlay.playSessionAction, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
		action: { type: action },
	});
	await t.mutation(api.publicPlay.claimPublicReward, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
	});
	return resolveSessionClaimId(t, started.sessionId);
}

/** Runs one full station play → claim through the real owner mutations. */
async function claimViaStation(
	t: ClaimsTest,
	world: SeededWorld,
	campaignGameId: Id<"campaignGames">,
	action: PlayAction,
): Promise<CreatedClaim> {
	const client = ownerClient(t, world);
	const started = await client.mutation(api.stationPlay.startStationPlaySession, {
		campaignGameId,
	});
	await client.mutation(api.publicPlay.playSessionAction, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
		action: { type: action },
	});
	await client.mutation(api.publicPlay.claimPublicReward, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
	});
	return resolveSessionClaimId(t, started.sessionId);
}

/** Deterministic ordering for claims created within the same millisecond. */
async function stampClaimedAt(t: ClaimsTest, claims: CreatedClaim[]) {
	await t.run(async (ctx) => {
		for (const [index, claimId] of claims.entries()) {
			await ctx.db.patch(claimId, { claimedAt: 1_700_000_000_000 + index });
		}
	});
}

function listClaims(t: ClaimsTest, world: SeededWorld) {
	return (
		filters: {
			campaignGameId?: Id<"campaignGames">;
			fulfilmentState?: "pending" | "fulfilled";
			channel?: "public-link" | "station";
			rewardType?: "cash" | "voucher" | "physical" | "points" | "none";
			codeSearch?: string;
		} = {},
	) =>
		ownerClient(t, world).query(api.rewardClaims.listRewardClaims, {
			campaignId: world.campaignId,
			paginationOpts: { numItems: 50, cursor: null },
			...filters,
		});
}

describe("reward claims list", () => {
	test("list rows are scoped, paginated, and carry masked codes only", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{
					name: "Voucher quà tặng",
					rewardType: "voucher",
					secretCode: "VCHR-AAAA-1234",
					quantity: 5,
					weight: 100,
					poolTag: "wheel",
				},
				{
					name: "Tiền mặt",
					rewardType: "cash",
					amount: 50000,
					quantity: 5,
					weight: 100,
					poolTag: "scratch",
				},
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "wheel01");
		await insertShareLink(t, world, world.scratchGameId, "scratch1");
		const voucherClaim = await claimViaPublicLink(t, world, world.wheelGameId, "wheel01", "spin");
		const cashClaim = await claimViaPublicLink(t, world, world.scratchGameId, "scratch1", "scratch-reveal");
		const stationClaim = await claimViaStation(t, world, world.scratchGameId, "scratch-reveal");
		expect(new Set([voucherClaim, cashClaim, stationClaim]).size).toBe(3);
		await stampClaimedAt(t, [voucherClaim, cashClaim, stationClaim]);

		const list = await ownerClient(t, world).query(api.rewardClaims.listRewardClaims, {
			campaignId: world.campaignId,
			paginationOpts: { numItems: 2, cursor: null },
		});
		expect(list.page).toHaveLength(2);
		expect(list.isDone).toBe(false);
		// Newest claim first (the station claim was stamped last).
		expect(list.page[0].claimId).toBe(stationClaim);
		expect(list.page[0].participantDisplayName).toBeNull();
		expect(list.page[0].game).toMatchObject({ name: "Thẻ cào claims", templateId: "scratch-card" });
		expect(list.page[0].channel).toBe("station");
		expect(list.page[0].channelLabel).toBe("Trạm chơi");
		expect(list.page[0].fulfilmentState).toBe("pending");
		expect(list.page[0].fulfilledAt).toBeNull();

		const secondPage = await ownerClient(t, world).query(api.rewardClaims.listRewardClaims, {
			campaignId: world.campaignId,
			paginationOpts: { numItems: 2, cursor: list.continueCursor },
		});
		expect(secondPage.page.map((row) => row.claimId)).toEqual([voucherClaim]);
		expect(secondPage.page[0].participantDisplayName).toBe("Khách wheel01");
		expect(secondPage.isDone).toBe(true);

		// The full code NEVER appears in any list payload — only the mask.
		const everything = JSON.stringify([list, secondPage]);
		expect(everything).not.toContain("VCHR-AAAA-1234");
		// The first page's cash claim exposes no code at all.
		expect(list.page[1].maskedCode).toBeNull();
		const voucherRow = secondPage.page[0];
		expect(voucherRow.reward).toMatchObject({
			label: "Voucher quà tặng",
			rewardType: "voucher",
		});
		expect(voucherRow.maskedCode).toBe("••••1234");
	});

	test("authorization: foreign and unauthenticated callers fail closed", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{ name: "Quà", rewardType: "physical", quantity: 3, weight: 100, poolTag: "wheel" },
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "shared01");
		await claimViaPublicLink(t, world, world.wheelGameId, "shared01", "spin");

		// Foreign client against the owner's campaign: fail closed.
		await expect(
			foreignClient(t, world).query(api.rewardClaims.listRewardClaims, {
				campaignId: world.campaignId,
				paginationOpts: { numItems: 50, cursor: null },
			}),
		).rejects.toThrow("Không tìm thấy chiến dịch");
		await expect(
			t.query(api.rewardClaims.listRewardClaims, {
				campaignId: world.campaignId,
				paginationOpts: { numItems: 50, cursor: null },
			}),
		).rejects.toThrow("Cần đăng nhập để tiếp tục");

		// Missing (valid but deleted) or foreign game scope: shared fail-closed
		// message — malformed ids are rejected by the validator even earlier.
		const missingGameId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("campaignGames", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				templateId: "lucky-wheel",
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0, rewardPoolTag: "wheel" }),
				status: "active",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.delete(id);
			return id;
		});
		await expect(
			ownerClient(t, world).query(api.rewardClaims.listRewardClaims, {
				campaignId: world.campaignId,
				campaignGameId: missingGameId,
				paginationOpts: { numItems: 50, cursor: null },
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");
		const foreignGame = await t.run(async (ctx) => {
			const campaigns = await ctx.db.query("campaigns").collect();
			const foreignCampaign = campaigns.find((row) => row.ownerId === world.otherOwnerId);
			if (!foreignCampaign) throw new Error("missing foreign campaign");
			return ctx.db.insert("campaignGames", {
				ownerId: world.otherOwnerId,
				campaignId: foreignCampaign._id,
				templateId: "lucky-wheel",
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0, rewardPoolTag: "wheel" }),
				status: "active",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});
		await expect(
			ownerClient(t, world).query(api.rewardClaims.listRewardClaims, {
				campaignId: world.campaignId,
				campaignGameId: foreignGame,
				paginationOpts: { numItems: 50, cursor: null },
			}),
		).rejects.toThrow("Không tìm thấy trò chơi");
	});

	test("filters: fulfilment state, channel, reward type, and per-game scope", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{
					name: "Voucher quà tặng",
					rewardType: "voucher",
					secretCode: "VCHR-BBBB-5678",
					quantity: 5,
					weight: 100,
					poolTag: "wheel",
				},
				{ name: "Vật phẩm", rewardType: "physical", quantity: 5, weight: 100, poolTag: "scratch" },
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "wheel02");
		const voucherClaim = await claimViaPublicLink(t, world, world.wheelGameId, "wheel02", "spin");
		const physicalClaim = await claimViaStation(t, world, world.scratchGameId, "scratch-reveal");
		await stampClaimedAt(t, [voucherClaim, physicalClaim]);

		const list = listClaims(t, world);

		// Channel filter.
		const stationRows = await list({ channel: "station" });
		expect(stationRows.page.map((row) => row.claimId)).toEqual([physicalClaim]);
		const publicRows = await list({ channel: "public-link" });
		expect(publicRows.page.map((row) => row.claimId)).toEqual([voucherClaim]);

		// Reward type filter (outcome-derived).
		const voucherRows = await list({ rewardType: "voucher" });
		expect(voucherRows.page.map((row) => row.claimId)).toEqual([voucherClaim]);
		const physicalRows = await list({ rewardType: "physical" });
		expect(physicalRows.page.map((row) => row.claimId)).toEqual([physicalClaim]);

		// Status filter before fulfilment: everything is pending.
		const pendingBefore = await list({ fulfilmentState: "pending" });
		expect(pendingBefore.page).toHaveLength(2);
		expect((await list({ fulfilmentState: "fulfilled" })).page).toHaveLength(0);

		// Fulfil the voucher claim: status + combined filters follow.
		await ownerClient(t, world).mutation(api.rewardClaims.markRewardClaimFulfilled, {
			claimId: voucherClaim,
		});
		const fulfilledRows = await list({ fulfilmentState: "fulfilled" });
		expect(fulfilledRows.page.map((row) => row.claimId)).toEqual([voucherClaim]);
		const fulfilledVoucher = await list({ fulfilmentState: "fulfilled", rewardType: "voucher" });
		expect(fulfilledVoucher.page).toHaveLength(1);
		const pendingAfter = await list({ fulfilmentState: "pending" });
		expect(pendingAfter.page.map((row) => row.claimId)).toEqual([physicalClaim]);

		// Per-game scope: each game carries exactly its own claim.
		const scratchRows = await list({ campaignGameId: world.scratchGameId });
		expect(scratchRows.page.map((row) => row.claimId)).toEqual([physicalClaim]);
		const wheelRows = await list({ campaignGameId: world.wheelGameId });
		expect(wheelRows.page.map((row) => row.claimId)).toEqual([voucherClaim]);
	});

	test("exact-code search matches the whole code, trimmed and case-insensitive", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{
					name: "Voucher quà tặng",
					rewardType: "voucher",
					secretCode: "VCHR-CCCC-9012",
					quantity: 5,
					weight: 100,
					poolTag: "wheel",
				},
				{ name: "Vật phẩm", rewardType: "physical", quantity: 5, weight: 100, poolTag: "scratch" },
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "wheel03");
		const voucherClaim = await claimViaPublicLink(t, world, world.wheelGameId, "wheel03", "spin");
		await claimViaStation(t, world, world.scratchGameId, "scratch-reveal");
		await stampClaimedAt(t, [voucherClaim]);

		const list = listClaims(t, world);
		const exact = await list({ codeSearch: "  vchr-cccc-9012  " });
		expect(exact.page.map((row) => row.claimId)).toEqual([voucherClaim]);
		// Substrings never match; misses return an empty page, not an error.
		expect((await list({ codeSearch: "VCHR-CCCC" })).page).toHaveLength(0);
		expect((await list({ codeSearch: "KHONG-TON-TAI" })).page).toHaveLength(0);
		// An empty search is no filter at all.
		expect((await list({ codeSearch: "" })).page).toHaveLength(2);
	});
});

describe("reward claim code reveal", () => {
	test("reveal returns the full immutable code to the owner only", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{
					name: "Voucher bi mat",
					rewardType: "voucher",
					secretCode: "VCHR-DDDD-3456",
					quantity: 5,
					weight: 100,
					poolTag: "wheel",
				},
				{ name: "Vật phẩm", rewardType: "physical", quantity: 5, weight: 100, poolTag: "scratch" },
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "wheel04");
		const voucherClaim = await claimViaPublicLink(t, world, world.wheelGameId, "wheel04", "spin");
		const physicalClaim = await claimViaStation(t, world, world.scratchGameId, "scratch-reveal");

		const revealed = await ownerClient(t, world).query(api.rewardClaims.revealRewardClaimCode, {
			claimId: voucherClaim,
		});
		expect(revealed.claim.secretCode).toBe("VCHR-DDDD-3456");
		expect(revealed.claim.rewardType).toBe("voucher");

		// Non-voucher outcomes reveal null, never another row's code.
		const physicalReveal = await ownerClient(t, world).query(api.rewardClaims.revealRewardClaimCode, {
			claimId: physicalClaim,
		});
		expect(physicalReveal.claim.secretCode).toBeNull();

		// Missing (created then deleted) and foreign claims share one
		// fail-closed message — malformed ids are rejected by the validator.
		const missingClaimId = await deletedCopyOfClaim(t, voucherClaim);
		await expect(
			ownerClient(t, world).query(api.rewardClaims.revealRewardClaimCode, {
				claimId: missingClaimId,
			}),
		).rejects.toThrow("Không tìm thấy yêu cầu nhận thưởng");
		await expect(
			foreignClient(t, world).query(api.rewardClaims.revealRewardClaimCode, {
				claimId: voucherClaim,
			}),
		).rejects.toThrow("Không tìm thấy yêu cầu nhận thưởng");
		await expect(
			t.query(api.rewardClaims.revealRewardClaimCode, { claimId: voucherClaim }),
		).rejects.toThrow("Cần đăng nhập để tiếp tục");
	});
});

describe("reward claim fulfilment", () => {
	test("mark fulfilled writes the audit fields once and is idempotent", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{ name: "Vật phẩm", rewardType: "physical", quantity: 5, weight: 100, poolTag: "wheel" },
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "wheel05");
		const claim = await claimViaPublicLink(t, world, world.wheelGameId, "wheel05", "spin");

		const marked = await ownerClient(t, world).mutation(api.rewardClaims.markRewardClaimFulfilled, {
			claimId: claim,
		});
		expect(marked.fulfilmentState).toBe("fulfilled");
		expect(marked.fulfilledAt).toBeTypeOf("number");
		const storedAfterMark = await t.run(async (ctx) => ctx.db.get(claim));
		expect(storedAfterMark?.fulfilmentState).toBe("fulfilled");
		expect(storedAfterMark?.fulfilledBy).toBe(world.ownerId);
		expect(storedAfterMark?.fulfilledAt).toBe(marked.fulfilledAt);

		// Idempotent replay never rewrites the original audit timestamp.
		const replay = await ownerClient(t, world).mutation(api.rewardClaims.markRewardClaimFulfilled, {
			claimId: claim,
		});
		expect(replay.fulfilledAt).toBe(marked.fulfilledAt);
		const storedAfterReplay = await t.run(async (ctx) => ctx.db.get(claim));
		expect(storedAfterReplay?.fulfilledAt).toBe(marked.fulfilledAt);
	});

	test("undo clears the audit fields and is idempotent; foreign claims fail closed", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedClaimsWorld(t, {
			inventory: [
				{ name: "Vật phẩm", rewardType: "physical", quantity: 5, weight: 100, poolTag: "wheel" },
			],
		});
		await insertShareLink(t, world, world.wheelGameId, "wheel06");
		const claim = await claimViaPublicLink(t, world, world.wheelGameId, "wheel06", "spin");

		await ownerClient(t, world).mutation(api.rewardClaims.markRewardClaimFulfilled, {
			claimId: claim,
		});
		const undone = await ownerClient(t, world).mutation(api.rewardClaims.undoRewardClaimFulfilment, {
			claimId: claim,
		});
		expect(undone.fulfilmentState).toBe("pending");
		const stored = await t.run(async (ctx) => ctx.db.get(claim));
		expect(stored?.fulfilmentState).toBe("pending");
		expect(stored?.fulfilledAt).toBeUndefined();
		expect(stored?.fulfilledBy).toBeUndefined();

		// Undo on a pending claim is a no-op, and replays stay pending.
		const replayUndo = await ownerClient(t, world).mutation(api.rewardClaims.undoRewardClaimFulfilment, {
			claimId: claim,
		});
		expect(replayUndo.fulfilmentState).toBe("pending");
		const storedAfterReplay = await t.run(async (ctx) => ctx.db.get(claim));
		expect(storedAfterReplay?.fulfilledAt).toBeUndefined();

		// Authorization: missing (created then deleted) and foreign claims
		// share one message on both mutations; malformed ids never pass the
		// validator, and unauthenticated callers are rejected outright.
		const missingClaimId = await deletedCopyOfClaim(t, claim);
		for (const fulfilmentMutation of [
			api.rewardClaims.markRewardClaimFulfilled,
			api.rewardClaims.undoRewardClaimFulfilment,
		]) {
			await expect(
				ownerClient(t, world).mutation(fulfilmentMutation, {
					claimId: missingClaimId,
				}),
			).rejects.toThrow("Không tìm thấy yêu cầu nhận thưởng");
			await expect(
				foreignClient(t, world).mutation(fulfilmentMutation, { claimId: claim }),
			).rejects.toThrow("Không tìm thấy yêu cầu nhận thưởng");
			await expect(
				t.mutation(fulfilmentMutation, { claimId: claim }),
			).rejects.toThrow("Cần đăng nhập để tiếp tục");
		}
	});
});
