import { v } from "convex/values";
import { query } from "./_generated/server";

function normalizeLimit(limit: number | undefined, defaultValue: number, maxValue: number) {
  if (limit === undefined) {
    return defaultValue;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit phải là số nguyên dương");
  }
  return Math.min(limit, maxValue);
}

export const getOwnerLeaderboard = query({
  args: {
    ownerId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Không tìm thấy chủ ví");
    }

    const limit = normalizeLimit(args.limit, 50, 100);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_amount", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(limit);

    return redemptions.map((item, index) => ({
      rank: index + 1,
      id: item._id,
      guestNameDisplay: item.guestNameDisplay,
      amount: item.amount,
      rarity: item.rarity,
      createdAt: item.createdAt,
    }));
  },
});

export const getOwnerHistory = query({
  args: {
    ownerId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Không tìm thấy chủ ví");
    }

    const limit = normalizeLimit(args.limit, 100, 200);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(limit);

    return redemptions.map((item) => ({
      id: item._id,
      guestNameDisplay: item.guestNameDisplay,
      amount: item.amount,
      rarity: item.rarity,
      createdAt: item.createdAt,
      envelopeIndex: item.envelopeIndex,
    }));
  },
});
