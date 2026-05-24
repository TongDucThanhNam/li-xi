import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { countOwnerRedemptions } from "./analytics";
import { requireResolvedOwner } from "./authorization";
import { polar, polarProducts } from "./polarClient";
import { countOpenPendingOwnerSessions } from "./drawSessionPolicy";
import {
  isBillingPlanMappingConfigured,
  resolveFallbackTier,
  resolvePolarTier,
  type PlanTier,
} from "../lib/entitlementPolicy";

type ConvexCtx = QueryCtx | MutationCtx;
type LimitKey = "campaigns" | "assets" | "openSessions" | "budgetItems" | "redemptions";
type LimitValue = number | null;
type EntitlementLimits = Record<LimitKey, LimitValue>;
type EntitlementUsage = Record<LimitKey, number>;
type CountedAssetStatus = "reserved" | "uploaded" | "attached";
type CountedCampaignStatus = "draft" | "active";

const ASSET_QUOTA_COUNTED_STATUSES: CountedAssetStatus[] = ["reserved", "uploaded", "attached"];
const CAMPAIGN_QUOTA_COUNTED_STATUSES: CountedCampaignStatus[] = ["draft", "active"];
const ASSET_QUOTA_COUNTED_STATUS_SET = new Set<string>(ASSET_QUOTA_COUNTED_STATUSES);

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

const PLAN_LIMITS: Record<PlanTier, EntitlementLimits> = {
  free: {
    campaigns: 1,
    assets: 5,
    openSessions: 1,
    budgetItems: 50,
    redemptions: 100,
  },
  pro: {
    campaigns: 10,
    assets: 100,
    openSessions: 10,
    budgetItems: 200,
    redemptions: 5000,
  },
  business: {
    campaigns: null,
    assets: null,
    openSessions: null,
    budgetItems: 500,
    redemptions: null,
  },
};

function resolveOwnerTier(): PlanTier {
  return resolveFallbackTier(process.env);
}

async function resolveBillingPlan(ctx: ConvexCtx, ownerId: Id<"users">) {
  try {
    const subscription = await polar.getCurrentSubscription(ctx, { userId: ownerId });
    const tier = resolvePolarTier(subscription, polarProducts);
    if (!subscription || !tier) {
      return {
        tier: resolveOwnerTier(),
        source: "fallback" as const,
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              productId: subscription.productId,
              productKey: typeof subscription.productKey === "string" ? subscription.productKey : null,
              productName: subscription.product.name,
              currentPeriodEnd: subscription.currentPeriodEnd ?? null,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
        billingError: null,
      };
    }

    return {
      tier,
      source: "polar" as const,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        productId: subscription.productId,
        productKey: typeof subscription.productKey === "string" ? subscription.productKey : null,
        productName: subscription.product.name,
        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      billingError: null,
    };
  } catch (error) {
    return {
      tier: resolveOwnerTier(),
      source: "fallback" as const,
      subscription: null,
      billingError: error instanceof Error ? error.message : "Không thể đọc subscription Polar",
    };
  }
}

function formatLimit(limit: LimitValue) {
  return limit === null ? "không giới hạn" : limit.toLocaleString("vi-VN");
}

function limitState(used: number, limit: LimitValue) {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    isLimited: limit !== null,
    isFull: limit !== null && used >= limit,
    isExceeded: limit !== null && used > limit,
  };
}

function isQuotaCountedCampaignAsset(asset: Doc<"campaignAssets">) {
  return ASSET_QUOTA_COUNTED_STATUS_SET.has(asset.status ?? "");
}

async function countCampaignsForQuota(ctx: ConvexCtx, ownerId: Id<"users">) {
  const campaignGroups = await Promise.all(
    CAMPAIGN_QUOTA_COUNTED_STATUSES.map((status) =>
      ctx.db
        .query("campaigns")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", status))
        .collect()
    )
  );

  return campaignGroups.reduce((total, campaigns) => total + campaigns.length, 0);
}

async function countAssetsForQuota(ctx: ConvexCtx, ownerId: Id<"users">) {
  const assetGroups = await Promise.all(
    ASSET_QUOTA_COUNTED_STATUSES.map((status) =>
      ctx.db
        .query("campaignAssets")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", status))
        .collect()
    )
  );

  return assetGroups.reduce((total, assets) => {
    return total + assets.filter(isQuotaCountedCampaignAsset).length;
  }, 0);
}

