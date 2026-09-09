import { TableAggregate } from "@convex-dev/aggregate";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import { isValidMigrationToken, migrationTokenEnvNames } from "./migrationToken";
import {
  campaignMetricKey,
  estimateAnalyticsCounterEventWrite,
  ownerMetricKey,
  playSessionCounterEventKey,
  redemptionCounterEventKey,
  rewardCounterEventKey,
  sessionCounterEventKey,
  type AnalyticsMetric,
  type AnalyticsCounterEventEstimate,
} from "../lib/analyticsPolicy";
import { DEFAULT_GAME_TEMPLATE_ID } from "../lib/gameTemplates";

type CounterCtx = QueryCtx | MutationCtx;
type OwnerMetric = AnalyticsMetric;
type CampaignMetric = AnalyticsMetric;
type CounterEventSource = "live" | "backfill";
type AnalyticsCounterTarget = {
  eventKey: string;
  metric: OwnerMetric;
};

type AnalyticsCounterBackfillEstimate = {
  countersWouldBackfill: number;
  counterEventsWouldBackfill: number;
  counterIncrementsWouldBackfill: number;
};

export const redemptionsByOwnerAmount = new TableAggregate<{
  Namespace: Id<"users">;
  Key: number;
  DataModel: DataModel;
  TableName: "redemptions";
}>(components.aggregate, {
  namespace: (doc) => doc.ownerId,
  sortKey: (doc) => doc.amount,
  sumValue: (doc) => doc.amount,
});

export const redemptionsByCampaignAmount = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "redemptions";
}>(components.aggregate, {
  namespace: (doc) => doc.campaignId ?? `legacy:${doc.ownerId}`,
  sortKey: (doc) => doc.amount,
  sumValue: (doc) => doc.amount,
});

const ownerCounters = new ShardedCounter<string>(components.shardedCounter, {
  defaultShards: 16,
});

async function recordAnalyticsCounterEvent(
  ctx: MutationCtx,
  args: {
    eventKey: string;
    ownerId: Id<"users">;
    campaignId?: Id<"campaigns">;
    metric: OwnerMetric;
    source: CounterEventSource;
  }
) {
  const existingEvent = await ctx.db
    .query("analyticsCounterEvents")
    .withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey))
    .unique();
  const estimate = estimateAnalyticsCounterEventWrite({
    existingEvent,
    ownerId: args.ownerId,
    campaignId: args.campaignId,
    metric: args.metric,
  });
  if (existingEvent) {
    if (estimate.markerWouldPatch === 0) {
      return false;
    }

    await ctx.db.patch(existingEvent._id, {
      campaignId: args.campaignId,
    });
    await ownerCounters.inc(ctx, campaignMetricKey(args.campaignId!, args.metric));
    return true;
  }

  await ctx.db.insert("analyticsCounterEvents", {
    eventKey: args.eventKey,
    ownerId: args.ownerId,
    campaignId: args.campaignId,
    metric: args.metric,
    source: args.source,
    createdAt: Date.now(),
  });
  await ownerCounters.inc(ctx, ownerMetricKey(args.ownerId, args.metric));
  if (args.campaignId) {
    await ownerCounters.inc(ctx, campaignMetricKey(args.campaignId, args.metric));
  }

  return true;
}

async function wouldRecordAnalyticsCounterEvent(
  ctx: CounterCtx,
  args: {
    eventKey: string;
    ownerId: Id<"users">;
    campaignId?: Id<"campaigns">;
    metric: OwnerMetric;
  }
): Promise<AnalyticsCounterEventEstimate> {
  const existingEvent = await ctx.db
    .query("analyticsCounterEvents")
    .withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey))
    .unique();
  return estimateAnalyticsCounterEventWrite({
    existingEvent,
    ownerId: args.ownerId,
    campaignId: args.campaignId,
    metric: args.metric,
  });
}

function sessionCounterBackfillTargets(sessionId: Id<"drawSessions">): AnalyticsCounterTarget[] {
  return [
    {
      eventKey: sessionCounterEventKey(sessionId),
      metric: "session_created",
    },
    {
      eventKey: playSessionCounterEventKey(sessionId, "game_start"),
      metric: "game_start",
    },
  ];
}

