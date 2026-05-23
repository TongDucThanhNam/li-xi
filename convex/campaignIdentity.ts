import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getHostProfileForOwner } from "./hostProfiles";

type ConvexCtx = QueryCtx | MutationCtx;

export const DEFAULT_CAMPAIGN_NAME = "Lunar Fortune";
export const DEFAULT_CAMPAIGN_BRAND = "Lì Xì Station";
export const DEFAULT_CAMPAIGN_DESCRIPTION = "Chiến dịch rút phong bao may mắn mặc định.";
export const visibleCampaignStatuses = ["active", "draft"] as const;

export function slugifyCampaign(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  if (slug.length < 3) {
    throw new Error("Slug chiến dịch phải có ít nhất 3 ký tự hợp lệ");
  }
  return slug;
}

export function defaultCampaignSlugBase(ownerId: Id<"users">) {
  return `lunar-${ownerId.slice(-6).toLowerCase()}`;
}

function campaignOwnerSlugToken(ownerId: Id<"users">) {
  const token = ownerId.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(-16);
  return token.length >= 6 ? token : ownerId.slice(-10).toLowerCase();
}

export async function assertCampaignSlugAvailable(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  slug: string,
  campaignId?: Id<"campaigns">
) {
  const slugOwners = await ctx.db
    .query("campaigns")
    .withIndex("by_owner_slug", (q) => q.eq("ownerId", ownerId).eq("slug", slug))
    .collect();

  if (slugOwners.some((campaign) => campaign._id !== campaignId)) {
    throw new Error("Slug chiến dịch đã tồn tại");
  }
}

export async function createUniqueDefaultCampaignSlug(
  ctx: ConvexCtx,
  ownerId: Id<"users">
) {
  const baseSlug = slugifyCampaign(defaultCampaignSlugBase(ownerId));

  for (let index = 0; index < 12; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const existing = await ctx.db
      .query("campaigns")
      .withIndex("by_owner_slug", (q) => q.eq("ownerId", ownerId).eq("slug", slug))
      .first();

    if (!existing) {
      return slug;
    }
  }

  const ownerScopedBaseSlug = slugifyCampaign(`campaign-${campaignOwnerSlugToken(ownerId)}`);
  for (let index = 0; index < 12; index += 1) {
    const slug = index === 0 ? ownerScopedBaseSlug : `${ownerScopedBaseSlug}-${index + 1}`;
    const existing = await ctx.db
      .query("campaigns")
      .withIndex("by_owner_slug", (q) => q.eq("ownerId", ownerId).eq("slug", slug))
      .first();

    if (!existing) {
      return slug;
    }
  }

  throw new Error("Không thể tạo slug chiến dịch duy nhất");
}

export async function listVisibleCampaignsForOwner(ctx: ConvexCtx, ownerId: Id<"users">) {
  const groups = await Promise.all(
    visibleCampaignStatuses.map((status) =>
      ctx.db
        .query("campaigns")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", status))
        .collect()
    )
  );
  return groups.flat();
}

export function sortCampaignsByRecency(campaigns: Doc<"campaigns">[]) {
  return [...campaigns].sort((left, right) => {
    const updatedDelta = right.updatedAt - left.updatedAt;
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return right.createdAt - left.createdAt;
  });
}

export async function getPreferredActiveCampaignForOwner(
  ctx: ConvexCtx,
  ownerId: Id<"users">
) {
  const [hostProfile, activeCampaigns] = await Promise.all([
    getHostProfileForOwner(ctx, ownerId),
    ctx.db
      .query("campaigns")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", ownerId).eq("status", "active"))
      .collect(),
  ]);
  const defaultActiveCampaign = activeCampaigns.find(
    (campaign) => campaign._id === hostProfile?.defaultCampaignId
  );

  return defaultActiveCampaign ?? sortCampaignsByRecency(activeCampaigns)[0] ?? null;
}
