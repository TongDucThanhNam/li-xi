import aggregateTest from "@convex-dev/aggregate/test";
import polarTest from "@convex-dev/polar/test";
import r2Test from "@convex-dev/r2/test";
import shardedCounterTest from "@convex-dev/sharded-counter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const PUBLIC_CODE = "abcdefabcdefabcdefabcdef";

function registerComponents(testContext: ReturnType<typeof convexTest>) {
  aggregateTest.register(testContext);
  r2Test.register(testContext);
  shardedCounterTest.register(testContext);
  polarTest.register(testContext);
}

async function seedPublicPlaySession(testContext: ReturnType<typeof convexTest>) {
  const now = Date.now();
  return testContext.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { name: "Public play owner" });
    const campaignId = await ctx.db.insert("campaigns", {
      ownerId,
      name: "Public play campaign",
      slug: "public-play-campaign",
      theme: "lunar",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("ownerBudgets", {
      ownerId,
      campaignId,
      totalBudget: 300_000,
      remainingBudget: 300_000,
      isSetupCompleted: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("budgetItems", {
      ownerId,
      campaignId,
      amount: 100_000,
      rarity: "common",
      initialQuantity: 3,
      remainingQuantity: 3,
      displayOrder: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const sessionId = await ctx.db.insert("drawSessions", {
      ownerId,
      campaignId,
      publicCode: PUBLIC_CODE,
      publicCodeExpiresAt: now + 60_000,
      deliveryMode: "link",
      guestNameDisplay: "Khách thử nghiệm",
      guestNameNormalized: "khách thử nghiệm",
      status: "pending",
      createdAt: now,
    });

    return { campaignId, ownerId, sessionId };
  });
}

describe("public play compatibility", () => {
  test("valid links resolve while malformed, expired, and completed links fail closed", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { sessionId } = await seedPublicPlaySession(t);

    const valid = await t.query(api.draw.getPublicSession, { publicCode: PUBLIC_CODE });
    expect(valid).toMatchObject({
      gameTemplateId: "li-xi",
      guestNameDisplay: "Khách thử nghiệm",
      playSessionStatus: "pending",
    });
    expect(valid?.rewardPool).toEqual([
      {
        amount: 100_000,
        rarity: "common",
        remainingQuantity: 1,
      },
    ]);
    await expect(
      t.query(api.draw.getPublicSession, { publicCode: "not-a-code" }),
    ).resolves.toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, { publicCodeExpiresAt: Date.now() - 1 });
    });
    await expect(
      t.query(api.draw.getPublicSession, { publicCode: PUBLIC_CODE }),
    ).resolves.toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, {
        publicCodeExpiresAt: Date.now() + 60_000,
        status: "redeemed",
        redeemedAt: Date.now(),
      });
    });
    await expect(
      t.query(api.draw.getPublicSession, { publicCode: PUBLIC_CODE }),
    ).resolves.toBeNull();
  });

  test("duplicate opens and redemption replays remain idempotent", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { sessionId } = await seedPublicPlaySession(t);

    await expect(
      t.mutation(api.draw.recordPublicPlayOpen, { publicCode: PUBLIC_CODE }),
    ).resolves.toMatchObject({ recorded: true });
    await expect(
      t.mutation(api.draw.recordPublicPlayOpen, { publicCode: PUBLIC_CODE }),
    ).resolves.toMatchObject({ recorded: true });

    const openEvents = await t.run(async (ctx) => {
      return ctx.db
        .query("analyticsCounterEvents")
        .collect()
        .then((events) =>
          events.filter((event) => event.eventKey.includes(String(sessionId))),
        );
    });
    expect(openEvents.map((event) => event.metric).sort()).toEqual([
      "game_open",
      "public_play_link_open",
    ]);

    await expect(
      t.mutation(api.draw.redeemPublicSession, {
        publicCode: PUBLIC_CODE,
        envelopeIndex: 0,
      }),
    ).resolves.toMatchObject({
      success: true,
      playSessionCompleted: true,
      amount: 100_000,
      rarity: "common",
    });
    await expect(
      t.query(api.draw.getPublicSession, { publicCode: PUBLIC_CODE }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(api.draw.recordPublicPlayOpen, { publicCode: PUBLIC_CODE }),
    ).resolves.toEqual({ recorded: false });
    await expect(
      t.mutation(api.draw.redeemPublicSession, {
        publicCode: PUBLIC_CODE,
        envelopeIndex: 0,
      }),
    ).rejects.toThrow("Link rút không hợp lệ hoặc đã hết hiệu lực");

    const persisted = await t.run(async (ctx) => {
      const redemptions = await ctx.db.query("redemptions").collect();
      const session = await ctx.db.get(sessionId as Id<"drawSessions">);
      const openEventCount = (await ctx.db.query("analyticsCounterEvents").collect()).filter(
        (event) =>
          event.eventKey.includes(String(sessionId)) &&
          (event.metric === "game_open" || event.metric === "public_play_link_open"),
      ).length;
      return { openEventCount, redemptions, session };
    });
    expect(persisted.session?.status).toBe("redeemed");
    expect(persisted.redemptions).toHaveLength(1);
    expect(persisted.openEventCount).toBe(2);
  });
});