function redemptionCounterBackfillTargets(
  redemptionId: Id<"redemptions">,
  campaignId: Id<"campaigns"> | undefined
): AnalyticsCounterTarget[] {
  const targets: AnalyticsCounterTarget[] = [
    {
      eventKey: redemptionCounterEventKey(redemptionId),
      metric: "redemption_created",
    },
  ];
  if (campaignId) {
    targets.push(
      {
        eventKey: rewardCounterEventKey(redemptionId, "game_completion"),
        metric: "game_completion",
      },
      {
        eventKey: rewardCounterEventKey(redemptionId, "reward_outcome"),
        metric: "reward_outcome",
      },
      {
        eventKey: rewardCounterEventKey(redemptionId, "reward_claim"),
        metric: "reward_claim",
      }
    );
  }
  return targets;
}

async function estimateAnalyticsCounterTargets(
  ctx: CounterCtx,
  args: {
    targets: AnalyticsCounterTarget[];
    ownerId: Id<"users">;
    campaignId?: Id<"campaigns">;
  }
): Promise<AnalyticsCounterBackfillEstimate> {
  let countersWouldBackfill = 0;
  let counterEventsWouldBackfill = 0;
  let counterIncrementsWouldBackfill = 0;
  for (const target of args.targets) {
    const counterEstimate = await wouldRecordAnalyticsCounterEvent(ctx, {
      eventKey: target.eventKey,
      ownerId: args.ownerId,
      campaignId: args.campaignId,
      metric: target.metric,
    });
    if (counterEstimate.eventWouldBackfill) {
      countersWouldBackfill += 1;
    }
    counterEventsWouldBackfill +=
      counterEstimate.markerWouldInsert + counterEstimate.markerWouldPatch;
    counterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
  }

  return {
    countersWouldBackfill,
    counterEventsWouldBackfill,
    counterIncrementsWouldBackfill,
  };
}

async function recordAnalyticsCounterTargets(
  ctx: MutationCtx,
  args: {
    targets: AnalyticsCounterTarget[];
    ownerId: Id<"users">;
    campaignId?: Id<"campaigns">;
    source: CounterEventSource;
  }
) {
  let countersBackfilled = 0;
  for (const target of args.targets) {
    if (
      await recordAnalyticsCounterEvent(ctx, {
        eventKey: target.eventKey,
        ownerId: args.ownerId,
        campaignId: args.campaignId,
        metric: target.metric,
        source: args.source,
      })
    ) {
      countersBackfilled += 1;
    }
  }
  return countersBackfilled;
}

export async function recordSessionCreated(
  ctx: MutationCtx,
  sessionId: Id<"drawSessions">,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">
) {
  await recordAnalyticsCounterEvent(ctx, {
    eventKey: sessionCounterEventKey(sessionId),
    ownerId,
    campaignId,
    metric: "session_created",
    source: "live",
  });
  await recordAnalyticsCounterEvent(ctx, {
    eventKey: playSessionCounterEventKey(sessionId, "game_start"),
    ownerId,
    campaignId,
    metric: "game_start",
    source: "live",
  });
}

export async function recordRedemptionCreated(ctx: MutationCtx, redemption: Doc<"redemptions">) {
  await redemptionsByOwnerAmount.insert(ctx, redemption);
  if (redemption.campaignId) {
    await redemptionsByCampaignAmount.insert(ctx, redemption);
  }
  await recordAnalyticsCounterEvent(ctx, {
    eventKey: redemptionCounterEventKey(redemption._id),
    ownerId: redemption.ownerId,
    campaignId: redemption.campaignId,
    metric: "redemption_created",
    source: "live",
  });
  if (redemption.campaignId) {
    await recordAnalyticsCounterEvent(ctx, {
      eventKey: rewardCounterEventKey(redemption._id, "game_completion"),
      ownerId: redemption.ownerId,
      campaignId: redemption.campaignId,
      metric: "game_completion",
      source: "live",
    });
    await recordAnalyticsCounterEvent(ctx, {
      eventKey: rewardCounterEventKey(redemption._id, "reward_outcome"),
      ownerId: redemption.ownerId,
      campaignId: redemption.campaignId,
      metric: "reward_outcome",
      source: "live",
    });
    await recordAnalyticsCounterEvent(ctx, {
      eventKey: rewardCounterEventKey(redemption._id, "reward_claim"),
      ownerId: redemption.ownerId,
      campaignId: redemption.campaignId,
      metric: "reward_claim",
      source: "live",
    });
  }
}

