import { v } from "convex/values";
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import { claimDetailView } from "./publicPlay";
import {
  maskRewardCode,
  rewardCodeMatchesSearch,
} from "../lib/rewardClaimPolicy";
import type { RewardChannel } from "../lib/analyticsPolicy";

/**
 * Owner-facing reward claim operations (slice 4b): the paginated claims
 * list with status/channel/reward-type filters and exact-code search, the
 * explicit code reveal, and the fulfil/undo handover audit. Legacy li xi
 * redemptions keep their own read-only tables and never enter this module.
 *
 * Authorization: the owner is always derived from the Convex Auth session
 * (requireResolvedOwner → campaign → claim); missing and foreign rows share
 * one fail-closed message (no existence leak). Full codes never appear in
 * list payloads — every list row carries only the masked form.
 */

const CLAIM_NOT_FOUND_MESSAGE = "Không tìm thấy yêu cầu nhận thưởng";

/** Bounded post-filter scan per request: index rows read beyond the
 * requested page while applying non-indexed filters (reward type, code). */
const MAX_FILTER_SCAN_ROWS = 600;
const MAX_PAGE_ITEMS = 100;

async function requireOwnedClaim(
  ctx: QueryCtx | MutationCtx,
  claimId: string,
): Promise<{ ownerId: Id<"users">; claim: Doc<"rewardClaims"> }> {
  const { ownerId } = await requireResolvedOwner(ctx, undefined, {
    notFoundMessage: "Không tìm thấy host",
    forbiddenMessage: "Bạn không có quyền truy cập yêu cầu nhận thưởng này",
  });
  const normalizedId = ctx.db.normalizeId("rewardClaims", claimId);
  if (!normalizedId) {
    throw new Error(CLAIM_NOT_FOUND_MESSAGE);
  }
  const claim = await ctx.db.get(normalizedId);
  if (!claim || claim.ownerId !== ownerId) {
    throw new Error(CLAIM_NOT_FOUND_MESSAGE);
  }
  return { ownerId, claim };
}

async function requireOwnedCampaignForClaims(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">,
): Promise<Doc<"campaigns">> {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    throw new Error("Không tìm thấy chiến dịch");
  }
  return campaign;
}

/**
 * Full code resolution identical to the public claim detail view: the
 * immutable award snapshot wins, the inventory item is the fallback. The
 * value stays server-side; list rows project only maskRewardCode(code).
 */
async function resolveClaimFullCode(
  ctx: QueryCtx,
  outcome: Doc<"rewardOutcomes">,
): Promise<string | null> {
  let inventoryCode: string | null = null;
  if (outcome.rewardType === "voucher" && outcome.rewardItemId) {
    const item = await ctx.db.get(outcome.rewardItemId);
    inventoryCode = item?.secretCode?.trim() || null;
  }
  return outcome.awardSecretCode?.trim() || inventoryCode;
}

function normalizeListPageItems(numItems: number) {
  if (!Number.isInteger(numItems) || numItems <= 0) {
    throw new Error("numItems phải là số nguyên dương");
  }
  return Math.min(numItems, MAX_PAGE_ITEMS);
}

type RewardClaimsIndex =
  | "by_campaign_claimedAt"
  | "by_campaign_game_claimedAt"
  | "by_campaign_fulfilmentState_claimedAt"
  | "by_campaign_channel_claimedAt";

function chooseClaimsIndex(
  filters: {
    campaignGameId?: Id<"campaignGames">;
    fulfilmentState?: "pending" | "fulfilled";
    channel?: RewardChannel;
  },
): RewardClaimsIndex {
  if (filters.fulfilmentState) {
    return "by_campaign_fulfilmentState_claimedAt";
  }
  if (filters.channel) {
    return "by_campaign_channel_claimedAt";
  }
  if (filters.campaignGameId) {
    return "by_campaign_game_claimedAt";
  }
  return "by_campaign_claimedAt";
}

type ClaimsPage = PaginationResult<Doc<"rewardClaims">>;

