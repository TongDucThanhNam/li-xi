import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { requireResolvedOwner } from "./authorization";
import { getUniqueOwnerBudgetForScope } from "./budgetScope";
import {
  DEFAULT_CAMPAIGN_BRAND,
  DEFAULT_CAMPAIGN_DESCRIPTION,
  DEFAULT_CAMPAIGN_NAME,
  createUniqueDefaultCampaignSlug,
  getPreferredActiveCampaignForOwner,
  listVisibleCampaignsForOwner,
  sortCampaignsByRecency,
} from "./campaignIdentity";
import {
  hasOpenPendingSessionForCampaign,
  hasOpenPendingSessionForOwner,
} from "./drawSessionPolicy";
import { assertBudgetItemCount, assertCanCreateCampaign } from "./entitlements";
import { ensureHostProfileForOwner } from "./hostProfiles";
import {
  RARITY_VALUES,
  Rarity,
  validateRarity,
  validatePin,
  validateWholePositiveNumber,
} from "../lib/lixiPolicy";
import { createPinHash } from "./security";

const rarityValidator = v.union(v.literal("common"), v.literal("rare"), v.literal("legend"));

type BudgetInput = {
  amount: number;
  quantity: number;
  rarity: string;
};

type ConvexCtx = QueryCtx | MutationCtx;
type NormalizedBudgetItem = { amount: number; quantity: number; rarity: Rarity };
type BudgetItemSnapshot = {
  _id: Id<"budgetItems">;
  amount: number;
  rarity: Rarity;
  initialQuantity: number;
  remainingQuantity: number;
};
type BudgetScope = {
  campaignId?: Id<"campaigns">;
  source: "campaign" | "legacy-owner";
};
const MAX_BUDGET_ITEM_COUNT = 500;

function validateBudgetInputs(items: BudgetInput[]) {
  if (items.length === 0) {
    throw new Error("Cần ít nhất 1 mệnh giá để cấu hình ngân sách");
  }
  if (items.length > MAX_BUDGET_ITEM_COUNT) {
    throw new Error(`Tối đa ${MAX_BUDGET_ITEM_COUNT} mệnh giá trong một lần cấu hình`);
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

    const lineBudget = amount * quantity;
    if (!Number.isSafeInteger(lineBudget)) {
      throw new Error("Giá trị mệnh giá hoặc số lượng quá lớn");
    }

    const nextTotalBudget = totalBudget + lineBudget;
    if (!Number.isSafeInteger(nextTotalBudget)) {
      throw new Error("Tổng ngân sách vượt quá giới hạn cho phép");
    }
    totalBudget = nextTotalBudget;
    normalized.push({ amount, quantity, rarity });
  }

  if (totalBudget <= 0) {
    throw new Error("Tổng ngân sách phải lớn hơn 0");
  }

  normalized.sort((left, right) => left.amount - right.amount);
  return { normalized, totalBudget };
}