export async function recordPublicPlayLinkOpen(
  ctx: MutationCtx,
  session: Doc<"drawSessions">
) {
  if (!session.campaignId) {
    return;
  }
  await recordAnalyticsCounterEvent(ctx, {
    eventKey: playSessionCounterEventKey(session._id, "game_open"),
    ownerId: session.ownerId,
    campaignId: session.campaignId,
    metric: "game_open",
    source: "live",
  });
  await recordAnalyticsCounterEvent(ctx, {
    eventKey: playSessionCounterEventKey(session._id, "public_play_link_open"),
    ownerId: session.ownerId,
    campaignId: session.campaignId,
    metric: "public_play_link_open",
    source: "live",
  });
}

async function countOwnerMetric(ctx: CounterCtx, ownerId: Id<"users">, metric: OwnerMetric) {
  return ownerCounters.count(ctx, ownerMetricKey(ownerId, metric));
}

export async function countOwnerRedemptions(ctx: CounterCtx, ownerId: Id<"users">) {
  return redemptionsByOwnerAmount.count(ctx, { namespace: ownerId });
}

async function countCampaignMetric(
  ctx: CounterCtx,
  campaignId: Id<"campaigns">,
  metric: CampaignMetric
) {
  return ownerCounters.count(ctx, campaignMetricKey(campaignId, metric));
}

async function requireOwnedCampaign(ctx: CounterCtx, ownerId: Id<"users">, campaignId: Id<"campaigns">) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== ownerId) {
    throw new Error("Không tìm thấy chiến dịch");
  }
  return campaign;
}

async function ownedCampaignIdOrUndefined(
  ctx: CounterCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | undefined
) {
  if (!campaignId) {
    return undefined;
  }

  const campaign = await ctx.db.get(campaignId);
  return campaign?.ownerId === ownerId ? campaign._id : undefined;
}

function normalizeBackfillLimit(limit: number | undefined) {
  if (limit === undefined) {
    return 200;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit phải là số nguyên dương");
  }
  return Math.min(limit, 500);
}

async function requireAnalyticsBackfillOwner(
  ctx: MutationCtx,
  requestedOwnerId: Id<"users"> | undefined,
  migrationToken: string | undefined
) {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId) {
    if (requestedOwnerId && requestedOwnerId !== authUserId) {
      throw new Error("Bạn không có quyền backfill analytics này");
    }
    const owner = await ctx.db.get(authUserId);
    if (!owner) {
      throw new Error("Không tìm thấy host");
    }
    return authUserId;
  }

  if (!isValidMigrationToken(migrationToken)) {
    throw new Error(
      `Cần đăng nhập hoặc ${migrationTokenEnvNames.join(" / ")} để backfill analytics`
    );
  }
  if (!requestedOwnerId) {
    throw new Error("ownerId là bắt buộc khi backfill analytics bằng migration token");
  }

  const owner = await ctx.db.get(requestedOwnerId);
  if (!owner) {
    throw new Error("Không tìm thấy host");
  }
  return requestedOwnerId;
}