/**
 * One indexed page of claims, newest first. Each index gets its own literal
 * equality chain (Convex index builders are typed per index, so a shared
 * dynamic chain would not typecheck).
 */
async function paginateClaimsPage(
  ctx: QueryCtx,
  index: RewardClaimsIndex,
  scope: {
    campaignId: Id<"campaigns">;
    campaignGameId?: Id<"campaignGames">;
    fulfilmentState?: "pending" | "fulfilled";
    channel?: RewardChannel;
  },
  paginationOpts: { numItems: number; cursor: string | null },
): Promise<ClaimsPage> {
  if (index === "by_campaign_fulfilmentState_claimedAt") {
    return ctx.db
      .query("rewardClaims")
      .withIndex(index, (q) =>
        q.eq("campaignId", scope.campaignId).eq("fulfilmentState", scope.fulfilmentState!),
      )
      .order("desc")
      .paginate(paginationOpts);
  }
  if (index === "by_campaign_channel_claimedAt") {
    return ctx.db
      .query("rewardClaims")
      .withIndex(index, (q) => q.eq("campaignId", scope.campaignId).eq("channel", scope.channel!))
      .order("desc")
      .paginate(paginationOpts);
  }
  if (index === "by_campaign_game_claimedAt") {
    return ctx.db
      .query("rewardClaims")
      .withIndex(index, (q) =>
        q.eq("campaignId", scope.campaignId).eq("campaignGameId", scope.campaignGameId!),
      )
      .order("desc")
      .paginate(paginationOpts);
  }
  return ctx.db
    .query("rewardClaims")
    .withIndex(index, (q) => q.eq("campaignId", scope.campaignId))
    .order("desc")
    .paginate(paginationOpts);
}

export const listRewardClaims = query({
  args: {
    campaignId: v.id("campaigns"),
    campaignGameId: v.optional(v.id("campaignGames")),
    fulfilmentState: v.optional(v.union(v.literal("pending"), v.literal("fulfilled"))),
    channel: v.optional(v.union(v.literal("public-link"), v.literal("station"))),
    rewardType: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("voucher"),
        v.literal("physical"),
        v.literal("points"),
        v.literal("none"),
      ),
    ),
    codeSearch: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem yêu cầu nhận thưởng này",
    });
    await requireOwnedCampaignForClaims(ctx, ownerId, args.campaignId);

    let campaignGameId: Id<"campaignGames"> | undefined;
    if (args.campaignGameId) {
      const normalizedGameId = ctx.db.normalizeId("campaignGames", args.campaignGameId);
      const campaignGame = normalizedGameId ? await ctx.db.get(normalizedGameId) : null;
      if (!campaignGame || campaignGame.ownerId !== ownerId || campaignGame.campaignId !== args.campaignId) {
        throw new Error("Không tìm thấy trò chơi");
      }
      campaignGameId = campaignGame._id;
    }

    const numItems = normalizeListPageItems(args.paginationOpts.numItems);
    const index = chooseClaimsIndex({ campaignGameId, fulfilmentState: args.fulfilmentState, channel: args.channel });

    const rows: Awaited<ReturnType<typeof buildClaimListRow>>[] = [];
    let cursor = args.paginationOpts.cursor;
    let continueCursor = "";
    let isDone = false;
    let scanned = 0;
    while (rows.length < numItems && !isDone && scanned < MAX_FILTER_SCAN_ROWS) {
      const page = await paginateClaimsPage(
        ctx,
        index,
        { campaignId: args.campaignId, campaignGameId, fulfilmentState: args.fulfilmentState, channel: args.channel },
        { numItems: Math.min(numItems - rows.length, 100), cursor },
      );
      for (const claim of page.page) {
        scanned += 1;
        // Non-indexed filters: per-game scope when another index leads, the
        // outcome-derived reward type, and the exact-code search.
        if (campaignGameId && claim.campaignGameId !== campaignGameId) {
          continue;
        }
        const row = await buildClaimListRow(ctx, claim);
        if (args.rewardType && row.reward.rewardType !== args.rewardType) {
          continue;
        }
        if (args.codeSearch !== undefined && args.codeSearch.trim()) {
          const outcome = await ctx.db.get(claim.outcomeId);
          const fullCode = outcome ? await resolveClaimFullCode(ctx, outcome) : null;
          if (!rewardCodeMatchesSearch(fullCode, args.codeSearch)) {
            continue;
          }
        }
        rows.push(row);
      }
      isDone = page.isDone;
      continueCursor = page.continueCursor;
      cursor = page.continueCursor;
    }

    return {
      page: rows,
      isDone,
      continueCursor,
    };
  },
});

