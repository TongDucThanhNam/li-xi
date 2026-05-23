import { R2, type R2Callbacks } from "@convex-dev/r2";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import { assertCanUploadAsset } from "./entitlements";
import {
  assertR2ObjectKey,
  isRenderableCampaignAssetRecord,
  isSafeCampaignAssetBucketName,
  normalizeR2ObjectKey,
  validateCampaignAssetPolicy,
} from "../lib/assetPolicy";

export const r2 = new R2(components.r2);

const callbacks: R2Callbacks = internal.assets;
type ConvexCtx = QueryCtx | MutationCtx;

const uploadableCampaignAssetStatuses = new Set(["reserved", "uploaded"]);
const metadataSyncableCampaignAssetStatuses = new Set(["reserved", "uploaded", "attached"]);

function configuredR2Bucket() {
  return process.env.R2_BUCKET?.trim() ?? "";
}

function requireConfiguredR2Bucket() {
  const bucket = configuredR2Bucket();
  if (!isSafeCampaignAssetBucketName(bucket)) {
    throw new Error("Thiếu R2_BUCKET để xử lý asset chiến dịch");
  }
  return bucket;
}

function isConfiguredR2Bucket(bucket: string | undefined) {
  const configuredBucket = configuredR2Bucket();
  return Boolean(configuredBucket && bucket === configuredBucket);
}

export function assertCampaignAssetBucketMatchesConfigured(asset: Doc<"campaignAssets">) {
  if (!isConfiguredR2Bucket(asset.bucket)) {
    throw new Error("Bucket R2 của asset không khớp cấu hình");
  }
}

async function clearCampaignHeroAssetIfCurrent(
  ctx: MutationCtx,
  asset: Doc<"campaignAssets">,
  now: number
) {
  if (!asset.campaignId) {
    return;
  }

  const campaign = await ctx.db.get(asset.campaignId);
  if (campaign?.heroAssetId === asset._id) {
    await ctx.db.patch(campaign._id, {
      heroAssetId: undefined,
      updatedAt: now,
    });
  }
}

export async function rejectCampaignAssetAndScheduleObjectDelete(
  ctx: MutationCtx,
  asset: Doc<"campaignAssets">,
  now: number,
  rejectedReason: string,
  patch: Partial<Doc<"campaignAssets">> = {}
) {
  const safeKey = normalizeR2ObjectKey(asset.key);
  await ctx.db.patch(asset._id, {
    ...patch,
    r2ObjectDeleteReason: rejectedReason,
    r2ObjectDeleteScheduledAt: now,
    rejectedReason,
    status: "rejected",
  });
  await clearCampaignHeroAssetIfCurrent(ctx, asset, now);
  if (safeKey) {
    await r2.deleteObject(ctx, safeKey);
  }
}

export async function rejectAmbiguousOwnedAssets(
  ctx: MutationCtx,
  ownedAssets: Doc<"campaignAssets">[],
  now: number,
  patch: Partial<Doc<"campaignAssets">>
) {
  for (const asset of ownedAssets) {
    await rejectCampaignAssetAndScheduleObjectDelete(
      ctx,
      asset,
      now,
      "Key asset R2 không duy nhất cho owner",
      patch
    );
  }
}

export async function getOwnedAssetsByKey(ctx: ConvexCtx, ownerId: Id<"users">, key: string) {
  const safeKey = assertR2ObjectKey(key);
  return ctx.db
    .query("campaignAssets")
    .withIndex("by_key_owner", (q) => q.eq("key", safeKey).eq("ownerId", ownerId))
    .collect();
}

export async function getUniqueOwnedCampaignAssetByKey(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  key: string
) {
  const ownedAssets = await getOwnedAssetsByKey(ctx, ownerId, key);
  return ownedAssets.length === 1 ? ownedAssets[0] : null;
}

export function isRenderableCampaignAsset(
  asset: Doc<"campaignAssets"> | null | undefined,
  ownerId: Id<"users">
): asset is Doc<"campaignAssets"> {
  return isRenderableCampaignAssetRecord(asset, ownerId, configuredR2Bucket());
}

export async function getRenderableCampaignAssetUrl(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  key: string | undefined,
  campaignId: Id<"campaigns">
) {
  if (!key) {
    return null;
  }

  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    return null;
  }

  const asset = await getUniqueOwnedCampaignAssetByKey(ctx, ownerId, key);
  if (!isRenderableCampaignAsset(asset, ownerId)) {
    return null;
  }
  if (asset.campaignId !== campaignId) {
    return null;
  }

  return r2.getUrl(asset.key);
}