export const getOwnerAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem analytics này",
    });

    const [
      aggregatedRedemptionCount,
      aggregatedRedeemedAmount,
      sessionCreatedEvents,
      redemptionCreatedEvents,
      gameOpenEvents,
      gameStartEvents,
      gameCompletionEvents,
      rewardOutcomeEvents,
      rewardClaimEvents,
      publicPlayLinkOpenEvents,
    ] =
      await Promise.all([
        countOwnerRedemptions(ctx, ownerId),
        redemptionsByOwnerAmount.sum(ctx, { namespace: ownerId }),
        countOwnerMetric(ctx, ownerId, "session_created"),
        countOwnerMetric(ctx, ownerId, "redemption_created"),
        countOwnerMetric(ctx, ownerId, "game_open"),
        countOwnerMetric(ctx, ownerId, "game_start"),
        countOwnerMetric(ctx, ownerId, "game_completion"),
        countOwnerMetric(ctx, ownerId, "reward_outcome"),
        countOwnerMetric(ctx, ownerId, "reward_claim"),
        countOwnerMetric(ctx, ownerId, "public_play_link_open"),
      ]);
    const conversion = gameOpenEvents > 0 ? rewardClaimEvents / gameOpenEvents : null;

    return {
      aggregatedRedemptionCount,
      aggregatedRedeemedAmount,
      sessionCreatedEvents,
      redemptionCreatedEvents,
      gameOpenEvents,
      gameStartEvents,
      gameCompletionEvents,
      rewardOutcomeEvents,
      rewardClaimEvents,
      publicPlayLinkOpenEvents,
      gameMetrics: {
        gameTemplateId: DEFAULT_GAME_TEMPLATE_ID,
        opens: gameOpenEvents,
        starts: gameStartEvents,
        completions: gameCompletionEvents,
        rewardOutcomes: rewardOutcomeEvents,
        claims: rewardClaimEvents,
        conversion,
        channelSharePerformance: {
          publicPlayLinkOpens: publicPlayLinkOpenEvents,
        },
      },
    };
  },
});

export const backfillOwnerRedemptionAggregate = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireAnalyticsBackfillOwner(ctx, args.ownerId, args.migrationToken);
    const limit = normalizeBackfillLimit(args.limit);
    const dryRun = args.dryRun ?? false;
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);

    let redemptionAggregatesBackfilled = 0;
    let campaignRedemptionAggregatesBackfilled = 0;
    let redemptionCountersBackfilled = 0;
    let redemptionAggregatesWouldBackfill = 0;
    let campaignRedemptionAggregatesWouldBackfill = 0;
    let redemptionCountersWouldBackfill = 0;
    let redemptionCounterEventsWouldBackfill = 0;
    let redemptionCounterIncrementsWouldBackfill = 0;
    for (const redemption of redemptions) {
      const ownedCampaignId = await ownedCampaignIdOrUndefined(
        ctx,
        ownerId,
        redemption.campaignId
      );
      if (dryRun) {
        redemptionAggregatesWouldBackfill += 1;
        if (ownedCampaignId) {
          campaignRedemptionAggregatesWouldBackfill += 1;
        }
        const counterEstimate = await estimateAnalyticsCounterTargets(ctx, {
          targets: redemptionCounterBackfillTargets(redemption._id, ownedCampaignId),
          ownerId,
          campaignId: ownedCampaignId,
        });
        redemptionCountersWouldBackfill += counterEstimate.countersWouldBackfill;
        redemptionCounterEventsWouldBackfill += counterEstimate.counterEventsWouldBackfill;
        redemptionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        await redemptionsByOwnerAmount.insertIfDoesNotExist(ctx, redemption);
        redemptionAggregatesBackfilled += 1;
        if (ownedCampaignId) {
          await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx, {
            ...redemption,
            campaignId: ownedCampaignId,
          });
          campaignRedemptionAggregatesBackfilled += 1;
        }
        redemptionCountersBackfilled += await recordAnalyticsCounterTargets(ctx, {
          targets: redemptionCounterBackfillTargets(redemption._id, ownedCampaignId),
          ownerId,
          campaignId: ownedCampaignId,
          source: "backfill",
        });
      }
    }

    const sessions = await ctx.db
      .query("drawSessions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);

    let sessionCountersBackfilled = 0;
    let sessionCountersWouldBackfill = 0;
    let sessionCounterEventsWouldBackfill = 0;
    let sessionCounterIncrementsWouldBackfill = 0;
    for (const session of sessions) {
      const ownedCampaignId = await ownedCampaignIdOrUndefined(
        ctx,
        ownerId,
        session.campaignId
      );
      if (dryRun) {
        const counterEstimate = await estimateAnalyticsCounterTargets(ctx, {
          targets: sessionCounterBackfillTargets(session._id),
          ownerId,
          campaignId: ownedCampaignId,
        });
        sessionCountersWouldBackfill += counterEstimate.countersWouldBackfill;
        sessionCounterEventsWouldBackfill += counterEstimate.counterEventsWouldBackfill;
        sessionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        sessionCountersBackfilled += await recordAnalyticsCounterTargets(ctx, {
          targets: sessionCounterBackfillTargets(session._id),
          ownerId,
          campaignId: ownedCampaignId,
          source: "backfill",
        });
      }
    }

    return {
      redemptionsScanned: redemptions.length,
      sessionsScanned: sessions.length,
      redemptionAggregatesBackfilled,
      campaignRedemptionAggregatesBackfilled,
      redemptionCountersBackfilled,
      sessionCountersBackfilled,
      dryRun,
      redemptionAggregatesWouldBackfill,
      campaignRedemptionAggregatesWouldBackfill,
      redemptionCountersWouldBackfill,
      redemptionCounterEventsWouldBackfill,
      redemptionCounterIncrementsWouldBackfill,
      sessionCountersWouldBackfill,
      sessionCounterEventsWouldBackfill,
      sessionCounterIncrementsWouldBackfill,
    };
  },
});

