import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	ownerCounters,
	recordAnalyticsCounterEvent,
	recordPublicPlayLinkOpen,
} from "./analytics";
import schema from "./schema";
import { campaignGameMetricKey } from "../lib/analyticsPolicy";
import {
	buildLuckyWheelGameConfig,
	buildScratchCardGameConfig,
} from "../lib/gameTemplates";
import { modules } from "./test.setup";

function registerComponents(testContext: ReturnType<typeof convexTest>) {
	aggregateTest.register(testContext);
	r2Test.register(testContext);
	shardedCounterTest.register(testContext);
	polarTest.register(testContext);
}

/** Non-generic factory so helpers keep the schema-resolved index types. */
function buildTest() {
	return convexTest(schema, modules);
}
type ReportingTest = ReturnType<typeof buildTest>;

type SeededWorld = {
	ownerId: Id<"users">;
	otherOwnerId: Id<"users">;
	campaignId: Id<"campaigns">;
	wheelGameId: Id<"campaignGames">;
	scratchGameId: Id<"campaignGames">;
	shareLinkId: Id<"publicPlayLinks">;
	shareCode: string;
};

async function seedReportingWorld(
	testContext: ReportingTest,
): Promise<SeededWorld> {
	return testContext.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Reporting owner" });
		const otherOwnerId = await ctx.db.insert("users", { name: "Reporting owner khác" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId,
			name: "Chiến dịch reporting",
			slug: "reporting-campaign",
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
			name: "Vòng quay reporting",
			playLimits,
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const scratchGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "scratch-card",
			config: buildScratchCardGameConfig({ noRewardWeight: 0, rewardPoolTag: "scratch" }),
			name: "Thẻ cào reporting",
			playLimits,
			status: "active",
			createdAt: now + 1,
			updatedAt: now + 1,
		});
		await ctx.db.insert("rewardInventory", {
			ownerId,
			campaignId,
			name: "Voucher reporting",
			rewardType: "voucher",
			secretCode: "REPORT-CODE-1",
			quantityTotal: 5,
			quantityRemaining: 5,
			weight: 100,
			isActive: true,
			displayOrder: 0,
			poolTag: "wheel",
			createdAt: now,
			updatedAt: now,
		});
		const shareCode = "reportingwheelshare001";
		const shareLinkId = await ctx.db.insert("publicPlayLinks", {
			ownerId,
			campaignId,
			campaignGameId: wheelGameId,
			shareCode,
			channel: "qr",
			label: "Link QR",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		// A second owner whose data must never leak into this owner's scopes.
		await ctx.db.insert("campaigns", {
			ownerId: otherOwnerId,
			name: "Chiến dịch người khác",
			slug: "reporting-campaign-other",
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		return { ownerId, otherOwnerId, campaignId, wheelGameId, scratchGameId, shareLinkId, shareCode };
	});
}

function ownerClient(t: ReportingTest, world: SeededWorld) {
	return t.withIdentity({ subject: world.ownerId });
}

/**
 * Live reference flow: two public opens (one retried), one public
 * start→completion→outcome→claim (startKey + claim replayed), one station
 * open→start→completion→outcome→claim, and one legacy li xi open.
 */
async function runLiveReferenceFlow(t: ReportingTest, world: SeededWorld) {
	const client = ownerClient(t, world);

	// Public-link opens: a same-mount retry plus a second mount.
	await client.mutation(api.publicPlay.recordShareEntryOpen, {
		shareCode: world.shareCode,
		openKey: "public-open-aaaa",
	});
	await client.mutation(api.publicPlay.recordShareEntryOpen, {
		shareCode: world.shareCode,
		openKey: "public-open-aaaa",
	});
	await client.mutation(api.publicPlay.recordShareEntryOpen, {
		shareCode: world.shareCode,
		openKey: "public-open-bbbb",
	});

	// Public play: startKey retry must never allocate a second session.
	const started = await t.mutation(api.publicPlay.startPublicPlaySession, {
		shareCode: world.shareCode,
		displayName: "Khách công khai",
		startKey: "ffffffffffffffffffffffffffffff01",
	});
	const retriedStart = await t.mutation(api.publicPlay.startPublicPlaySession, {
		shareCode: world.shareCode,
		startKey: "ffffffffffffffffffffffffffffff01",
	});
	expect(retriedStart.sessionId).toBe(started.sessionId);
	expect(retriedStart.resumed).toBe(true);
	await t.mutation(api.publicPlay.playSessionAction, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
		action: { type: "spin" },
	});
	await t.mutation(api.publicPlay.claimPublicReward, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
	});
	const claimReplay = await t.mutation(api.publicPlay.claimPublicReward, {
		sessionId: started.sessionId,
		sessionToken: started.sessionToken,
	});
	expect(claimReplay.alreadyClaimed).toBe(true);

	// Station play.
	await client.mutation(api.stationPlay.recordStationPlayOpen, {
		campaignGameId: world.wheelGameId,
		openKey: "station-open-aaaa",
	});
	await client.mutation(api.stationPlay.recordStationPlayOpen, {
		campaignGameId: world.wheelGameId,
		openKey: "station-open-aaaa",
	});
	const stationStarted = await client.mutation(api.stationPlay.startStationPlaySession, {
		campaignGameId: world.wheelGameId,
	});
	await client.mutation(api.publicPlay.playSessionAction, {
		sessionId: stationStarted.sessionId,
		sessionToken: stationStarted.sessionToken,
		action: { type: "spin" },
	});
	await client.mutation(api.publicPlay.claimPublicReward, {
		sessionId: stationStarted.sessionId,
		sessionToken: stationStarted.sessionToken,
	});

	// Legacy li xi open: campaign-scoped but never channel-attributed.
	await t.run(async (ctx) => {
		const sessionId = await ctx.db.insert("drawSessions", {
			ownerId: world.ownerId,
			campaignId: world.campaignId,
			guestNameDisplay: "Khách legacy",
			guestNameNormalized: "khach legacy",
			status: "redeemed",
			createdAt: Date.now(),
		});
		const session = await ctx.db.get(sessionId);
		if (!session) throw new Error("missing legacy session");
		await recordPublicPlayLinkOpen(ctx, session);
	});
}

