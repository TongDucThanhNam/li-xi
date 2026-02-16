import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import {
  RARITY_VALUES,
  Rarity,
  validateRarity,
  validateWholePositiveNumber,
} from "../lib/lixiPolicy";

const rarityValidator = v.union(v.literal("common"), v.literal("rare"), v.literal("legend"));

type BudgetInput = {
  amount: number;
  quantity: number;
  rarity: string;
};

type ConvexCtx = QueryCtx | MutationCtx;
type NormalizedBudgetItem = { amount: number; quantity: number; rarity: Rarity };

function validateBudgetInputs(items: BudgetInput[]) {
  if (items.length === 0) {
    throw new Error("Cần ít nhất 1 mệnh giá để cấu hình ngân sách");
  }

  const amountSet = new Set<number>();
  const normalized: NormalizedBudgetItem[] = [];
  let totalBudget = 0;

  for (const item of items) {
    const amount = validateWholePositiveNumber(item.amount, "Số tiền");
    const quantity = validateWholePositiveNumber(item.quantity, "Số lượng tờ");
    const rarity = validateRarity(item.rarity);

    if (amountSet.has(amount)) {
      throw new Error(`Mệnh giá ${amount.toLocaleString()}đ bị trùng`);
    }
    amountSet.add(amount);

    totalBudget += amount * quantity;
    normalized.push({ amount, quantity, rarity });
  }

  if (totalBudget <= 0) {
    throw new Error("Tổng ngân sách phải lớn hơn 0");
  }

  normalized.sort((left, right) => left.amount - right.amount);
  return { normalized, totalBudget };
}

async function hasAnyRedemptionForOwner(ctx: ConvexCtx, ownerId: Id<"users">) {
  const oneRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
    .take(1);
  return oneRedemption.length > 0;
}

async function listBudgetItems(ctx: ConvexCtx, ownerId: Id<"users">) {
  return ctx.db.query("budgetItems").withIndex("by_owner_amount", (q) => q.eq("ownerId", ownerId)).collect();
}

export const getSetupState = query({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Không tìm thấy tài khoản chủ ví");
    }

    const budget = await ctx.db
      .query("ownerBudgets")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .first();

    const items = await listBudgetItems(ctx, args.ownerId);

    const hasRedemptions = await hasAnyRedemptionForOwner(ctx, args.ownerId);

    return {
      hasSetup: Boolean(budget?.isSetupCompleted && items.length > 0),
      canConfigure: !hasRedemptions,
      budget: budget
        ? {
            totalBudget: budget.totalBudget,
            remainingBudget: budget.remainingBudget,
            updatedAt: budget.updatedAt,
          }
        : null,
      items: items.map((item) => ({
        id: item._id,
        amount: item.amount,
        rarity: item.rarity,
        initialQuantity: item.initialQuantity,
        remainingQuantity: item.remainingQuantity,
        isActive: item.isActive,
      })),
      rarityOptions: RARITY_VALUES,
    };
  },
});

export const configureBudget = mutation({
  args: {
    ownerId: v.id("users"),
    items: v.array(
      v.object({
        amount: v.number(),
        quantity: v.number(),
        rarity: rarityValidator,
      })
    ),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Không tìm thấy tài khoản chủ ví");
    }

    const redemptionsExist = await hasAnyRedemptionForOwner(ctx, args.ownerId);
    if (redemptionsExist) {
      throw new Error("Đã có lượt rút, không thể cấu hình lại ngân sách");
    }

    const { normalized, totalBudget } = validateBudgetInputs(args.items);
    const now = Date.now();

    const existingBudget = await ctx.db
      .query("ownerBudgets")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .first();

    const existingItems = await listBudgetItems(ctx, args.ownerId);

    for (const item of existingItems as Doc<"budgetItems">[]) {
      await ctx.db.delete(item._id);
    }

    for (const [displayOrder, item] of normalized.entries()) {
      await ctx.db.insert("budgetItems", {
        ownerId: args.ownerId,
        amount: item.amount,
        rarity: item.rarity,
        initialQuantity: item.quantity,
        remainingQuantity: item.quantity,
        displayOrder,
        isActive: item.quantity > 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (existingBudget) {
      await ctx.db.patch(existingBudget._id, {
        totalBudget,
        remainingBudget: totalBudget,
        isSetupCompleted: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("ownerBudgets", {
        ownerId: args.ownerId,
        totalBudget,
        remainingBudget: totalBudget,
        isSetupCompleted: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      success: true,
      totalBudget,
      itemCount: normalized.length,
    };
  },
});