export const getCampaignAnalytics = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem analytics này",
    });
    const campaign = await requireOwnedCampaign(ctx, ownerId, args.campaignId);

    const [
      aggregatedRedemptionCount,
      aggregatedRedeemedAmount,
      sessionCreatedEvents,
      redemptionCreatedEvents,
      gameOpenEvents,
      gameStartEvents,
      gameCompletionEvents,
      rewardOutcomeEvents,
      rewardClaimEvents,
      publicPlayLinkOpenEvents,
    ] =
      await Promise.all([
        redemptionsByCampaignAmount.count(ctx, { namespace: args.campaignId }),
        redemptionsByCampaignAmount.sum(ctx, { namespace: args.campaignId }),
        countCampaignMetric(ctx, args.campaignId, "session_created"),
        countCampaignMetric(ctx, args.campaignId, "redemption_created"),
        countCampaignMetric(ctx, args.campaignId, "game_open"),
        countCampaignMetric(ctx, args.campaignId, "game_start"),
        countCampaignMetric(ctx, args.campaignId, "game_completion"),
        countCampaignMetric(ctx, args.campaignId, "reward_outcome"),
        countCampaignMetric(ctx, args.campaignId, "reward_claim"),
        countCampaignMetric(ctx, args.campaignId, "public_play_link_open"),
      ]);
    const conversion = gameOpenEvents > 0 ? rewardClaimEvents / gameOpenEvents : null;

    return {
      campaignId: campaign._id,
      campaignName: campaign.name,
      aggregatedRedemptionCount,
      aggregatedRedeemedAmount,
      sessionCreatedEvents,
      redemptionCreatedEvents,
      gameOpenEvents,
      gameStartEvents,
      gameCompletionEvents,
      rewardOutcomeEvents,
      rewardClaimEvents,
      publicPlayLinkOpenEvents,
      gameMetrics: {
        gameTemplateId: DEFAULT_GAME_TEMPLATE_ID,
        opens: gameOpenEvents,
        starts: gameStartEvents,
        completions: gameCompletionEvents,
        rewardOutcomes: rewardOutcomeEvents,
        claims: rewardClaimEvents,
        conversion,
        channelSharePerformance: {
          publicPlayLinkOpens: publicPlayLinkOpenEvents,
        },
      },
    };
  },
});

