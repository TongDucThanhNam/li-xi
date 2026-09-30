import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
	CAMPAIGN_ASSET_MAX_BYTES,
	CAMPAIGN_ASSET_USAGE_LIMITS,
} from "../lib/assetPolicy";
import { buildLuckyWheelGameConfig, buildQuizGameConfig } from "../lib/gameTemplates";
import { modules } from "./test.setup";

// Asset flows require a configured bucket, and URL signing is pure local
// SigV4 computation once dummy credentials exist, so the renderability gates
// and r2.getUrl work under convexTest without any network. The paid fallback
// tier lifts the per-plan create quotas so tests can seed multiple campaigns
// through the real saveCampaign path.
vi.stubEnv("R2_BUCKET", "test-bucket");
vi.stubEnv("R2_ENDPOINT", "https://r2.tests.example");
vi.stubEnv("R2_ACCESS_KEY_ID", "test-access-key");
vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret-key-000000000000000000000000");
vi.stubEnv("LI_XI_ENABLE_PAID_PLAN_FALLBACK", "true");
vi.stubEnv("LI_XI_DEFAULT_PLAN", "business");

function registerComponents(testContext: ReturnType<typeof convexTest>) {
	aggregateTest.register(testContext);
	r2Test.register(testContext);
	shardedCounterTest.register(testContext);
	polarTest.register(testContext);
}

type AssetWorld = {
	ownerId: Id<"users">;
	foreignOwnerId: Id<"users">;
	campaignId: Id<"campaigns">;
	foreignCampaignId: Id<"campaigns">;
	wheelGameId: Id<"campaignGames">;
	quizGameId: Id<"campaignGames">;
	foreignWheelGameId: Id<"campaignGames">;
};

