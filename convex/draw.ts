import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  ENVELOPE_COUNT,
  normalizeGuestName,
  validateGuestName,
  validatePin,
} from "../lib/lixiPolicy";
import { verifyPinHash } from "./security";

type ConvexCtx = QueryCtx | MutationCtx;

function validateEnvelopeIndex(envelopeIndex: number) {
  if (!Number.isInteger(envelopeIndex) || envelopeIndex < 0 || envelopeIndex >= ENVELOPE_COUNT) {
    throw new Error(`Phong bao không hợp lệ (0-${ENVELOPE_COUNT - 1})`);
  }
  return envelopeIndex;
}

async function getOwnerBudgetOrThrow(ctx: ConvexCtx, ownerId: Id<"users">): Promise<Doc<"ownerBudgets">> {
  const budget = await ctx.db
    .query("ownerBudgets")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .first();

  if (!budget || !budget.isSetupCompleted) {
    throw new Error("Chủ ví chưa hoàn tất cấu hình ngân sách");
  }

  return budget;
}

async function getAvailableBudgetItems(
  ctx: ConvexCtx,
  ownerId: Id<"users">
): Promise<Doc<"budgetItems">[]> {
  const items = await ctx.db
    .query("budgetItems")
    .withIndex("by_owner_active", (q) => q.eq("ownerId", ownerId).eq("isActive", true))
    .collect();

  return items.filter(
    (item) =>
      Number.isSafeInteger(item.amount) &&
      item.amount > 0 &&
      Number.isSafeInteger(item.remainingQuantity) &&
      item.remainingQuantity > 0
  );
}

function pickBudgetItemByQuantity(items: Doc<"budgetItems">[]) {
  const totalUnits = items.reduce((sum, item) => sum + item.remainingQuantity, 0);
  if (totalUnits <= 0) {
    return null;
  }

  let random = Math.floor(Math.random() * totalUnits);
  for (const item of items) {
    random -= item.remainingQuantity;
    if (random < 0) {
      return item;
    }
  }
  return items[items.length - 1] ?? null;
}

export const getStationState = query({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Không tìm thấy chủ ví");
    }

    const budget = await ctx.db
      .query("ownerBudgets")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .first();

    const budgetItems = await ctx.db
      .query("budgetItems")
      .withIndex("by_owner_amount", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    const pendingSession = await ctx.db
      .query("drawSessions")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", args.ownerId).eq("status", "pending"))
      .first();

    const recentRedemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(10);

    const availableUnits = budgetItems.reduce((sum, item) => sum + Math.max(0, item.remainingQuantity), 0);

    return {
      hasSetup: Boolean(budget?.isSetupCompleted),
      budget: budget
        ? {
            totalBudget: budget.totalBudget,
            remainingBudget: budget.remainingBudget,
          }
        : null,
      availableUnits,
      budgetItems: budgetItems.map((item) => ({
        id: item._id,
        amount: item.amount,
        rarity: item.rarity,
        remainingQuantity: item.remainingQuantity,
        totalQuantity: item.initialQuantity,
        isActive: item.isActive,
      })),
      pendingSession: pendingSession
        ? {
            id: pendingSession._id,
            guestNameDisplay: pendingSession.guestNameDisplay,
            createdAt: pendingSession.createdAt,
          }
        : null,
      recentRedemptions: recentRedemptions.map((record) => ({
        id: record._id,
        guestNameDisplay: record.guestNameDisplay,
        amount: record.amount,
        rarity: record.rarity,
        redeemedAt: record.createdAt,
      })),
    };
  },
});