async function buildClaimListRow(ctx: QueryCtx, claim: Doc<"rewardClaims">) {
  const [outcome, game, participant] = await Promise.all([
    ctx.db.get(claim.outcomeId),
    ctx.db.get(claim.campaignGameId),
    ctx.db.get(claim.participantId),
  ]);
  const fullCode = outcome ? await resolveClaimFullCode(ctx, outcome) : null;
  return {
    claimId: claim._id,
    claimedAt: claim.claimedAt,
    fulfilmentState: claim.fulfilmentState,
    fulfilledAt: claim.fulfilledAt ?? null,
    channel: claim.channel,
    channelLabel: claim.channelLabel ?? null,
    participantDisplayName: participant?.displayName ?? null,
    game: {
      campaignGameId: claim.campaignGameId,
      name: game?.name ?? null,
      templateId: game?.templateId ?? null,
    },
    reward: {
      label: outcome?.label ?? null,
      rewardType: outcome?.rewardType ?? "none",
      amount: outcome?.amount ?? null,
    },
    maskedCode: maskRewardCode(fullCode),
  };
}

/** Explicit owner action: the only surface that returns the full code. */
export const revealRewardClaimCode = query({
  args: {
    claimId: v.id("rewardClaims"),
  },
  handler: async (ctx, args) => {
    const { claim } = await requireOwnedClaim(ctx, args.claimId);
    const outcome = await ctx.db.get(claim.outcomeId);
    if (!outcome) {
      throw new Error(CLAIM_NOT_FOUND_MESSAGE);
    }
    // The operator sees the same claim instructions the participant saw:
    // the session's frozen publicCopy, falling back to the built-in default.
    const session = claim.playSessionId ? await ctx.db.get(claim.playSessionId) : null;
    return {
      claimId: claim._id,
      claim: await claimDetailView(ctx, outcome, session?.rulesSnapshot?.publicCopy ?? null),
    };
  },
});

/** Idempotent handover mark: sets fulfilledAt/fulfilledBy exactly once. */
export const markRewardClaimFulfilled = mutation({
  args: {
    claimId: v.id("rewardClaims"),
  },
  handler: async (ctx, args) => {
    const { ownerId, claim } = await requireOwnedClaim(ctx, args.claimId);
    if (claim.fulfilmentState !== "fulfilled") {
      await ctx.db.patch(claim._id, {
        fulfilmentState: "fulfilled",
        fulfilledAt: Date.now(),
        fulfilledBy: ownerId,
      });
    }
    const stored = await ctx.db.get(claim._id);
    return {
      claimId: claim._id,
      fulfilmentState: "fulfilled" as const,
      fulfilledAt: stored?.fulfilledAt ?? null,
    };
  },
});

/** Idempotent undo: clears the fulfilment audit back to pending. */
export const undoRewardClaimFulfilment = mutation({
  args: {
    claimId: v.id("rewardClaims"),
  },
  handler: async (ctx, args) => {
    const { claim } = await requireOwnedClaim(ctx, args.claimId);
    if (claim.fulfilmentState !== "pending") {
      await ctx.db.patch(claim._id, {
        fulfilmentState: "pending",
        fulfilledAt: undefined,
        fulfilledBy: undefined,
      });
    }
    return {
      claimId: claim._id,
      fulfilmentState: "pending" as const,
    };
  },
});
