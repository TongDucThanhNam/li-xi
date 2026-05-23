import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";

type HostProfileInput = {
  displayName: string;
  slug: string;
  defaultCampaignId?: Id<"campaigns">;
  onboardingCompleted: boolean;
};

function sanitizeDisplayName(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 80) {
    throw new Error("Tên host phải từ 2-80 ký tự");
  }
  return clean;
}

export function slugifyHost(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug.length >= 3 ? slug : null;
}

export function displayNameFromUser(user: Doc<"users">) {
  if (user.username) {
    return user.username;
  }
  if (user.name) {
    return user.name;
  }
  if (user.email) {
    return user.email.split("@")[0] || user.email;
  }
  return "Lì Xì Station";
}

async function getProfilesBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return ctx.db
    .query("hostProfiles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .collect();
}

export async function getHostProfileForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">
) {
  const profiles = await ctx.db
    .query("hostProfiles")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  if (profiles.length > 1) {
    throw new Error("Dữ liệu host profile bị trùng, vui lòng chạy maintenance trước");
  }
  return profiles[0] ?? null;
}

function sanitizeHostSlug(value: string) {
  const slug = slugifyHost(value);
  if (!slug) {
    throw new Error("Slug host phải có ít nhất 3 ký tự hợp lệ");
  }
  return slug;
}

function ownerSlugToken(ownerId: Id<"users">) {
  const token = ownerId.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(-16);
  return token.length >= 6 ? token : ownerId.slice(-10).toLowerCase();
}

async function assertHostSlugAvailable(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  slug: string
) {
  const profiles = await getProfilesBySlug(ctx, slug);
  if (profiles.some((profile) => profile.ownerId !== ownerId)) {
    throw new Error("Slug host đã tồn tại");
  }
}

async function validateRequestedHostSlug(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  requestedSlug: string
) {
  const slug = sanitizeHostSlug(requestedSlug);
  await assertHostSlugAvailable(ctx, ownerId, slug);
  return slug;
}

async function createUniqueSlug(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  displayName: string,
  requestedSlug?: string
) {
  const baseSlug =
    slugifyHost(requestedSlug ?? displayName) ??
    `host-${ownerSlugToken(ownerId)}`;

  for (let index = 0; index < 8; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const existingProfiles = await getProfilesBySlug(ctx, slug);
    if (existingProfiles.every((profile) => profile.ownerId === ownerId)) {
      return slug;
    }
  }

  const ownerScopedBaseSlug = `host-${ownerSlugToken(ownerId)}`;
  for (let index = 0; index < 12; index += 1) {
    const slug = index === 0 ? ownerScopedBaseSlug : `${ownerScopedBaseSlug}-${index + 1}`;
    const existingProfiles = await getProfilesBySlug(ctx, slug);
    if (existingProfiles.every((profile) => profile.ownerId === ownerId)) {
      return slug;
    }
  }

  throw new Error("Không thể tạo slug host duy nhất");
}

async function resolveHostDefaultCampaignId(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  defaultCampaignId: Id<"campaigns"> | undefined,
  options: { explicit: boolean }
) {
  if (!defaultCampaignId) {
    return undefined;
  }

  const campaign = await ctx.db.get(defaultCampaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    if (options.explicit) {
      throw new Error("Chiến dịch mặc định không hợp lệ");
    }
    return undefined;
  }
  if (campaign.status === "archived") {
    if (options.explicit) {
      throw new Error("Chiến dịch mặc định không thể là chiến dịch đã lưu trữ");
    }
    return undefined;
  }
  return campaign._id;
}

function profileView(profile: Doc<"hostProfiles"> | null, owner: Doc<"users">) {
  const fallbackDisplayName = displayNameFromUser(owner);

  return {
    id: profile?._id ?? null,
    displayName: profile?.displayName ?? fallbackDisplayName,
    slug: profile?.slug ?? null,
    defaultCampaignId: profile?.defaultCampaignId ?? null,
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    createdAt: profile?.createdAt ?? owner.createdAt ?? owner._creationTime,
    updatedAt: profile?.updatedAt ?? owner.createdAt ?? owner._creationTime,
  };
}

export async function ensureHostProfileForOwner(
  ctx: MutationCtx,
  owner: Doc<"users">,
  input?: Partial<HostProfileInput>
) {
  const existing = await getHostProfileForOwner(ctx, owner._id);
  const displayName = sanitizeDisplayName(
    input?.displayName ?? existing?.displayName ?? displayNameFromUser(owner)
  );
  const slug =
    input?.slug === undefined
      ? await createUniqueSlug(ctx, owner._id, displayName, existing?.slug)
      : await validateRequestedHostSlug(ctx, owner._id, input.slug);
  const now = Date.now();
  const hasExplicitDefaultCampaign = input?.defaultCampaignId !== undefined;
  const resolvedDefaultCampaignId = await resolveHostDefaultCampaignId(
    ctx,
    owner._id,
    hasExplicitDefaultCampaign ? input.defaultCampaignId : existing?.defaultCampaignId,
    { explicit: hasExplicitDefaultCampaign }
  );

  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName,
      slug,
      defaultCampaignId: resolvedDefaultCampaignId,
      onboardingCompleted: input?.onboardingCompleted ?? existing.onboardingCompleted,
      updatedAt: now,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw new Error("Không thể cập nhật host profile");
    }
    return updated;
  }

  const profileId = await ctx.db.insert("hostProfiles", {
    ownerId: owner._id,
    displayName,
    slug,
    defaultCampaignId: resolvedDefaultCampaignId,
    onboardingCompleted: input?.onboardingCompleted ?? false,
    createdAt: now,
    updatedAt: now,
  });
  const profile = await ctx.db.get(profileId);
  if (!profile) {
    throw new Error("Không thể tạo host profile");
  }
  return profile;
}

export const getHostProfile = query({
  args: {},
  handler: async (ctx) => {
    const { owner, ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem host profile này",
    });
    const profile = await getHostProfileForOwner(ctx, ownerId);
    return profileView(profile, owner);
  },
});

export const saveHostProfile = mutation({
  args: {
    displayName: v.string(),
    slug: v.string(),
    defaultCampaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { owner } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền chỉnh host profile này",
    });
    const profile = await ensureHostProfileForOwner(ctx, owner, {
      displayName: args.displayName,
      slug: args.slug,
      defaultCampaignId: args.defaultCampaignId,
    });
    return profileView(profile, owner);
  },
});