export const createSession = mutation({
  args: {
    ownerId: v.id("users"),
    guestName: v.string(),
    ownerPin: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Không tìm thấy chủ ví");
    }

    const guestNameDisplay = validateGuestName(args.guestName);
    const guestNameNormalized = normalizeGuestName(guestNameDisplay);
    const ownerPin = validatePin(args.ownerPin);

    if (
      typeof owner.pinHash !== "string" ||
      owner.pinHash.length === 0 ||
      typeof owner.pinSalt !== "string" ||
      owner.pinSalt.length === 0
    ) {
      throw new Error("Chủ ví chưa thiết lập PIN");
    }

    const pinMatches = await verifyPinHash(ownerPin, owner.pinSalt, owner.pinHash);
    if (!pinMatches) {
      throw new Error("PIN chủ ví không đúng");
    }

    const duplicateGuest = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_guestName", (q) =>
        q.eq("ownerId", args.ownerId).eq("guestNameNormalized", guestNameNormalized)
      )
      .first();

    if (duplicateGuest) {
      throw new Error("Tên người rút này đã rút rồi, vui lòng dùng tên khác");
    }

    const pendingSession = await ctx.db
      .query("drawSessions")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", args.ownerId).eq("status", "pending"))
      .first();
    if (pendingSession) {
      throw new Error("Đang có một lượt rút chờ xử lý, hãy hoàn tất hoặc hủy lượt hiện tại");
    }

    const budget = await getOwnerBudgetOrThrow(ctx, args.ownerId);
    if (budget.remainingBudget <= 0) {
      throw new Error("Ngân sách đã hết");
    }

    const availableItems = await getAvailableBudgetItems(ctx, args.ownerId);
    if (availableItems.length === 0) {
      throw new Error("Không còn mệnh giá nào khả dụng");
    }

    const sessionId = await ctx.db.insert("drawSessions", {
      ownerId: args.ownerId,
      guestNameDisplay,
      guestNameNormalized,
      status: "pending",
      createdAt: Date.now(),
    });

    return {
      sessionId,
      guestNameDisplay,
    };
  },
});

export const cancelSession = mutation({
  args: {
    ownerId: v.id("users"),
    sessionId: v.id("drawSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.ownerId !== args.ownerId) {
      throw new Error("Không tìm thấy lượt rút");
    }

    if (session.status !== "pending") {
      throw new Error("Chỉ có thể hủy lượt rút đang chờ");
    }

    await ctx.db.patch(session._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
    });

    return { success: true };
  },
});

export const redeem = mutation({
  args: {
    sessionId: v.id("drawSessions"),
    envelopeIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const envelopeIndex = validateEnvelopeIndex(args.envelopeIndex);

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Lượt rút không tồn tại");
    }
    if (session.status !== "pending") {
      throw new Error("Lượt rút này không còn hiệu lực");
    }
    const budget = await getOwnerBudgetOrThrow(ctx, session.ownerId);
    if (budget.remainingBudget <= 0) {
      throw new Error("Ngân sách đã hết");
    }

    const availableItems = await getAvailableBudgetItems(ctx, session.ownerId);
    const selectedItem = pickBudgetItemByQuantity(availableItems);
    if (!selectedItem) {
      throw new Error("Không còn mệnh giá khả dụng");
    }
    if (selectedItem.remainingQuantity <= 0) {
      throw new Error("Tồn kho mệnh giá không hợp lệ, vui lòng thử lại");
    }
    if (budget.remainingBudget < selectedItem.amount) {
      throw new Error("Ngân sách hiện tại không đủ cho mệnh giá còn lại");
    }

    const nextRemainingQty = selectedItem.remainingQuantity - 1;
    await ctx.db.patch(selectedItem._id, {
      remainingQuantity: nextRemainingQty,
      isActive: nextRemainingQty > 0,
      updatedAt: Date.now(),
    });

    const nextBudget = budget.remainingBudget - selectedItem.amount;
    await ctx.db.patch(budget._id, {
      remainingBudget: nextBudget,
      updatedAt: Date.now(),
    });

    const redemptionId = await ctx.db.insert("redemptions", {
      ownerId: session.ownerId,
      drawSessionId: session._id,
      guestNameDisplay: session.guestNameDisplay,
      guestNameNormalized: session.guestNameNormalized,
      amount: selectedItem.amount,
      rarity: selectedItem.rarity,
      budgetItemId: selectedItem._id,
      envelopeIndex,
      createdAt: Date.now(),
    });

    await ctx.db.patch(session._id, {
      status: "redeemed",
      redeemedAt: Date.now(),
      envelopeIndex,
      redemptionId,
    });

    return {
      success: true,
      guestNameDisplay: session.guestNameDisplay,
      amount: selectedItem.amount,
      rarity: selectedItem.rarity,
      remainingBudget: nextBudget,
    };
  },
});
