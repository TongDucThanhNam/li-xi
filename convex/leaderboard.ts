import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";

function normalizeLimit(limit: number | undefined, defaultValue: number, maxValue: number) {
  if (limit === undefined) {
    return defaultValue;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit phải là số nguyên dương");
  }
  return Math.min(limit, maxValue);
}

async function requireOwnedCampaign(ctx: QueryCtx, ownerId: Id<"users">, campaignId: Id<"campaigns">) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    throw new Error("Không tìm thấy chiến dịch");
  }
  return campaign;
}

function leaderboardRow(item: Doc<"redemptions">, index: number) {
  return {
    rank: index + 1,
    id: item._id,
    guestNameDisplay: item.guestNameDisplay,
    amount: item.amount,
    rarity: item.rarity,
    campaignName: item.campaignNameSnapshot ?? null,
    campaignBrandName: item.campaignBrandNameSnapshot ?? null,
    deliveryMode: item.deliveryMode ?? null,
    createdAt: item.createdAt,
  };
}

function historyRow(item: Doc<"redemptions">) {
  return {
    id: item._id,
    guestNameDisplay: item.guestNameDisplay,
    amount: item.amount,
    rarity: item.rarity,
    campaignName: item.campaignNameSnapshot ?? null,
    campaignBrandName: item.campaignBrandNameSnapshot ?? null,
    deliveryMode: item.deliveryMode ?? null,
    createdAt: item.createdAt,
    envelopeIndex: item.envelopeIndex,
  };
}

export const getOwnerLeaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem thống kê này",
    });

    const limit = normalizeLimit(args.limit, 50, 100);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_amount", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);

    return redemptions.map(leaderboardRow);
  },
});

export const getCampaignLeaderboard = query({
  args: {
    campaignId: v.id("campaigns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem thống kê này",
    });
    await requireOwnedCampaign(ctx, ownerId, args.campaignId);

    const limit = normalizeLimit(args.limit, 50, 100);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_campaign_owner_amount", (q) =>
        q.eq("campaignId", args.campaignId).eq("ownerId", ownerId)
      )
      .order("desc")
      .take(limit);

    return redemptions.map(leaderboardRow);
  },
});

export const getOwnerHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem thống kê này",
    });

    const limit = normalizeLimit(args.limit, 100, 200);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);

    return redemptions.map(historyRow);
  },
});

export const getCampaignHistory = query({
  args: {
    campaignId: v.id("campaigns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem thống kê này",
    });
    await requireOwnedCampaign(ctx, ownerId, args.campaignId);

    const limit = normalizeLimit(args.limit, 100, 200);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_campaign_owner_createdAt", (q) =>
        q.eq("campaignId", args.campaignId).eq("ownerId", ownerId)
      )
      .order("desc")
      .take(limit);

    return redemptions.map(historyRow);
  },
});