export const backfillCampaignAnalytics = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    campaignId: v.id("campaigns"),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireAnalyticsBackfillOwner(ctx, args.ownerId, args.migrationToken);
    await requireOwnedCampaign(ctx, ownerId, args.campaignId);

    const limit = normalizeBackfillLimit(args.limit);
    const dryRun = args.dryRun ?? false;
    const campaignRedemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_campaign_owner_createdAt", (q) =>
        q.eq("campaignId", args.campaignId).eq("ownerId", ownerId)
      )
      .order("desc")
      .take(limit);
    const legacyOwnerRedemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);

    let patched = 0;
    let redemptionAggregatesBackfilled = 0;
    let redemptionCountersBackfilled = 0;
    let sessionCountersBackfilled = 0;
    let redemptionsWouldPatchCampaign = 0;
    let redemptionAggregatesWouldBackfill = 0;
    let redemptionCountersWouldBackfill = 0;
    let redemptionCounterEventsWouldBackfill = 0;
    let redemptionCounterIncrementsWouldBackfill = 0;
    let sessionCountersWouldBackfill = 0;
    let sessionCounterEventsWouldBackfill = 0;
    let sessionCounterIncrementsWouldBackfill = 0;

    for (const redemption of campaignRedemptions) {
      if (dryRun) {
        redemptionAggregatesWouldBackfill += 1;
        const counterEstimate = await estimateAnalyticsCounterTargets(ctx, {
          targets: redemptionCounterBackfillTargets(redemption._id, args.campaignId),
          ownerId,
          campaignId: args.campaignId,
        });
        redemptionCountersWouldBackfill += counterEstimate.countersWouldBackfill;
        redemptionCounterEventsWouldBackfill += counterEstimate.counterEventsWouldBackfill;
        redemptionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx, redemption);
        redemptionAggregatesBackfilled += 1;
        redemptionCountersBackfilled += await recordAnalyticsCounterTargets(ctx, {
          targets: redemptionCounterBackfillTargets(redemption._id, args.campaignId),
          ownerId,
          campaignId: args.campaignId,
          source: "backfill",
        });
      }
    }

    for (const redemption of legacyOwnerRedemptions) {
      if (redemption.campaignId) {
        continue;
      }
      let targetRedemption = redemption;
      const session = await ctx.db.get(targetRedemption.drawSessionId);
      if (session?.ownerId === ownerId && session.campaignId === args.campaignId) {
        if (dryRun) {
          redemptionsWouldPatchCampaign += 1;
        } else {
          await ctx.db.patch(targetRedemption._id, {
            campaignId: session.campaignId,
          });
          patched += 1;
        }
        targetRedemption = {
          ...targetRedemption,
          campaignId: session.campaignId,
        };
      }

      if (dryRun && targetRedemption.campaignId === args.campaignId) {
        redemptionAggregatesWouldBackfill += 1;
        const counterEstimate = await estimateAnalyticsCounterTargets(ctx, {
          targets: redemptionCounterBackfillTargets(targetRedemption._id, args.campaignId),
          ownerId,
          campaignId: args.campaignId,
        });
        redemptionCountersWouldBackfill += counterEstimate.countersWouldBackfill;
        redemptionCounterEventsWouldBackfill += counterEstimate.counterEventsWouldBackfill;
        redemptionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      }

      if (!dryRun && targetRedemption.campaignId === args.campaignId) {
        await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx, targetRedemption);
        redemptionAggregatesBackfilled += 1;
        redemptionCountersBackfilled += await recordAnalyticsCounterTargets(ctx, {
          targets: redemptionCounterBackfillTargets(targetRedemption._id, args.campaignId),
          ownerId,
          campaignId: args.campaignId,
          source: "backfill",
        });
      }
    }

    const sessions = await ctx.db
      .query("drawSessions")
      .withIndex("by_campaign_owner_createdAt", (q) =>
        q.eq("campaignId", args.campaignId).eq("ownerId", ownerId)
      )
      .order("desc")
      .take(limit);

    for (const session of sessions) {
      if (dryRun) {
        const counterEstimate = await estimateAnalyticsCounterTargets(ctx, {
          targets: sessionCounterBackfillTargets(session._id),
          ownerId,
          campaignId: args.campaignId,
        });
        sessionCountersWouldBackfill += counterEstimate.countersWouldBackfill;
        sessionCounterEventsWouldBackfill += counterEstimate.counterEventsWouldBackfill;
        sessionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        sessionCountersBackfilled += await recordAnalyticsCounterTargets(ctx, {
          targets: sessionCounterBackfillTargets(session._id),
          ownerId,
          campaignId: args.campaignId,
          source: "backfill",
        });
      }
    }

    return {
      redemptionsScanned: campaignRedemptions.length + legacyOwnerRedemptions.length,
      sessionsScanned: sessions.length,
      patched,
      redemptionAggregatesBackfilled,
      redemptionCountersBackfilled,
      sessionCountersBackfilled,
      dryRun,
      redemptionsWouldPatchCampaign,
      redemptionAggregatesWouldBackfill,
      redemptionCountersWouldBackfill,
      redemptionCounterEventsWouldBackfill,
      redemptionCounterIncrementsWouldBackfill,
      sessionCountersWouldBackfill,
      sessionCounterEventsWouldBackfill,
      sessionCounterIncrementsWouldBackfill,
    };
  },
});