export const generateUploadUrl = mutation({
  args: {
    campaignId: v.id("campaigns"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền upload tài sản chiến dịch",
    });

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      throw new Error("Không tìm thấy chiến dịch");
    }

    const validated = validateCampaignAssetPolicy({
      contentType: args.contentType,
      fileName: args.fileName,
      size: args.size,
    });

    const configuredBucket = requireConfiguredR2Bucket();
    await assertCanUploadAsset(ctx, ownerId);
    const upload = await r2.generateUploadUrl();
    const now = Date.now();

    await ctx.db.insert("campaignAssets", {
      ownerId,
      campaignId: campaign._id,
      bucket: configuredBucket,
      key: upload.key,
      contentType: validated.contentType,
      fileName: validated.fileName,
      metadataSource: "client",
      size: validated.size,
      status: "reserved",
      usage: "hero",
      createdAt: now,
    });

    return upload;
  },
});

const clientApi = r2.clientApi<DataModel>({
  callbacks,
  checkUpload: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Cần đăng nhập để upload tài sản chiến dịch");
    }
  },
  onUpload: async (ctx, bucket, key) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Cần đăng nhập để lưu tài sản chiến dịch");
    }

    const safeKey = assertR2ObjectKey(key);
    const ownedAssets = await getOwnedAssetsByKey(ctx, userId, safeKey);

    const now = Date.now();
    if (ownedAssets.length === 0) {
      throw new Error("Upload asset chưa được khai báo trước khi gửi lên R2");
    }
    if (ownedAssets.length !== 1) {
      await rejectAmbiguousOwnedAssets(ctx, ownedAssets, now, {
        bucket,
      });
      throw new Error("Key asset R2 không duy nhất cho owner");
    }

    const asset = ownedAssets[0];
    const configuredBucket = requireConfiguredR2Bucket();
    if (bucket !== configuredBucket || asset.bucket !== configuredBucket) {
      await rejectCampaignAssetAndScheduleObjectDelete(
        ctx,
        asset,
        now,
        "Bucket R2 của upload không khớp cấu hình",
        { bucket }
      );
      throw new Error("Bucket R2 của upload không khớp cấu hình");
    }
    if (asset.status === "attached") {
      return;
    }
    if (asset.status === "rejected") {
      throw new Error("Asset upload đã bị từ chối");
    }
    if (!uploadableCampaignAssetStatuses.has(asset.status ?? "")) {
      throw new Error("Upload asset chưa ở trạng thái được khai báo hợp lệ");
    }

    await ctx.db.patch(asset._id, {
      bucket,
      key: safeKey,
      status: "uploaded",
    });
  },
  onSyncMetadata: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Cần đăng nhập để đồng bộ metadata tài sản chiến dịch");
    }

    const safeKey = assertR2ObjectKey(args.key);
    const ownedAssets = await getOwnedAssetsByKey(ctx, userId, safeKey);

    if (ownedAssets.length === 0) {
      return;
    }

    const metadata = await r2.getMetadata(ctx, safeKey);
    const now = Date.now();

    if (ownedAssets.length !== 1) {
      await rejectAmbiguousOwnedAssets(ctx, ownedAssets, now, {
        metadataSource: "r2",
        metadataSyncedAt: now,
        validatedAt: now,
      });
      throw new Error("Key asset R2 không duy nhất cho owner");
    }

    for (const asset of ownedAssets) {
      try {
        assertCampaignAssetBucketMatchesConfigured(asset);
        if (!metadataSyncableCampaignAssetStatuses.has(asset.status ?? "")) {
          throw new Error("Asset không ở trạng thái được đồng bộ metadata");
        }
        if (!metadata) {
          throw new Error("Không đọc được metadata R2");
        }

        const validated = validateCampaignAssetPolicy({
          contentType: metadata.contentType,
          fileName: asset.fileName,
          size: metadata.size,
        });

        await ctx.db.patch(asset._id, {
          contentType: validated.contentType,
          fileName: validated.fileName,
          metadataSource: "r2",
          metadataSyncedAt: now,
          rejectedReason: undefined,
          size: validated.size,
          status: asset.status === "attached" ? "attached" : "uploaded",
          validatedAt: now,
        });
      } catch (error) {
        const rejectedReason =
          error instanceof Error ? error.message : "Metadata R2 của asset không hợp lệ";

        await rejectCampaignAssetAndScheduleObjectDelete(ctx, asset, now, rejectedReason, {
          contentType: metadata?.contentType ?? undefined,
          metadataSource: "r2",
          metadataSyncedAt: now,
          size: metadata?.size ?? undefined,
          validatedAt: now,
        });
      }
    }
  },
});

export const syncMetadata = clientApi.syncMetadata;
export const onSyncMetadata = clientApi.onSyncMetadata;

export const getAssetUrl = query({
  args: {
    campaignId: v.id("campaigns"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem asset này",
    });
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      throw new Error("Không tìm thấy chiến dịch");
    }

    const url = await getRenderableCampaignAssetUrl(ctx, ownerId, args.key, campaign._id);
    if (!url) {
      throw new Error("Không tìm thấy asset chiến dịch");
    }

    return url;
  },
});