function validateBudgetItemsSnapshot(items: Doc<"budgetItems">[]) {
  if (items.length === 0) {
    throw new Error("Không có mệnh giá nào để đồng bộ");
  }
  if (items.length > MAX_BUDGET_ITEM_COUNT) {
    throw new Error(`Tối đa ${MAX_BUDGET_ITEM_COUNT} mệnh giá trong một lần cấu hình`);
  }

  const amountSet = new Set<number>();
  const normalized: BudgetItemSnapshot[] = [];
  let totalBudget = 0;
  let remainingBudget = 0;

  for (const item of items) {
    const amount = validateWholePositiveNumber(item.amount, "Mệnh giá");
    const initialQuantity = validateWholePositiveNumber(item.initialQuantity, "Số lượng ban đầu");
    const rarity = validateRarity(item.rarity);

    if (!Number.isSafeInteger(item.remainingQuantity) || item.remainingQuantity < 0) {
      throw new Error("Số lượng còn lại phải là số nguyên không âm");
    }
    if (item.remainingQuantity > initialQuantity) {
      throw new Error(`Mệnh giá ${amount.toLocaleString()}đ có số lượng còn lại lớn hơn số lượng ban đầu`);
    }
    if (amountSet.has(amount)) {
      throw new Error(`Mệnh giá ${amount.toLocaleString()}đ bị trùng`);
    }
    amountSet.add(amount);

    const lineTotal = amount * initialQuantity;
    const lineRemaining = amount * item.remainingQuantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(lineRemaining)) {
      throw new Error("Giá trị mệnh giá hoặc số lượng quá lớn");
    }

    const nextTotalBudget = totalBudget + lineTotal;
    const nextRemainingBudget = remainingBudget + lineRemaining;
    if (!Number.isSafeInteger(nextTotalBudget) || !Number.isSafeInteger(nextRemainingBudget)) {
      throw new Error("Tổng ngân sách vượt quá giới hạn cho phép");
    }

    totalBudget = nextTotalBudget;
    remainingBudget = nextRemainingBudget;
    normalized.push({
      _id: item._id,
      amount,
      rarity,
      initialQuantity,
      remainingQuantity: item.remainingQuantity,
    });
  }

  if (totalBudget <= 0) {
    throw new Error("Tổng ngân sách phải lớn hơn 0");
  }

  normalized.sort((left, right) => left.amount - right.amount);
  return { normalized, totalBudget, remainingBudget };
}

async function hasAnyRedemptionForOwner(ctx: ConvexCtx, ownerId: Id<"users">) {
  const oneRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
    .take(1);
  return oneRedemption.length > 0;
}

async function hasAnyRedemptionForScope(ctx: ConvexCtx, ownerId: Id<"users">, scope: BudgetScope) {
  if (!scope.campaignId) {
    return hasAnyRedemptionForOwner(ctx, ownerId);
  }

  const oneRedemption = await ctx.db
    .query("redemptions")
    .withIndex("by_campaign_owner_createdAt", (q) =>
      q.eq("campaignId", scope.campaignId).eq("ownerId", ownerId)
    )
    .take(1);
  return oneRedemption.length > 0;
}

async function hasPendingSessionForScope(ctx: ConvexCtx, ownerId: Id<"users">, scope: BudgetScope) {
  if (!scope.campaignId) {
    return hasOpenPendingSessionForOwner(ctx, ownerId);
  }

  return hasOpenPendingSessionForCampaign(ctx, ownerId, scope.campaignId);
}

async function getActiveCampaignForOwner(ctx: ConvexCtx, ownerId: Id<"users">) {
  const activeCampaign = await getPreferredActiveCampaignForOwner(ctx, ownerId);
  if (activeCampaign) {
    return activeCampaign;
  }

  const visibleCampaigns = await listVisibleCampaignsForOwner(ctx, ownerId);

  return sortCampaignsByRecency(visibleCampaigns)[0] ?? null;
}

async function ensureDefaultCampaignForOwner(ctx: MutationCtx, ownerId: Id<"users">) {
  const activeCampaign = await getActiveCampaignForOwner(ctx, ownerId);
  if (activeCampaign) {
    if (activeCampaign.status !== "active") {
      await ctx.db.patch(activeCampaign._id, {
        status: "active",
        updatedAt: Date.now(),
      });
      const updatedCampaign = await ctx.db.get(activeCampaign._id);
      if (!updatedCampaign) {
        throw new Error("Không thể kích hoạt chiến dịch mặc định");
      }
      return updatedCampaign;
    }
    return activeCampaign;
  }

  await assertCanCreateCampaign(ctx, ownerId);
  const now = Date.now();
  const slug = await createUniqueDefaultCampaignSlug(ctx, ownerId);
  const campaignId = await ctx.db.insert("campaigns", {
    ownerId,
    name: DEFAULT_CAMPAIGN_NAME,
    slug,
    brandName: DEFAULT_CAMPAIGN_BRAND,
    description: DEFAULT_CAMPAIGN_DESCRIPTION,
    theme: "lunar",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const campaign = await ctx.db.get(campaignId);
  if (!campaign) {
    throw new Error("Không thể tạo chiến dịch mặc định");
  }
  return campaign;
}

async function resolveBudgetScope(ctx: ConvexCtx, ownerId: Id<"users">): Promise<BudgetScope> {
  const activeCampaign = await getActiveCampaignForOwner(ctx, ownerId);
  if (activeCampaign) {
    return { campaignId: activeCampaign._id, source: "campaign" };
  }
  return { source: "legacy-owner" };
}

async function getVisibleCampaignForOwner(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">
) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId || campaign.status === "archived") {
    throw new Error("Không tìm thấy chiến dịch để cấu hình ngân sách");
  }
  return campaign;
}