type ChannelRow = {
	key: string;
	label: string;
	opens: number;
	starts: number;
	completions: number;
	rewardOutcomes: number;
	claims: number;
	conversion: number | null;
};

async function readChannelRows(t: ReportingTest, world: SeededWorld, campaignId?: Id<"campaigns">) {
	const result = await ownerClient(t, world).query(api.analytics.getCampaignChannelBreakdown, {
		...(campaignId ? { campaignId } : {}),
	});
	return result.rows;
}

function rowByKey(rows: ChannelRow[], key: string): ChannelRow {
	const row = rows.find((candidate) => candidate.key === key);
	if (!row) throw new Error(`missing channel row ${key}`);
	return row;
}

describe("per-game / per-channel / per-share-link counters", () => {
	test("live funnel increments every scope exactly once across both channels", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedReportingWorld(t);
		await runLiveReferenceFlow(t, world);

		const gameRows = await ownerClient(t, world).query(api.analytics.getCampaignGameBreakdown, {
			campaignId: world.campaignId,
		});
		// Real template ids, never the hardcoded li-xi fallback.
		expect(gameRows.rows.map((row) => row.gameTemplateId)).toEqual(["lucky-wheel", "scratch-card"]);
		const wheel = gameRows.rows[0];
		expect(wheel.gameName).toBe("Vòng quay reporting");
		// opens = 2 public + 1 station; the retried startKey/openKey/claim never
		// double count anywhere in the funnel.
		expect(wheel).toMatchObject({
			opens: 3,
			starts: 2,
			completions: 2,
			rewardOutcomes: 2,
			claims: 2,
		});
		expect(wheel.conversion).toBeCloseTo(2 / 3, 6);
		expect(gameRows.rows[1]).toMatchObject({
			gameTemplateId: "scratch-card",
			opens: 0,
			starts: 0,
			completions: 0,
			rewardOutcomes: 0,
			claims: 0,
			conversion: null,
		});

		const channelRows = await readChannelRows(t, world, world.campaignId);
		expect(rowByKey(channelRows, "public-link")).toMatchObject({
			label: "Liên kết công khai",
			opens: 2,
			starts: 1,
			completions: 1,
			rewardOutcomes: 1,
			claims: 1,
		});
		expect(rowByKey(channelRows, "station")).toMatchObject({
			label: "Trạm chơi",
			opens: 1,
			starts: 1,
			completions: 1,
			rewardOutcomes: 1,
			claims: 1,
		});
		// Legacy li xi traffic is the unattributed remainder.
		expect(rowByKey(channelRows, "legacy")).toMatchObject({
			label: "li xi (legacy)",
			opens: 1,
			starts: 0,
			completions: 0,
			rewardOutcomes: 0,
			claims: 0,
		});

		const linkRows = await ownerClient(t, world).query(api.analytics.getCampaignShareLinkBreakdown, {
			campaignId: world.campaignId,
		});
		expect(linkRows.rows).toHaveLength(1);
		expect(linkRows.rows[0]).toMatchObject({
			label: "Link QR",
			channel: "qr",
			campaignGameId: world.wheelGameId,
			linkOpens: 2,
			opens: 2,
			starts: 1,
			completions: 1,
			rewardOutcomes: 1,
			claims: 1,
		});
	});

	test("foreign owners never see another owner's breakdown rows", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedReportingWorld(t);
		await runLiveReferenceFlow(t, world);

		// The campaign gate fails closed with the shared message.
		await expect(
			t
				.withIdentity({ subject: world.otherOwnerId })
				.query(api.analytics.getCampaignGameBreakdown, { campaignId: world.campaignId }),
		).rejects.toThrow("Không tìm thấy chiến dịch");

		await expect(
			t.query(api.analytics.getCampaignGameBreakdown, { campaignId: world.campaignId }),
		).rejects.toThrow("Cần đăng nhập để tiếp tục");
		await expect(
			t.query(api.analytics.getCampaignChannelBreakdown, { campaignId: world.campaignId }),
		).rejects.toThrow("Cần đăng nhập để tiếp tục");
	});
});