async function seedAssetWorld(testContext: ReturnType<typeof convexTest>): Promise<AssetWorld> {
	return testContext.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { name: "Asset owner" });
		const foreignOwnerId = await ctx.db.insert("users", { name: "Foreign owner" });
		const campaignId = await ctx.db.insert("campaigns", {
			ownerId,
			name: "Chiến dịch asset",
			slug: "asset-campaign",
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const foreignCampaignId = await ctx.db.insert("campaigns", {
			ownerId: foreignOwnerId,
			name: "Chiến dịch người khác",
			slug: "foreign-campaign",
			theme: "brand",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const wheelGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({}),
			name: "Vòng quay may mắn",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		const quizGameId = await ctx.db.insert("campaignGames", {
			ownerId,
			campaignId,
			templateId: "quiz",
			config: buildQuizGameConfig({
				questions: [
					{ prompt: "Câu hỏi một?", choices: ["A", "B", "C"], correctIndex: 0 },
					{ prompt: "Câu hỏi hai?", choices: ["A", "B", "C"], correctIndex: 1 },
				],
			}),
			name: "Trắc nghiệm tri ân",
			status: "active",
			createdAt: now + 1,
			updatedAt: now + 1,
		});
		const foreignWheelGameId = await ctx.db.insert("campaignGames", {
			ownerId: foreignOwnerId,
			campaignId: foreignCampaignId,
			templateId: "lucky-wheel",
			config: buildLuckyWheelGameConfig({}),
			name: "Vòng quay người khác",
			status: "active",
			createdAt: now,
			updatedAt: now,
		});
		return { ownerId, foreignOwnerId, campaignId, foreignCampaignId, wheelGameId, quizGameId, foreignWheelGameId };
	});
}

/** A fully renderable attached row, as metadata sync + attach would leave it. */
function renderableAssetRow(input: {
	ownerId: Id<"users">;
	campaignId: Id<"campaigns">;
	key: string;
	usage?: "hero" | "brand-logo" | "game-wheel-hub" | "game-quiz-backdrop";
	campaignGameId?: Id<"campaignGames">;
	size?: number;
}) {
	return {
		ownerId: input.ownerId,
		campaignId: input.campaignId,
		bucket: "test-bucket",
		key: input.key,
		contentType: "image/png",
		fileName: `${input.key}.png`,
		metadataSource: "r2" as const,
		metadataSyncedAt: 1,
		size: input.size ?? 2048,
		status: "attached" as const,
		usage: input.usage,
		campaignGameId: input.campaignGameId,
		validatedAt: 1_700_000_000_000,
		createdAt: 1,
	};
}

describe("per-game asset slots (slice 4d-3)", () => {
	test("slot upload authorization: owned game ok, foreign/missing game and unknown kind fail closed", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);
		const asOwner = t.withIdentity({ subject: world.ownerId });

		// Owned game: the reserved row binds the usage kind and the game.
		const upload = await asOwner.mutation(api.assets.generateUploadUrl, {
			campaignId: world.campaignId,
			fileName: "hub.png",
			contentType: "image/png",
			size: 1024,
			usage: "game-wheel-hub",
			campaignGameId: world.wheelGameId,
		});
		const reserved = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("campaignAssets")
				.withIndex("by_key_owner", (q) => q.eq("key", upload.key).eq("ownerId", world.ownerId))
				.collect();
			expect(rows).toHaveLength(1);
			return rows[0];
		});
		expect(reserved).toMatchObject({
			ownerId: world.ownerId,
			campaignId: world.campaignId,
			status: "reserved",
			usage: "game-wheel-hub",
			campaignGameId: world.wheelGameId,
		});

		// A per-game kind without a game id fails closed.
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "hub.png",
				contentType: "image/png",
				size: 1024,
				usage: "game-quiz-backdrop",
			}),
		).rejects.toThrow("Thiếu trò chơi cho tài sản của trò chơi");

		// A foreign owner's game id is rejected.
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "hub.png",
				contentType: "image/png",
				size: 1024,
				usage: "game-quiz-backdrop",
				campaignGameId: world.foreignWheelGameId,
			}),
		).rejects.toThrow("Trò chơi không thuộc chiến dịch này");

		// A game from another of the owner's campaigns is rejected too.
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "hub.png",
				contentType: "image/png",
				size: 1024,
				usage: "game-wheel-hub",
				campaignGameId: world.foreignWheelGameId,
			}),
		).rejects.toThrow("Trò chơi không thuộc chiến dịch này");

		// Unknown kinds fail closed on both upload and attach.
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "x.png",
				contentType: "image/png",
				size: 1024,
				usage: "banner",
			}),
		).rejects.toThrow("Loại tài sản không hợp lệ");
		await expect(
			asOwner.mutation(api.campaigns.attachUploadedAsset, {
				campaignId: world.campaignId,
				key: upload.key,
				usage: "banner",
			}),
		).rejects.toThrow("Loại tài sản không hợp lệ");

		// A foreign owner cannot upload into someone else's campaign.
		const asForeign = t.withIdentity({ subject: world.foreignOwnerId });
		await expect(
			asForeign.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "hub.png",
				contentType: "image/png",
				size: 1024,
				usage: "game-wheel-hub",
				campaignGameId: world.wheelGameId,
			}),
		).rejects.toThrow("Không tìm thấy chiến dịch");
	});

	test("kind-specific policy: logo ceiling at attach kind-check, hero literals unchanged", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);
		const asOwner = t.withIdentity({ subject: world.ownerId });

		// The default call path (no usage) keeps the hero ceiling.
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "hero.png",
				contentType: "image/png",
				size: CAMPAIGN_ASSET_MAX_BYTES + 1,
			}),
		).rejects.toThrow("Ảnh hero tối đa 8 MB");

		// The brand logo enforces its own 2 MB ceiling.
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "logo.png",
				contentType: "image/png",
				size: CAMPAIGN_ASSET_USAGE_LIMITS["brand-logo"].maxBytes + 1,
				usage: "brand-logo",
			}),
		).rejects.toThrow("Logo thương hiệu tối đa 2 MB");
		await expect(
			asOwner.mutation(api.assets.generateUploadUrl, {
				campaignId: world.campaignId,
				fileName: "backdrop.png",
				contentType: "image/png",
				size: CAMPAIGN_ASSET_MAX_BYTES + 1,
				usage: "game-quiz-backdrop",
				campaignGameId: world.quizGameId,
			}),
		).rejects.toThrow("Ảnh nền trắc nghiệm tối đa 8 MB");

		// The reserved kind is authoritative at attach: a hub upload can never
		// attach as the quiz backdrop (checked before any R2 metadata read).
		const hubUpload = await asOwner.mutation(api.assets.generateUploadUrl, {
			campaignId: world.campaignId,
			fileName: "hub.png",
			contentType: "image/png",
			size: 1024,
			usage: "game-wheel-hub",
			campaignGameId: world.wheelGameId,
		});
		await expect(
			asOwner.mutation(api.campaigns.attachUploadedAsset, {
				campaignId: world.campaignId,
				key: hubUpload.key,
				usage: "game-quiz-backdrop",
				campaignGameId: world.quizGameId,
			}),
		).rejects.toThrow("Loại tài sản không khớp lượt upload");
		await expect(
			asOwner.mutation(api.campaigns.attachUploadedAsset, {
				campaignId: world.campaignId,
				key: hubUpload.key,
				usage: "hero",
			}),
		).rejects.toThrow("Loại tài sản không khớp lượt upload");
		// A slot attach without the game id fails closed too.
		await expect(
			asOwner.mutation(api.campaigns.attachUploadedAsset, {
				campaignId: world.campaignId,
				key: hubUpload.key,
				usage: "game-wheel-hub",
			}),
		).rejects.toThrow("Thiếu trò chơi cho tài sản của trò chơi");
	});

	test("attach and remove: slot pointer follows the attached row, detach falls back cleanly", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);
		const asOwner = t.withIdentity({ subject: world.ownerId });
		const asForeign = t.withIdentity({ subject: world.foreignOwnerId });

		const hubKey = "campaign-assets/hub-1.png";
		const backdropKey = "campaign-assets/backdrop-1.png";
		await t.run(async (ctx) => {
			await ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				key: hubKey,
				usage: "game-wheel-hub",
				campaignGameId: world.wheelGameId,
			}));
			await ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				key: backdropKey,
				usage: "game-quiz-backdrop",
				campaignGameId: world.quizGameId,
			}));
		});

		// The editor route context exposes the slot with its asset id; a game
		// without slots exposes an empty list (fallback visuals unchanged).
		const context = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
			campaignGameId: world.wheelGameId,
		});
		expect(context?.campaignGame.assets).toEqual([
			{
				usage: "game-wheel-hub",
				assetId: expect.any(String),
				url: expect.stringContaining(hubKey),
			},
		]);
		const quizContext = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
			campaignGameId: world.quizGameId,
		});
		expect(quizContext?.campaignGame.assets).toEqual([
			{
				usage: "game-quiz-backdrop",
				assetId: expect.any(String),
				url: expect.stringContaining(backdropKey),
			},
		]);

		// Detach is owner-authorized and clears the slot binding.
		const foreignAsset = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("campaignAssets")
				.withIndex("by_key", (q) => q.eq("key", hubKey))
				.collect();
			return rows[0];
		});
		await expect(
			asForeign.mutation(api.campaigns.detachCampaignAsset, { assetId: foreignAsset._id }),
		).rejects.toThrow("Không tìm thấy asset chiến dịch");

		await asOwner.mutation(api.campaigns.detachCampaignAsset, { assetId: foreignAsset._id });
		const detached = await t.run(async (ctx) => await ctx.db.get(foreignAsset._id));
		expect(detached?.status).toBe("attached");
		expect(detached?.usage).toBeUndefined();
		expect(detached?.campaignGameId).toBeUndefined();
		const contextAfterDetach = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
			campaignGameId: world.wheelGameId,
		});
		expect(contextAfterDetach?.campaignGame.assets).toEqual([]);
	});

	test("entry and station payloads expose live slot URLs, absent when unset", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);

		const shareCode = "abcdefghjkmnpqrstuvwxyz234567".slice(0, 22);
		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("publicPlayLinks", {
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				campaignGameId: world.wheelGameId,
				shareCode,
				channel: "qr",
				status: "active",
				createdAt: now,
				updatedAt: now,
			});
		});

		// No slots set: the entry payload carries an empty URL map.
		const before = await t.query(api.publicPlay.getPublicShareEntry, { shareCode });
		if (before.state !== "open") throw new Error("Expected an open entry");
		expect(before.game.assetUrls).toEqual({});

		const hubKey = "campaign-assets/hub-live.png";
		await t.run(async (ctx) => {
			await ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				key: hubKey,
				usage: "game-wheel-hub",
				campaignGameId: world.wheelGameId,
			}));
		});

		const after = await t.query(api.publicPlay.getPublicShareEntry, { shareCode });
		if (after.state !== "open") throw new Error("Expected an open entry");
		expect(Object.keys(after.game.assetUrls)).toEqual(["game-wheel-hub"]);
		expect(after.game.assetUrls["game-wheel-hub"]).toContain(hubKey);

		// Station state carries the same live map.
		const station = await t.withIdentity({ subject: world.ownerId }).query(
			api.stationPlay.getStationPlayState,
			{ campaignGameId: world.wheelGameId },
		);
		expect(station.state).toBe("open");
		expect(station.assetUrls["game-wheel-hub"]).toContain(hubKey);
	});
});

