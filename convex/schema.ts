import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
	campaignGameConfigValidator,
	campaignGamePlayLimitsValidator,
	gameTemplateIdValidator,
} from "./gameTemplateValues";

const rewardTypeValidator = v.union(
	v.literal("cash"),
	v.literal("voucher"),
	v.literal("physical"),
	v.literal("points"),
	v.literal("none"),
);

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

  campaignGames: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    templateId: gameTemplateIdValidator,
    config: campaignGameConfigValidator,
    name: v.optional(v.string()),
    playLimits: v.optional(campaignGamePlayLimitsValidator),
    // Admission accounting readiness gate: 1 = the per-game session aggregate
    // is authoritative; absent/0 = historical rows require the maintenance
    // backfill before new admissions are trusted.
    accountingVersion: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_template", ["campaignId", "templateId"])
    .index("by_owner_template_status", ["ownerId", "templateId", "status"]),

  // Owner-level accounting readiness for the rewarded-outcome quota
  // aggregate; legacy generic outcomes require the maintenance backfill
  // before reward allocation can trust the combined usage numbers.
  accountingStates: defineTable({
    ownerId: v.id("users"),
    rewardedOutcomesVersion: v.number(),
    // Server-owned finite traversal position for the owner reward backfill:
    // phase = cash | voucher | physical | points; cursor = opaque paginate
    // cursor inside that phase. Progress is written only by applied (non
    // dry-run) pages and proves every drained phase.
    rewardedPhase: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("voucher"),
        v.literal("physical"),
        v.literal("points"),
      ),
    ),
    rewardedPhaseCursor: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // Generic self-serve play foundation (stage 1). Legacy drawSessions /
  // redemptions remain the li xi compatibility boundary.
  participants: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    token: v.string(),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_campaign", ["token", "campaignId"])
    .index("by_campaign_createdAt", ["campaignId", "createdAt"]),

  playSessions: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    campaignGameId: v.id("campaignGames"),
    participantId: v.id("participants"),
    shareLinkId: v.optional(v.id("publicPlayLinks")),
    channel: v.union(v.literal("public-link"), v.literal("station")),
    channelLabel: v.optional(v.string()),
    sessionToken: v.string(),
    // Client-persisted idempotency key for session start; lets a lost first
    // response be recovered instead of allocating an orphan duplicate.
    startKey: v.optional(v.string()),
    // Frozen game rules captured at admission: gameplay validation, reward
    // strategy, and participant presentation use this snapshot; campaign,
    // link, and game lifecycle guards stay separate.
    rulesSnapshot: v.optional(
      v.object({
        templateId: gameTemplateIdValidator,
        rewardSource: v.union(v.literal("campaign-budget"), v.literal("campaign-inventory")),
        rewardMode: v.union(v.literal("rewarded"), v.literal("engagement")),
        noRewardWeight: v.number(),
        noRewardLabel: v.string(),
        rewardPoolTag: v.string(),
        publicCopy: v.object({
          headline: v.string(),
          subtitle: v.string(),
          startCtaLabel: v.string(),
          collectCtaLabel: v.string(),
          waitingMessage: v.string(),
        }),
        wheelSegments: v.optional(
          v.array(v.object({ key: v.string(), label: v.string() })),
        ),
        scratchCard: v.optional(
          v.object({
            coverStyle: v.union(
              v.literal("gold"),
              v.literal("teal"),
              v.literal("crimson"),
            ),
            revealThresholdPercent: v.number(),
          }),
        ),
        slotReels: v.optional(
          v.object({
            reelTheme: v.union(
              v.literal("gold"),
              v.literal("neon"),
              v.literal("festive"),
            ),
            // Frozen winning combination per candidate item (bounded set) and
            // the documented miss combination; display-only, item-id keyed
            // (plain string like wheel segment keys).
            winningCombinations: v.array(
              v.object({
                itemId: v.string(),
                symbolKeys: v.array(v.string()),
              }),
            ),
            missCombination: v.array(v.string()),
          }),
        ),
        // PRIVATE quiz half: correct answers + explanations + pass rule.
        // Never projected through public surfaces; only the public half
        // (prompts/choices/passCount) reaches the participant snapshot.
        quiz: v.optional(
          v.object({
            passCount: v.number(),
            questions: v.array(
              v.object({
                prompt: v.string(),
                choices: v.array(v.string()),
                correctIndex: v.number(),
                explanation: v.optional(v.string()),
              }),
            ),
          }),
        ),
      }),
    ),
    // Bounded multi-step progression (quiz): accepted answers in order,
    // handler-bounded to the frozen question count. Absent until the first
    // accepted answer.
    quizProgress: v.optional(
      v.object({
        answers: v.array(
          v.object({
            questionIndex: v.number(),
            choiceIndex: v.number(),
          }),
        ),
      }),
    ),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("cancelled")),
    outcomeId: v.optional(v.id("rewardOutcomes")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_participant_game_status", ["participantId", "campaignGameId", "status"])
    .index("by_campaignGame_status", ["campaignGameId", "status"])
    .index("by_shareLink_status", ["shareLinkId", "status"])
    .index("by_shareLink_startKey", ["shareLinkId", "startKey"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"])
    .index("by_campaign_createdAt", ["campaignId", "createdAt"]),

  rewardInventory: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    name: v.string(),
    rewardType: rewardTypeValidator,
    amount: v.optional(v.number()),
    secretCode: v.optional(v.string()),
    quantityTotal: v.number(),
    quantityRemaining: v.number(),
    weight: v.number(),
    isActive: v.boolean(),
    displayOrder: v.number(),
    poolTag: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_campaign_active", ["campaignId", "isActive"])
    .index("by_campaign_owner_active", ["campaignId", "ownerId", "isActive"])
    .index("by_owner_active", ["ownerId", "isActive"]),

  rewardOutcomes: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    campaignGameId: v.id("campaignGames"),
    playSessionId: v.id("playSessions"),
    rewardItemId: v.optional(v.id("rewardInventory")),
    rewardType: rewardTypeValidator,
    label: v.string(),
    amount: v.optional(v.number()),
    // Immutable award snapshot for claim recovery. Server-private: never part
    // of public catalog data or analytics events.
    awardSecretCode: v.optional(v.string()),
    status: v.union(v.literal("granted"), v.literal("claimed")),
    grantedAt: v.number(),
    claimedAt: v.optional(v.number()),
  })
    .index("by_playSession", ["playSessionId"])
    .index("by_campaign_game_grantedAt", ["campaignId", "campaignGameId", "grantedAt"])
    .index("by_owner_grantedAt", ["ownerId", "grantedAt"])
    .index("by_owner_rewardType", ["ownerId", "rewardType"]),

  rewardClaims: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    campaignGameId: v.id("campaignGames"),
    outcomeId: v.id("rewardOutcomes"),
    playSessionId: v.id("playSessions"),
    participantId: v.id("participants"),
    channel: v.union(v.literal("public-link"), v.literal("station")),
    channelLabel: v.optional(v.string()),
    fulfilmentState: v.union(v.literal("pending"), v.literal("fulfilled")),
    claimedAt: v.number(),
  })
    .index("by_outcome", ["outcomeId"])
    .index("by_campaign_claimedAt", ["campaignId", "claimedAt"])
    .index("by_campaign_game_claimedAt", ["campaignId", "campaignGameId", "claimedAt"]),

  publicPlayLinks: defineTable({
    ownerId: v.id("users"),
    campaignId: v.id("campaigns"),
    campaignGameId: v.id("campaignGames"),
    shareCode: v.string(),
    channel: v.string(),
    label: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("revoked")),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shareCode", ["shareCode"])
    .index("by_campaignGame_status", ["campaignGameId", "status"])
    .index("by_campaign_createdAt", ["campaignId", "createdAt"]),

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
    // Stage-1 generic play attribution so channel/game reporting is real data.
    campaignGameId: v.optional(v.id("campaignGames")),
    shareLinkId: v.optional(v.id("publicPlayLinks")),
    channel: v.optional(v.union(v.literal("public-link"), v.literal("station"))),
    channelLabel: v.optional(v.string()),
    metric: v.union(
      v.literal("session_created"),
      v.literal("redemption_created"),
      v.literal("game_open"),
      v.literal("game_start"),
      v.literal("game_completion"),
      v.literal("reward_outcome"),
      v.literal("reward_claim"),
      v.literal("public_play_link_open"),
    ),
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
