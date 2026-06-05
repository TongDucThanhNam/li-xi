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

describe("campaign logic", () => {
  test("ensureDefaultCampaign creates a new campaign for a new owner", async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t);
    r2Test.register(t);
    shardedCounterTest.register(t);
    polarTest.register(t);
    
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
      name: "Lunar Fortune",
      status: "active",
      theme: "lunar"
    });
  });
});
