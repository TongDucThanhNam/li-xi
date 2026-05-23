import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const rarityValidator = v.union(v.literal("common"), v.literal("rare"), v.literal("legend"));
const drawSessionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("redeemed"),
  v.literal("cancelled")
);
const deliveryModeValidator = v.union(v.literal("station"), v.literal("link"));

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // Legacy host fields kept optional while migrating to Convex Auth.
    username: v.optional(v.string()),
    usernameNormalized: v.optional(v.string()),
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_username_normalized", ["usernameNormalized"])
    .index("by_username", ["username"]),

  hostProfiles: defineTable({
    ownerId: v.id("users"),
    displayName: v.string(),
    slug: v.string(),
    defaultCampaignId: v.optional(v.id("campaigns")),
    onboardingCompleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"]),

  ownerBudgets: defineTable({
    ownerId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    totalBudget: v.number(), // Tổng ngân sách
    remainingBudget: v.number(), // Ngân sách còn lại
    isSetupCompleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_campaign", ["ownerId", "campaignId"]),

  campaigns: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    slug: v.string(),
    brandName: v.optional(v.string()),
    description: v.optional(v.string()),
    claimHeadline: v.optional(v.string()),
    claimSubtitle: v.optional(v.string()),
    claimCtaLabel: v.optional(v.string()),
    claimCollectLabel: v.optional(v.string()),
    claimWaitingMessage: v.optional(v.string()),
    theme: v.union(v.literal("lunar"), v.literal("brand")),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    heroAssetId: v.optional(v.id("campaignAssets")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_slug", ["ownerId", "slug"]),

  campaignAssets: defineTable({
    ownerId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    bucket: v.string(),
    key: v.string(),
    contentType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    metadataSource: v.optional(v.union(v.literal("client"), v.literal("r2"))),
    metadataSyncedAt: v.optional(v.number()),
    r2ObjectDeleteReason: v.optional(v.string()),
    r2ObjectDeleteScheduledAt: v.optional(v.number()),
    rejectedReason: v.optional(v.string()),
    size: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("reserved"),
        v.literal("uploaded"),
        v.literal("attached"),
        v.literal("rejected")
      )
    ),
    usage: v.optional(v.literal("hero")),
    validatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_status_createdAt", ["ownerId", "status", "createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_campaign_createdAt", ["campaignId", "createdAt"])
    .index("by_campaign_owner_status_createdAt", [
      "campaignId",
      "ownerId",
      "status",
      "createdAt",
    ])
    .index("by_key", ["key"])
    .index("by_key_owner", ["key", "ownerId"]),

  analyticsCounterEvents: defineTable({
    eventKey: v.string(),
    ownerId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    metric: v.union(v.literal("session_created"), v.literal("redemption_created")),
    source: v.union(v.literal("live"), v.literal("backfill")),
    createdAt: v.number(),
  })
    .index("by_eventKey", ["eventKey"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_campaign_createdAt", ["campaignId", "createdAt"]),

  budgetItems: defineTable({
    ownerId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    amount: v.number(),
    rarity: rarityValidator,
    initialQuantity: v.number(),
    remainingQuantity: v.number(),
    displayOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_active", ["ownerId", "isActive"])
    .index("by_owner_amount", ["ownerId", "amount"])
    .index("by_owner_campaign_active", ["ownerId", "campaignId", "isActive"])
    .index("by_owner_campaign_amount", ["ownerId", "campaignId", "amount"])
    .index("by_campaign_active", ["campaignId", "isActive"])
    .index("by_campaign_amount", ["campaignId", "amount"])
    .index("by_campaign_owner_active", ["campaignId", "ownerId", "isActive"])
    .index("by_campaign_owner_amount", ["campaignId", "ownerId", "amount"]),

  drawSessions: defineTable({
    ownerId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    publicCode: v.optional(v.string()),
    publicCodeExpiresAt: v.optional(v.number()),
    deliveryMode: v.optional(deliveryModeValidator),
    hostDisplayNameSnapshot: v.optional(v.string()),
    hostSlugSnapshot: v.optional(v.string()),
    campaignNameSnapshot: v.optional(v.string()),
    campaignBrandNameSnapshot: v.optional(v.string()),
    campaignDescriptionSnapshot: v.optional(v.string()),
    campaignClaimHeadlineSnapshot: v.optional(v.string()),
    campaignClaimSubtitleSnapshot: v.optional(v.string()),
    campaignClaimCtaLabelSnapshot: v.optional(v.string()),
    campaignClaimCollectLabelSnapshot: v.optional(v.string()),
    campaignClaimWaitingMessageSnapshot: v.optional(v.string()),
    campaignThemeSnapshot: v.optional(v.union(v.literal("lunar"), v.literal("brand"))),
    campaignHeroAssetKeySnapshot: v.optional(v.string()),
    guestNameDisplay: v.string(),
    guestNameNormalized: v.string(),
    status: drawSessionStatusValidator,
    createdAt: v.number(),
    envelopeIndex: v.optional(v.number()),
    redemptionId: v.optional(v.id("redemptions")),
    redeemedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_status_delivery", ["ownerId", "status", "deliveryMode"])
    .index("by_owner_status_delivery_createdAt", [
      "ownerId",
      "status",
      "deliveryMode",
      "createdAt",
    ])
    .index("by_status_delivery_createdAt", ["status", "deliveryMode", "createdAt"])
    .index("by_owner_guestName", ["ownerId", "guestNameNormalized"])
    .index("by_campaign_guestName", ["campaignId", "guestNameNormalized"])
    .index("by_campaign_owner_status", ["campaignId", "ownerId", "status"])
    .index("by_campaign_owner_status_delivery", [
      "campaignId",
      "ownerId",
      "status",
      "deliveryMode",
    ])
    .index("by_campaign_owner_guest_status", [
      "campaignId",
      "ownerId",
      "guestNameNormalized",
      "status",
    ])
    .index("by_campaign_owner_createdAt", ["campaignId", "ownerId", "createdAt"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_publicCode", ["publicCode"])
    .index("by_publicCode_status", ["publicCode", "status"]),

  redemptions: defineTable({
    ownerId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    drawSessionId: v.id("drawSessions"),
    publicCode: v.optional(v.string()),
    deliveryMode: v.optional(deliveryModeValidator),
    hostDisplayNameSnapshot: v.optional(v.string()),
    hostSlugSnapshot: v.optional(v.string()),
    campaignNameSnapshot: v.optional(v.string()),
    campaignBrandNameSnapshot: v.optional(v.string()),
    campaignDescriptionSnapshot: v.optional(v.string()),
    campaignClaimHeadlineSnapshot: v.optional(v.string()),
    campaignClaimSubtitleSnapshot: v.optional(v.string()),
    campaignClaimCtaLabelSnapshot: v.optional(v.string()),
    campaignClaimCollectLabelSnapshot: v.optional(v.string()),
    campaignClaimWaitingMessageSnapshot: v.optional(v.string()),
    campaignThemeSnapshot: v.optional(v.union(v.literal("lunar"), v.literal("brand"))),
    campaignHeroAssetKeySnapshot: v.optional(v.string()),
    guestNameDisplay: v.string(),
    guestNameNormalized: v.string(),
    amount: v.number(),
    rarity: rarityValidator,
    budgetItemId: v.id("budgetItems"),
    envelopeIndex: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_owner_guestName", ["ownerId", "guestNameNormalized"])
    .index("by_owner_amount", ["ownerId", "amount"])
    .index("by_campaign_createdAt", ["campaignId", "createdAt"])
    .index("by_campaign_guestName", ["campaignId", "guestNameNormalized"])
    .index("by_campaign_owner_guestName", ["campaignId", "ownerId", "guestNameNormalized"])
    .index("by_campaign_amount", ["campaignId", "amount"])
    .index("by_campaign_owner_createdAt", ["campaignId", "ownerId", "createdAt"])
    .index("by_campaign_owner_amount", ["campaignId", "ownerId", "amount"]),
});