describe("channel/link counter backfill", () => {
	/**
	 * Simulates the pre-slice event rows: attribution columns present, no
	 * counterScopesVersion, and no counters incremented. Shape-matches the
	 * live reference flow so the backfilled totals must equal the live ones.
	 */
	async function seedPresliceEvents(t: ReportingTest, world: SeededWorld) {
		return t.run(async (ctx) => {
			const now = Date.now();
			const campaignId = await ctx.db.insert("campaigns", {
				ownerId: world.ownerId,
				name: "Chiến dịch cần backfill",
				slug: "backfill-campaign",
				theme: "brand",
				status: "active",
				createdAt: now,
				updatedAt: now,
			});
			const campaignGameId = await ctx.db.insert("campaignGames", {
				ownerId: world.ownerId,
				campaignId,
				templateId: "lucky-wheel",
				config: buildLuckyWheelGameConfig({ noRewardWeight: 0, rewardPoolTag: "wheel" }),
				name: "Vòng quay backfill",
				status: "active",
				createdAt: now,
				updatedAt: now,
			});
			const shareLinkId = await ctx.db.insert("publicPlayLinks", {
				ownerId: world.ownerId,
				campaignId,
				campaignGameId,
				shareCode: "backfillwheelshare01",
				channel: "qr",
				label: "Link backfill",
				status: "active",
				createdAt: now,
				updatedAt: now,
			});
			const rows: Array<{
				eventKey: string;
				metric:
					| "game_open"
					| "game_start"
					| "game_completion"
					| "reward_outcome"
					| "reward_claim"
					| "public_play_link_open";
				channel?: "public-link" | "station";
				/** Attributed but target-less: channel with no campaign/game/link id. */
				unscoped?: boolean;
			}> = [
				{ eventKey: "b:linkopen:public:1", metric: "public_play_link_open", channel: "public-link" },
				{ eventKey: "b:linkopen:public:2", metric: "public_play_link_open", channel: "public-link" },
				{ eventKey: "b:open:public:1", metric: "game_open", channel: "public-link" },
				{ eventKey: "b:open:public:2", metric: "game_open", channel: "public-link" },
				{ eventKey: "b:open:station:1", metric: "game_open", channel: "station" },
				{ eventKey: "b:open:unscoped:1", metric: "game_open", channel: "station", unscoped: true },
				{ eventKey: "b:legacy:open:1", metric: "game_open" },
				{ eventKey: "b:start:public:1", metric: "game_start", channel: "public-link" },
				{ eventKey: "b:start:station:1", metric: "game_start", channel: "station" },
				{ eventKey: "b:completion:public:1", metric: "game_completion", channel: "public-link" },
				{ eventKey: "b:completion:station:1", metric: "game_completion", channel: "station" },
				{ eventKey: "b:outcome:public:1", metric: "reward_outcome", channel: "public-link" },
				{ eventKey: "b:outcome:station:1", metric: "reward_outcome", channel: "station" },
				{ eventKey: "b:claim:public:1", metric: "reward_claim", channel: "public-link" },
				{ eventKey: "b:claim:station:1", metric: "reward_claim", channel: "station" },
			];
			for (const row of rows) {
				const isLegacy = row.eventKey.startsWith("b:legacy");
				// The pre-slice write path: the event row plus the owner/campaign
				// scopes recordAnalyticsCounterEvent has always incremented, plus
				// the campaign-game scope the pre-slice generic layer already
				// wrote. No channel/link scope, no readiness stamp. The unscoped
				// row carries channel attribution but no target ids at all.
				const eventId = await recordAnalyticsCounterEvent(ctx, {
					eventKey: row.eventKey,
					ownerId: world.ownerId,
					campaignId: row.unscoped ? undefined : campaignId,
					campaignGameId:
						isLegacy || row.unscoped ? undefined : campaignGameId,
					shareLinkId:
						row.channel === "public-link" && !row.unscoped ? shareLinkId : undefined,
					channel: row.channel,
					channelLabel: row.channel === "station" ? "Trạm chơi" : row.channel ? "qr" : undefined,
					metric: row.metric,
					source: "live",
				});
				if (!eventId) throw new Error("preslice event key collision");
				if (!isLegacy && !row.unscoped) {
					await ownerCounters.inc(ctx, campaignGameMetricKey(campaignGameId, row.metric));
				}
			}
			return { campaignId, campaignGameId, shareLinkId };
		});
	}

	test("backfill reproduces live-counted totals exactly once", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedReportingWorld(t);
		await runLiveReferenceFlow(t, world);
		const preslice = await seedPresliceEvents(t, world);
		const client = ownerClient(t, world);

		// Dry run previews without mutating: 13 attributed pre-scope rows would
		// backfill (15 seeded minus the legacy row and the unscoped row); the
		// 15 live-flow rows are already stamped or legacy-skipped, so totals
		// stay untouched.
		const dryRun = await client.mutation(api.analytics.backfillOwnerChannelLinkCounters, {
			dryRun: true,
		});
		expect(dryRun).toMatchObject({
			eventsScanned: 15 + 15,
			countersWouldBackfill: 13,
			countersBackfilled: 0,
			skippedAlreadyScoped: 13,
			legacyRowsSkipped: 3,
			skippedUnscoped: 1,
			isDone: true,
		});
		const dryRows = await readChannelRows(t, world, preslice.campaignId);
		expect(rowByKey(dryRows, "public-link").opens).toBe(0);

		// Applied run initializes every scope once and reports completion.
		const applied = await client.mutation(api.analytics.backfillOwnerChannelLinkCounters, {});
		expect(applied).toMatchObject({
			eventsScanned: 15 + 15,
			countersBackfilled: 13,
			skippedAlreadyScoped: 13,
			legacyRowsSkipped: 3,
			skippedUnscoped: 1,
			isDone: true,
			continueCursor: null,
		});

		// The unscoped attributed row (channel without any target id) must NOT
		// absorb the readiness stamp: it stays unstamped and uncounted.
		const unscopedRow = await t.run(async (ctx) => {
			return ctx.db
				.query("analyticsCounterEvents")
				.withIndex("by_eventKey", (q) => q.eq("eventKey", "b:open:unscoped:1"))
				.unique();
		});
		expect(unscopedRow).not.toBeNull();
		expect(unscopedRow?.counterScopesVersion ?? 0).toBe(0);

		// The backfilled campaign's rows must equal the live-counted campaign's.
		const liveRows = await readChannelRows(t, world, world.campaignId);
		const backfilledRows = await readChannelRows(t, world, preslice.campaignId);
		const numericFields = (row: ChannelRow) => ({
			opens: row.opens,
			starts: row.starts,
			completions: row.completions,
			rewardOutcomes: row.rewardOutcomes,
			claims: row.claims,
		});
		for (const key of ["public-link", "station", "legacy"]) {
			expect(numericFields(rowByKey(backfilledRows, key))).toEqual(
				numericFields(rowByKey(liveRows, key)),
			);
		}
		const backfilledLinks = await client.query(api.analytics.getCampaignShareLinkBreakdown, {
			campaignId: preslice.campaignId,
		});
		const liveLinks = await client.query(api.analytics.getCampaignShareLinkBreakdown, {
			campaignId: world.campaignId,
		});
		const numericLinkFields = (row: (typeof backfilledLinks.rows)[number]) => ({
			linkOpens: row.linkOpens,
			opens: row.opens,
			starts: row.starts,
			completions: row.completions,
			rewardOutcomes: row.rewardOutcomes,
			claims: row.claims,
		});
		expect(numericLinkFields(backfilledLinks.rows[0])).toEqual(numericLinkFields(liveLinks.rows[0]));
		const backfilledGames = await client.query(api.analytics.getCampaignGameBreakdown, {
			campaignId: preslice.campaignId,
		});
		expect(backfilledGames.rows[0]).toMatchObject({
			gameTemplateId: "lucky-wheel",
			opens: 3,
			starts: 2,
			completions: 2,
			rewardOutcomes: 2,
			claims: 2,
		});

		// Replays are no-ops: the readiness stamp marks every counted row.
		const replay = await client.mutation(api.analytics.backfillOwnerChannelLinkCounters, {});
		expect(replay).toMatchObject({
			countersBackfilled: 0,
			skippedAlreadyScoped: 13 + 13,
			legacyRowsSkipped: 3,
			skippedUnscoped: 1,
		});
		const rowsAfterReplay = await readChannelRows(t, world, preslice.campaignId);
		expect(rowByKey(rowsAfterReplay, "public-link").opens).toBe(2);
	});

	test("backfill authorization: unauthenticated and foreign-owner callers fail closed", async () => {
		const t = buildTest();
		registerComponents(t);
		const world = await seedReportingWorld(t);
		await expect(
			t.mutation(api.analytics.backfillOwnerChannelLinkCounters, {}),
		).rejects.toThrow("để backfill analytics");
		await expect(
			ownerClient(t, world).mutation(api.analytics.backfillOwnerChannelLinkCounters, {
				ownerId: world.otherOwnerId,
			}),
		).rejects.toThrow("Bạn không có quyền backfill analytics này");
	});
});
