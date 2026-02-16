import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const rarityValidator = v.union(v.literal("common"), v.literal("rare"), v.literal("legend"));
const drawSessionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("redeemed"),
  v.literal("cancelled")
);

export default defineSchema({
  users: defineTable({
    username: v.string(),
    usernameNormalized: v.string(),
    pinHash: v.string(),
    pinSalt: v.string(),
    createdAt: v.number(),
  })
    .index("by_username_normalized", ["usernameNormalized"])
    .index("by_username", ["username"]),

  ownerBudgets: defineTable({
    ownerId: v.id("users"),
    totalBudget: v.number(), // Tổng ngân sách
    remainingBudget: v.number(), // Ngân sách còn lại
    isSetupCompleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  budgetItems: defineTable({
    ownerId: v.id("users"),
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
    .index("by_owner_amount", ["ownerId", "amount"]),

  drawSessions: defineTable({
    ownerId: v.id("users"),
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
    .index("by_owner_guestName", ["ownerId", "guestNameNormalized"])
    .index("by_owner_createdAt", ["ownerId", "createdAt"]),

  redemptions: defineTable({
    ownerId: v.id("users"),
    drawSessionId: v.id("drawSessions"),
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
    .index("by_owner_amount", ["ownerId", "amount"]),
});