async function resolveExplicitBudgetScope(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
): Promise<BudgetScope> {
  if (!campaignId) {
    return resolveBudgetScope(ctx, ownerId);
  }

  const campaign = await getVisibleCampaignForOwner(ctx, ownerId, campaignId);
  return { campaignId: campaign._id, source: "campaign" };
}

async function resolveMutableBudgetScope(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
): Promise<BudgetScope> {
  if (campaignId) {
    const campaign = await getVisibleCampaignForOwner(ctx, ownerId, campaignId);
    return { campaignId: campaign._id, source: "campaign" };
  }

  const campaign = await ensureDefaultCampaignForOwner(ctx, ownerId);
  return { campaignId: campaign._id, source: "campaign" };
}

async function getBudgetForScope(ctx: ConvexCtx, ownerId: Id<"users">, scope: BudgetScope) {
  return getUniqueOwnerBudgetForScope(ctx, ownerId, scope.campaignId);
}

async function listBudgetItems(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  scope: BudgetScope
): Promise<Doc<"budgetItems">[]> {
  if (scope.campaignId) {
    return ctx.db
      .query("budgetItems")
      .withIndex("by_campaign_owner_amount", (q) =>
        q.eq("campaignId", scope.campaignId).eq("ownerId", ownerId)
      )
      .collect();
  }

  return ctx.db
    .query("budgetItems")
    .withIndex("by_owner_campaign_amount", (q) =>
      q.eq("ownerId", ownerId).eq("campaignId", undefined)
    )
    .collect();
}