async function countOpenSessionsForQuota(ctx: ConvexCtx, ownerId: Id<"users">) {
  return countOpenPendingOwnerSessions(ctx, ownerId);
}

async function getUsage(ctx: ConvexCtx, ownerId: Id<"users">): Promise<EntitlementUsage> {
  const [campaigns, assets, openSessions, budgetItems, redemptions] = await Promise.all([
    countCampaignsForQuota(ctx, ownerId),
    countAssetsForQuota(ctx, ownerId),
    countOpenSessionsForQuota(ctx, ownerId),
    ctx.db
      .query("budgetItems")
      .withIndex("by_owner_amount", (q) => q.eq("ownerId", ownerId))
      .collect(),
    countOwnerRedemptions(ctx, ownerId),
  ]);

  return {
    campaigns,
    assets,
    openSessions,
    budgetItems: budgetItems.length,
    redemptions,
  };
}

async function getEntitlementSnapshot(ctx: ConvexCtx, ownerId: Id<"users">) {
  const billingPlan = await resolveBillingPlan(ctx, ownerId);
  const tier = billingPlan.tier;
  const limits = PLAN_LIMITS[tier];
  const usage = await getUsage(ctx, ownerId);

  return {
    tier,
    label: PLAN_LABELS[tier],
    source: billingPlan.source,
    billingConfigured: isBillingPlanMappingConfigured(process.env, polarProducts),
    subscription: billingPlan.subscription,
    billingError: billingPlan.billingError,
    limits,
    usage,
    resources: {
      campaigns: limitState(usage.campaigns, limits.campaigns),
      assets: limitState(usage.assets, limits.assets),
      openSessions: limitState(usage.openSessions, limits.openSessions),
      budgetItems: limitState(usage.budgetItems, limits.budgetItems),
      redemptions: limitState(usage.redemptions, limits.redemptions),
    },
  };
}

async function assertBelowLimit(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  key: LimitKey,
  message: string
) {
  const snapshot = await getEntitlementSnapshot(ctx, ownerId);
  const limit = snapshot.limits[key];
  if (limit !== null && snapshot.usage[key] >= limit) {
    throw new Error(`${message} Gói ${snapshot.label} giới hạn ${formatLimit(limit)}.`);
  }
}

export async function assertCanCreateCampaign(ctx: ConvexCtx, ownerId: Id<"users">) {
  await assertBelowLimit(
    ctx,
    ownerId,
    "campaigns",
    "Đã đạt giới hạn số chiến dịch có thể tạo."
  );
}

export async function assertCanUploadAsset(ctx: ConvexCtx, ownerId: Id<"users">) {
  await assertBelowLimit(
    ctx,
    ownerId,
    "assets",
    "Đã đạt giới hạn số ảnh chiến dịch có thể upload."
  );
}

export async function assertCanCreateSession(ctx: ConvexCtx, ownerId: Id<"users">) {
  await assertBelowLimit(
    ctx,
    ownerId,
    "openSessions",
    "Đã đạt giới hạn số lượt rút đang mở."
  );
  await assertBelowLimit(
    ctx,
    ownerId,
    "redemptions",
    "Đã đạt giới hạn lượt trao thưởng của gói hiện tại."
  );
}

export async function assertCanRedeem(ctx: ConvexCtx, ownerId: Id<"users">) {
  await assertBelowLimit(
    ctx,
    ownerId,
    "redemptions",
    "Đã đạt giới hạn lượt trao thưởng của gói hiện tại."
  );
}

export async function assertBudgetItemCount(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  nextScopeItemCount: number,
  existingScopeItemCount = 0
) {
  const snapshot = await getEntitlementSnapshot(ctx, ownerId);
  const limit = snapshot.limits.budgetItems;
  const projectedBudgetItems =
    snapshot.usage.budgetItems - Math.max(0, existingScopeItemCount) + nextScopeItemCount;
  if (limit !== null && projectedBudgetItems > limit) {
    throw new Error(
      `Gói ${snapshot.label} giới hạn ${formatLimit(limit)} mệnh giá trên toàn tài khoản.`
    );
  }
}

export async function getOwnerPlanState(ctx: ConvexCtx, ownerId: Id<"users">) {
  return getEntitlementSnapshot(ctx, ownerId);
}

export const getPlanState = query({
  args: {},
  handler: async (ctx) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy tài khoản",
      forbiddenMessage: "Bạn không có quyền xem gói dịch vụ này",
    });
    return getEntitlementSnapshot(ctx, ownerId);
  },
});
