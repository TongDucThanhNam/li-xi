import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

// Import component test helpers
import aggregateTest from "@convex-dev/aggregate/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import polarTest from "@convex-dev/polar/test";

function registerComponents(testContext: ReturnType<typeof convexTest>) {
  aggregateTest.register(testContext);
  r2Test.register(testContext);
  shardedCounterTest.register(testContext);
  polarTest.register(testContext);
}

describe("campaign logic", () => {
  test("ensureDefaultCampaign creates a new campaign for a new owner", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    
    // Create an owner
    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Host 3" });
    });

    const asOwner = t.withIdentity({ subject: ownerId });

    const result = await asOwner.mutation(api.campaigns.ensureDefaultCampaign);
    expect(result).toHaveProperty("campaignId");

    // Check if campaign was created
    const campaign = await t.run(async (ctx) => {
      return await ctx.db.get(result.campaignId);
    });
    
    expect(campaign).toMatchObject({
      ownerId,
      name: "Customer Thank You",
      status: "active",
      theme: "brand"
    });
  });

  test("campaign-game route lookup returns owned context and fails closed for missing or foreign ids", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);

    const [ownerId, foreignOwnerId] = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Route owner" });
      const foreignOwner = await ctx.db.insert("users", { name: "Foreign route owner" });
      return [owner, foreignOwner] as const;
    });
    const asOwner = t.withIdentity({ subject: ownerId });
    const asForeignOwner = t.withIdentity({ subject: foreignOwnerId });

    const ownerCampaign = await asOwner.mutation(api.campaigns.ensureDefaultCampaign);
    const foreignCampaign = await asForeignOwner.mutation(api.campaigns.ensureDefaultCampaign);
    const ownerContext = await asOwner.query(api.campaigns.getCampaignRouteContext, {
      campaignId: ownerCampaign.campaignId,
    });
    const foreignContext = await asForeignOwner.query(api.campaigns.getCampaignRouteContext, {
      campaignId: foreignCampaign.campaignId,
    });
    if (!ownerContext?.campaignGame.id || !foreignContext?.campaignGame.id) {
      throw new Error("Expected default campaign games");
    }
    const ownerCampaignGameId = ownerContext.campaignGame.id;
    const foreignCampaignGameId = foreignContext.campaignGame.id;

    const ownedLookup = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
      campaignGameId: ownerCampaignGameId,
    });
    expect(ownedLookup).toMatchObject({
      campaign: { id: ownerCampaign.campaignId },
      campaignGame: { id: ownerCampaignGameId },
    });

    const foreignLookup = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
      campaignGameId: foreignCampaignGameId,
    });
    expect(foreignLookup).toBeNull();
    const ownedCampaignLookup = await asOwner.query(api.campaigns.getCampaignRouteContext, {
      campaignId: ownerCampaign.campaignId,
    });
    expect(ownedCampaignLookup).toMatchObject({ id: ownerCampaign.campaignId });
    const foreignCampaignLookup = await asOwner.query(api.campaigns.getCampaignRouteContext, {
      campaignId: foreignCampaign.campaignId,
    });
    expect(foreignCampaignLookup).toBeNull();
    await expect(
      asOwner.query(api.campaigns.getCampaignRouteContext, {
        campaignId: "not-a-campaign-id",
      }),
    ).resolves.toBeNull();
    await expect(
      asOwner.query(api.campaigns.getCampaignGameRouteContext, {
        campaignGameId: "not-a-campaign-game-id",
      }),
    ).resolves.toBeNull();
    await expect(
      asOwner.query(api.campaigns.getCampaignGamesRouteContext, {
        campaignId: "not-a-campaign-id",
      }),
    ).resolves.toBeNull();
    await expect(
      asOwner.query(api.setup.getSetupState, {
        campaignId: foreignCampaign.campaignId,
      }),
    ).rejects.toThrow("Không tìm thấy chiến dịch để cấu hình ngân sách");
    await expect(
      asOwner.query(api.setup.getSetupState, {
        campaignId: ownerCampaign.campaignId,
      }),
    ).resolves.toMatchObject({
      budgetScope: {
        campaignId: ownerCampaign.campaignId,
        source: "campaign",
      },
    });

    const ownedGames = await asOwner.query(api.campaigns.getCampaignGamesRouteContext, {
      campaignId: ownerCampaign.campaignId,
    });
    expect(ownedGames?.campaignGames).toHaveLength(1);
    expect(ownedGames?.campaignGames[0]).toMatchObject({
      id: ownerCampaignGameId,
      name: "Lunar Fortune",
    });
    const foreignGames = await asOwner.query(api.campaigns.getCampaignGamesRouteContext, {
      campaignId: foreignCampaign.campaignId,
    });
    expect(foreignGames).toBeNull();

    const secondCampaignGameId = await t.run(async (ctx) => {
      const now = Date.now() + 1;
      return await ctx.db.insert("campaignGames", {
        ownerId,
        campaignId: ownerCampaign.campaignId,
        templateId: "li-xi",
        config: ownerContext.campaignGame.config,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
    });
    const multipleGames = await asOwner.query(api.campaigns.getCampaignGamesRouteContext, {
      campaignId: ownerCampaign.campaignId,
    });
    expect(multipleGames?.campaignGames.map((campaignGame) => campaignGame.id)).toEqual([
      ownerCampaignGameId,
      secondCampaignGameId,
    ]);

    await t.run(async (ctx) => {
      await ctx.db.delete(ownerCampaignGameId);
      await ctx.db.delete(secondCampaignGameId);
    });
    const materializedGame = await asOwner.mutation(api.campaigns.ensureCampaignGameForRoute, {
      campaignId: ownerCampaign.campaignId,
    });
    expect(materializedGame.campaignGameId).not.toBe(ownerCampaignGameId);
    const materializedGames = await asOwner.query(api.campaigns.getCampaignGamesRouteContext, {
      campaignId: ownerCampaign.campaignId,
    });
    expect(materializedGames?.campaignGames).toHaveLength(1);
    expect(materializedGames?.campaignGames[0]?.id).toBe(materializedGame.campaignGameId);

    const missingLookup = await asOwner.query(api.campaigns.getCampaignGameRouteContext, {
      campaignGameId: ownerCampaignGameId,
    });
    expect(missingLookup).toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.delete(ownerCampaign.campaignId);
    });
    const missingCampaignLookup = await asOwner.query(api.campaigns.getCampaignRouteContext, {
      campaignId: ownerCampaign.campaignId,
    });
    expect(missingCampaignLookup).toBeNull();
  });
});