export const getSetupState = query({
  args: {
    campaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy tài khoản host",
      forbiddenMessage: "Bạn không có quyền cấu hình tài khoản này",
    });

    const visibleCampaigns = sortCampaignsByRecency(
      await listVisibleCampaignsForOwner(ctx, ownerId)
    );
    const scope = await resolveExplicitBudgetScope(ctx, ownerId, args.campaignId);
    const selectedCampaign = scope.campaignId
      ? visibleCampaigns.find((campaign) => campaign._id === scope.campaignId) ?? null
      : null;
    const budget = await getBudgetForScope(ctx, ownerId, scope);

    const items = await listBudgetItems(ctx, ownerId, scope);

    const hasRedemptions = await hasAnyRedemptionForScope(ctx, ownerId, scope);
    const hasPendingSession = await hasPendingSessionForScope(ctx, ownerId, scope);

    return {
      hasSetup: Boolean(budget?.isSetupCompleted && items.length > 0),
      budgetScope: scope,
      selectedCampaign: selectedCampaign
        ? {
            id: selectedCampaign._id,
            name: selectedCampaign.name,
            status: selectedCampaign.status,
          }
        : null,
      campaigns: visibleCampaigns.map((campaign) => ({
        id: campaign._id,
        name: campaign.name,
        brandName: campaign.brandName ?? null,
        status: campaign.status,
        isSelected: campaign._id === scope.campaignId,
      })),
      canConfigure: !hasRedemptions && !hasPendingSession,
      hasHostPin: typeof owner.pinHash === "string" && typeof owner.pinSalt === "string",
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
    campaignId: v.optional(v.id("campaigns")),
    hostPin: v.optional(v.string()),
    items: v.array(
      v.object({
        amount: v.number(),
        quantity: v.number(),
        rarity: rarityValidator,
      })
    ),
  },
  handler: async (ctx, args) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy tài khoản host",
      forbiddenMessage: "Bạn không có quyền cấu hình tài khoản này",
    });

    const scope = await resolveMutableBudgetScope(ctx, ownerId, args.campaignId);
    const redemptionsExist = await hasAnyRedemptionForScope(ctx, ownerId, scope);
    if (redemptionsExist) {
      throw new Error("Đã có lượt rút, không thể cấu hình lại ngân sách");
    }
    const pendingSessionExists = await hasPendingSessionForScope(ctx, ownerId, scope);
    if (pendingSessionExists) {
      throw new Error("Đang có lượt rút chờ xử lý, không thể cấu hình ngân sách");
    }

    const { normalized, totalBudget } = validateBudgetInputs(args.items);
    const now = Date.now();

    if (typeof owner.pinHash !== "string" || typeof owner.pinSalt !== "string") {
      if (!args.hostPin) {
        throw new Error("Cần thiết lập PIN host trước khi lưu ngân sách");
      }

      const hostPin = validatePin(args.hostPin);
      const { hash, salt } = await createPinHash(hostPin);
      await ctx.db.patch(owner._id, {
        pinHash: hash,
        pinSalt: salt,
        createdAt: owner.createdAt ?? now,
      });
    }

    const existingBudget = await getBudgetForScope(ctx, ownerId, scope);

    const existingItems = await listBudgetItems(ctx, ownerId, scope);
    await assertBudgetItemCount(ctx, ownerId, normalized.length, existingItems.length);

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    for (const [displayOrder, item] of normalized.entries()) {
      await ctx.db.insert("budgetItems", {
        ownerId,
        campaignId: scope.campaignId,
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
        ownerId,
        campaignId: scope.campaignId,
        totalBudget,
        remainingBudget: totalBudget,
        isSetupCompleted: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ensureHostProfileForOwner(ctx, owner, {
      defaultCampaignId: scope.campaignId,
      onboardingCompleted: true,
    });

    return {
      success: true,
      totalBudget,
      itemCount: normalized.length,
      budgetScope: scope,
    };
  },
});

export const syncBudgetFromItems = mutation({
  args: {
    campaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy tài khoản host",
      forbiddenMessage: "Bạn không có quyền cấu hình tài khoản này",
    });

    const scope = await resolveMutableBudgetScope(ctx, ownerId, args.campaignId);
    const redemptionsExist = await hasAnyRedemptionForScope(ctx, ownerId, scope);
    if (redemptionsExist) {
      throw new Error("Đã có lượt rút, không thể đồng bộ lại ngân sách");
    }
    const pendingSessionExists = await hasPendingSessionForScope(ctx, ownerId, scope);
    if (pendingSessionExists) {
      throw new Error("Đang có lượt rút chờ xử lý, không thể đồng bộ ngân sách");
    }

    const existingItems = await listBudgetItems(ctx, ownerId, scope);
    const { normalized, totalBudget, remainingBudget } = validateBudgetItemsSnapshot(existingItems);
    await assertBudgetItemCount(ctx, ownerId, normalized.length, existingItems.length);
    const now = Date.now();

    for (const [displayOrder, item] of normalized.entries()) {
      await ctx.db.patch(item._id, {
        amount: item.amount,
        rarity: item.rarity,
        initialQuantity: item.initialQuantity,
        remainingQuantity: item.remainingQuantity,
        displayOrder,
        isActive: item.remainingQuantity > 0,
        updatedAt: now,
      });
    }

    const existingBudget = await getBudgetForScope(ctx, ownerId, scope);

    if (existingBudget) {
      await ctx.db.patch(existingBudget._id, {
        totalBudget,
        remainingBudget,
        isSetupCompleted: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("ownerBudgets", {
        ownerId,
        campaignId: scope.campaignId,
        totalBudget,
        remainingBudget,
        isSetupCompleted: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      success: true,
      totalBudget,
      remainingBudget,
      itemCount: normalized.length,
      budgetScope: scope,
    };
  },
});