describe("campaign brand identity (slice 4d-3)", () => {
	test("saveCampaign validates brand color, audience tags, note bounds and logo ownership", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);
		const asOwner = t.withIdentity({ subject: world.ownerId });
		const asForeign = t.withIdentity({ subject: world.foreignOwnerId });

		// Create with brand identity metadata.
		const created = await asOwner.mutation(api.campaigns.saveCampaign, {
			name: "Chiến dịch nhận diện",
			status: "draft",
			theme: "brand",
			brandColor: "#FF00aa",
			audienceTags: ["new-customers", "event-guests", "new-customers"],
			audienceNote: "Ưu tiên kênh QR tại sự kiện.",
		});
		const view = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: created.campaignId,
		});
		expect(view).toMatchObject({
			brandColor: "#ff00aa",
			audienceTags: ["new-customers", "event-guests"],
			audienceNote: "Ưu tiên kênh QR tại sự kiện.",
		});

		// Invalid color, unknown tag and over-bound note fail closed.
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				campaignId: created.campaignId,
				name: "Chiến dịch nhận diện",
				status: "draft",
				theme: "brand",
				brandColor: "red",
			}),
		).rejects.toThrow("Màu thương hiệu phải là mã hex hợp lệ");
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				campaignId: created.campaignId,
				name: "Chiến dịch nhận diện",
				status: "draft",
				theme: "brand",
				audienceTags: ["vip-guests"],
			}),
		).rejects.toThrow("Nhóm đối tượng không hợp lệ");
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				campaignId: created.campaignId,
				name: "Chiến dịch nhận diện",
				status: "draft",
				theme: "brand",
				audienceNote: "x".repeat(201),
			}),
		).rejects.toThrow("Ghi chú đối tượng tối đa 200 ký tự");

		// A foreign owner cannot edit the campaign's brand identity.
		await expect(
			asForeign.mutation(api.campaigns.saveCampaign, {
				campaignId: created.campaignId,
				name: "Chiến dịch nhận diện",
				status: "draft",
				theme: "brand",
				brandColor: "#00ff00",
			}),
		).rejects.toThrow("Không tìm thấy chiến dịch");

		// A logo pointer needs a brand-logo asset row of this campaign.
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				campaignId: created.campaignId,
				name: "Chiến dịch nhận diện",
				status: "draft",
				theme: "brand",
			}),
		).resolves.toBeTruthy();

		const heroRow = await t.run(async (ctx) =>
			ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: created.campaignId,
				key: "campaign-assets/hero-only.png",
				usage: "hero",
			})),
		);
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				campaignId: created.campaignId,
				name: "Chiến dịch nhận diện",
				status: "draft",
				theme: "brand",
				logoAssetId: heroRow,
			}),
		).rejects.toThrow("Logo phải thuộc chiến dịch này");

		const logoRow = await t.run(async (ctx) =>
			ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: created.campaignId,
				key: "campaign-assets/logo.png",
				usage: "brand-logo",
			})),
		);
		await asOwner.mutation(api.campaigns.saveCampaign, {
			campaignId: created.campaignId,
			name: "Chiến dịch nhận diện",
			status: "draft",
			theme: "brand",
			logoAssetId: logoRow,
		});
		const viewWithLogo = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: created.campaignId,
		});
		expect(viewWithLogo?.logoAsset?.id).toBe(logoRow);

		// Create-time logo attach fails closed (like the hero asset).
		await expect(
			asOwner.mutation(api.campaigns.saveCampaign, {
				name: "Chiến dịch mới logo",
				status: "draft",
				theme: "brand",
				logoAssetId: logoRow,
			}),
		).rejects.toThrow("Hãy lưu chiến dịch trước khi gắn logo");
	});

	test("brand metadata clears explicitly and stays intact for callers that round-trip it", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);
		const asOwner = t.withIdentity({ subject: world.ownerId });

		const created = await asOwner.mutation(api.campaigns.saveCampaign, {
			name: "Chiến dịch metadata",
			status: "draft",
			theme: "brand",
			brandColor: "#123abc",
			audienceTags: ["staff"],
			audienceNote: "Ghi chú",
		});

		// A save that omits the fields clears them (explicit round-trip
		// contract for editor callers).
		await asOwner.mutation(api.campaigns.saveCampaign, {
			campaignId: created.campaignId,
			name: "Chiến dịch metadata",
			status: "draft",
			theme: "brand",
		});
		const cleared = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: created.campaignId,
		});
		expect(cleared).toMatchObject({ brandColor: null, audienceTags: [], audienceNote: "" });

		// A save that round-trips the values keeps them byte-identical.
		await asOwner.mutation(api.campaigns.saveCampaign, {
			campaignId: created.campaignId,
			name: "Chiến dịch metadata",
			status: "draft",
			theme: "brand",
			brandColor: "#123ABC",
			audienceTags: ["staff"],
			audienceNote: "Ghi chú",
		});
		const restored = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: created.campaignId,
		});
		expect(restored).toMatchObject({
			brandColor: "#123abc",
			audienceTags: ["staff"],
			audienceNote: "Ghi chú",
		});
	});

	test("backward compatibility: campaigns and games without the new fields read unchanged", async () => {
		const t = convexTest(schema, modules);
		registerComponents(t);
		const world = await seedAssetWorld(t);
		const asOwner = t.withIdentity({ subject: world.ownerId });

		// A legacy campaign row has no brand fields; views null/empty them.
		const view = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: world.campaignId,
		});
		expect(view).toMatchObject({
			brandColor: null,
			logoAsset: null,
			audienceTags: [],
			audienceNote: "",
		});

		// A legacy asset row (usage absent) still validates as the campaign
		// hero through campaignView.
		const heroKey = "campaign-assets/legacy-hero.png";
		await t.run(async (ctx) => {
			await ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				key: heroKey,
			}));
			const row = await ctx.db
				.query("campaignAssets")
				.withIndex("by_key", (q) => q.eq("key", heroKey))
				.first();
			await ctx.db.patch(world.campaignId, { heroAssetId: row!._id });
		});
		const viewWithHero = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: world.campaignId,
		});
		expect(viewWithHero?.heroAsset?.key).toBe(heroKey);
		expect(viewWithHero?.heroAsset?.url).toBeTruthy();

		// An oversized-for-its-kind logo row stops rendering even when the
		// campaign row points at it (defense in depth at read time).
		const oversizedLogo = await t.run(async (ctx) =>
			ctx.db.insert("campaignAssets", renderableAssetRow({
				ownerId: world.ownerId,
				campaignId: world.campaignId,
				key: "campaign-assets/logo-huge.png",
				usage: "brand-logo",
				size: 3 * 1024 * 1024,
			})),
		);
		await t.run(async (ctx) => {
			await ctx.db.patch(world.campaignId, { logoAssetId: oversizedLogo });
		});
		const finalView = await asOwner.query(api.campaigns.getCampaignRouteContext, {
			campaignId: world.campaignId,
		});
		expect(finalView?.logoAsset).toBeNull();
	});
});
