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
  COUNTER_SCOPES_VERSION,
  campaignChannelMetricKey,
  campaignGameMetricKey,
  campaignMetricKey,
  estimateAnalyticsCounterEventWrite,
  gameChannelMetricKey,
  ownerMetricKey,
  playSessionCounterEventKey,
  redemptionCounterEventKey,
  rewardCounterEventKey,
  sessionCounterEventKey,
  shareLinkMetricKey,
  type AnalyticsMetric,
  type AnalyticsCounterEventEstimate,
  type RewardChannel,
} from "../lib/analyticsPolicy";
import { requireGameTemplateId } from "../lib/gameTemplates";

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

/**
 * Rewarded generic outcomes share the account reward quota with legacy
 * redemptions: counted exactly once at the award transition (never at claim),
 * so no-reward engagement and claim replays never consume quota.
 */
// The Aggregate component keys storage by namespace value, so this
// namespace is prefixed to stay disjoint from the legacy redemption
// aggregates that use raw owner/campaign ids.
const rewardedNamespace = (ownerId: Id<"users">) => `rewarded:${ownerId}`;

export const rewardedOutcomesByOwner = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "rewardOutcomes";
}>(components.aggregate, {
  namespace: (doc) => rewardedNamespace(doc.ownerId),
  sortKey: (doc) => doc.grantedAt,
  sumValue: (doc) => doc.amount ?? 0,
});

export async function countRewardedGenericOutcomes(
  ctx: CounterCtx,
  ownerId: Id<"users">,
) {
  return rewardedOutcomesByOwner.count(ctx, { namespace: rewardedNamespace(ownerId) });
}

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

/** Exported for the channel/link backfill equivalence test and maintenance tooling. */
export const ownerCounters = new ShardedCounter<string>(components.shardedCounter, {
  defaultShards: 16,
});

/**
 * Inserts one exactly-once funnel event and increments the owner/campaign
 * scopes it has always owned. The per-game/channel/share-link scopes are
 * intentionally NOT incremented here — recordGenericPlayMetric layers those
 * on top (and stamps counterScopesVersion) so the channel/link backfill can
 * distinguish pre-scope rows. Exported for the equivalence test.
 */
export async function recordAnalyticsCounterEvent(
  ctx: MutationCtx,
  args: {
    eventKey: string;
    ownerId: Id<"users">;
    campaignId?: Id<"campaigns">;
    campaignGameId?: Id<"campaignGames">;
    shareLinkId?: Id<"publicPlayLinks">;
    channel?: "public-link" | "station";
    channelLabel?: string;
    metric: OwnerMetric;
    source: CounterEventSource;
  }
): Promise<Id<"analyticsCounterEvents"> | null> {
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
      return null;
    }

    await ctx.db.patch(existingEvent._id, {
      campaignId: args.campaignId,
    });
    await ownerCounters.inc(ctx, campaignMetricKey(args.campaignId!, args.metric));
    return existingEvent._id;
  }

  const insertedEventId = await ctx.db.insert("analyticsCounterEvents", {
    eventKey: args.eventKey,
    ownerId: args.ownerId,
    campaignId: args.campaignId,
    campaignGameId: args.campaignGameId,
    shareLinkId: args.shareLinkId,
    channel: args.channel,
    channelLabel: args.channelLabel,
    metric: args.metric,
    source: args.source,
    createdAt: Date.now(),
  });
  await ownerCounters.inc(ctx, ownerMetricKey(args.ownerId, args.metric));
  if (args.campaignId) {
    await ownerCounters.inc(ctx, campaignMetricKey(args.campaignId, args.metric));
  }

  return insertedEventId;
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

/**
 * Idempotent funnel/metric event for the generic play foundation. Counter
 * scope: owner + campaign + optional campaign game. The eventKey must be
 * stable per real-world transition (session id, outcome id, or a client
 * generated open key for page views) so replays never double count.
 */
export async function recordGenericPlayMetric(
  ctx: MutationCtx,
  args: {
    eventKey: string;
    ownerId: Id<"users">;
    campaignId: Id<"campaigns">;
    campaignGameId?: Id<"campaignGames">;
    shareLinkId?: Id<"publicPlayLinks">;
    channel?: "public-link" | "station";
    channelLabel?: string;
    metric: AnalyticsMetric;
    source?: CounterEventSource;
  }
) {
  const eventId = await recordAnalyticsCounterEvent(ctx, {
    eventKey: args.eventKey,
    ownerId: args.ownerId,
    campaignId: args.campaignId,
    campaignGameId: args.campaignGameId,
    shareLinkId: args.shareLinkId,
    channel: args.channel,
    channelLabel: args.channelLabel,
    metric: args.metric,
    source: args.source ?? "live",
  });
  if (eventId) {
    // Exactly-once scopes ride the same per-transition event key: the
    // per-game, per-channel, and per-share-link counters only increment on
    // the insert (or legacy marker upgrade) of the underlying event, so
    // replays and retries never double count. Legacy li xi events carry no
    // channel/shareLinkId and stay unattributed by design. The readiness
    // stamp marks the row's scopes as counted, so the channel/link backfill
    // only ever initializes rows written before the scopes existed.
    let scopesApplied = false;
    if (args.campaignGameId) {
      await ownerCounters.inc(ctx, campaignGameMetricKey(args.campaignGameId, args.metric));
      scopesApplied = true;
    }
    if (args.channel) {
      await ownerCounters.inc(ctx, campaignChannelMetricKey(args.campaignId, args.channel, args.metric));
      if (args.campaignGameId) {
        await ownerCounters.inc(ctx, gameChannelMetricKey(args.campaignGameId, args.channel, args.metric));
      }
      scopesApplied = true;
    }
    if (args.shareLinkId) {
      await ownerCounters.inc(ctx, shareLinkMetricKey(args.shareLinkId, args.metric));
      scopesApplied = true;
    }
    if (scopesApplied) {
      await ctx.db.patch(eventId, { counterScopesVersion: COUNTER_SCOPES_VERSION });
    }
  }
  return eventId !== null;
}

// Namespace-prefixed so the per-game session tree never collides with the
// legacy redemption aggregates sharing the same component.
const gameSessionsNamespace = (campaignGameId: Id<"campaignGames">) =>
  `game-sessions:${campaignGameId}`;

/**
 * Exact O(log n) per-game admission accounting backing maxTotalSessions.
 * Rows are inserted in the same transaction as session creation; historical
 * rows enter through the idempotent playMaintenance backfill, gated by
 * campaignGames.accountingVersion.
 */
export const playSessionsByGame = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "playSessions";
}>(components.aggregate, {
  namespace: (doc) => gameSessionsNamespace(doc.campaignGameId),
  sortKey: (doc) => doc.startedAt,
});

export async function countGameSessionsExact(
  ctx: CounterCtx,
  campaignGameId: Id<"campaignGames">,
) {
  return playSessionsByGame.count(ctx, { namespace: gameSessionsNamespace(campaignGameId) });
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

/** Funnel metrics shared by the per-game, per-channel, and per-link rows. */
type FunnelCounts = {
  opens: number;
  starts: number;
  completions: number;
  rewardOutcomes: number;
  claims: number;
  conversion: number | null;
};

function funnelConversion(counts: { opens: number; claims: number }): number | null {
  return counts.opens > 0 ? counts.claims / counts.opens : null;
}

async function readCampaignFunnelCounts(
  ctx: CounterCtx,
  campaignId: Id<"campaigns">,
): Promise<FunnelCounts> {
  const [opens, starts, completions, rewardOutcomes, claims] = await Promise.all([
    countCampaignMetric(ctx, campaignId, "game_open"),
    countCampaignMetric(ctx, campaignId, "game_start"),
    countCampaignMetric(ctx, campaignId, "game_completion"),
    countCampaignMetric(ctx, campaignId, "reward_outcome"),
    countCampaignMetric(ctx, campaignId, "reward_claim"),
  ]);
  return {
    opens,
    starts,
    completions,
    rewardOutcomes,
    claims,
    conversion: funnelConversion({ opens, claims }),
  };
}

async function listBreakdownCampaigns(
  ctx: CounterCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | undefined,
): Promise<Doc<"campaigns">[]> {
  if (campaignId) {
    return [await requireOwnedCampaign(ctx, ownerId, campaignId)];
  }
  return ctx.db
    .query("campaigns")
    .withIndex("by_owner_slug", (q) => q.eq("ownerId", ownerId))
    .collect();
}

/**
 * Per-game funnel rows backed by the exact campaign-game Sharded Counter
 * scopes. gameTemplateId is each row's real template — the campaign-level
 * aggregate in getOwnerAnalytics/getCampaignAnalytics spans templates and
 * deliberately carries no single template id.
 */
export const getCampaignGameBreakdown = query({
  args: {
    campaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem analytics này",
    });
    await listBreakdownCampaigns(ctx, ownerId, args.campaignId);
    const games = args.campaignId
      ? await ctx.db
          .query("campaignGames")
          .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId!))
          .collect()
      : await ctx.db
          .query("campaignGames")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .collect();
    const rows = await Promise.all(
      games.map(async (game) => {
        const [opens, starts, completions, rewardOutcomes, claims] = await Promise.all([
          ownerCounters.count(ctx, campaignGameMetricKey(game._id, "game_open")),
          ownerCounters.count(ctx, campaignGameMetricKey(game._id, "game_start")),
          ownerCounters.count(ctx, campaignGameMetricKey(game._id, "game_completion")),
          ownerCounters.count(ctx, campaignGameMetricKey(game._id, "reward_outcome")),
          ownerCounters.count(ctx, campaignGameMetricKey(game._id, "reward_claim")),
        ]);
        return {
          campaignId: game.campaignId,
          campaignGameId: game._id,
          gameName: game.name ?? null,
          gameTemplateId: requireGameTemplateId(game.templateId),
          opens,
          starts,
          completions,
          rewardOutcomes,
          claims,
          conversion: funnelConversion({ opens, claims }),
        };
      }),
    );
    rows.sort(
      (left, right) =>
        left.campaignId.localeCompare(right.campaignId) ||
        right.completions - left.completions ||
        left.campaignGameId.localeCompare(right.campaignGameId),
    );
    return { rows };
  },
});

/**
 * Channel breakdown for the analytics channels view: public-link vs station
 * counters plus a derived legacy row. Legacy draw traffic never carried
 * channel attribution, so it surfaces as the campaign totals minus the
 * attributed channel counters under the "li xi (legacy)" label. Event rows
 * recorded before the channel counters existed need
 * backfillOwnerChannelLinkCounters once, or the remainder overstates legacy.
 */
export const getCampaignChannelBreakdown = query({
  args: {
    campaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem analytics này",
    });
    const campaigns = await listBreakdownCampaigns(ctx, ownerId, args.campaignId);

    const channelRows: Array<{
      key: RewardChannel | "legacy";
      label: string;
      counts: FunnelCounts;
    }> = [];
    for (const channel of ["public-link", "station"] as const) {
      const totals = { opens: 0, starts: 0, completions: 0, rewardOutcomes: 0, claims: 0 };
      for (const campaign of campaigns) {
        const [opens, starts, completions, rewardOutcomes, claims] = await Promise.all([
          ownerCounters.count(ctx, campaignChannelMetricKey(campaign._id, channel, "game_open")),
          ownerCounters.count(ctx, campaignChannelMetricKey(campaign._id, channel, "game_start")),
          ownerCounters.count(ctx, campaignChannelMetricKey(campaign._id, channel, "game_completion")),
          ownerCounters.count(ctx, campaignChannelMetricKey(campaign._id, channel, "reward_outcome")),
          ownerCounters.count(ctx, campaignChannelMetricKey(campaign._id, channel, "reward_claim")),
        ]);
        totals.opens += opens;
        totals.starts += starts;
        totals.completions += completions;
        totals.rewardOutcomes += rewardOutcomes;
        totals.claims += claims;
      }
      channelRows.push({
        key: channel,
        label: channel === "public-link" ? "Liên kết công khai" : "Trạm chơi",
        counts: { ...totals, conversion: funnelConversion(totals) },
      });
    }

    const legacyTotals = { opens: 0, starts: 0, completions: 0, rewardOutcomes: 0, claims: 0 };
    for (const campaign of campaigns) {
      const campaignCounts = await readCampaignFunnelCounts(ctx, campaign._id);
      legacyTotals.opens += campaignCounts.opens;
      legacyTotals.starts += campaignCounts.starts;
      legacyTotals.completions += campaignCounts.completions;
      legacyTotals.rewardOutcomes += campaignCounts.rewardOutcomes;
      legacyTotals.claims += campaignCounts.claims;
    }
    for (const channelRow of channelRows) {
      legacyTotals.opens -= channelRow.counts.opens;
      legacyTotals.starts -= channelRow.counts.starts;
      legacyTotals.completions -= channelRow.counts.completions;
      legacyTotals.rewardOutcomes -= channelRow.counts.rewardOutcomes;
      legacyTotals.claims -= channelRow.counts.claims;
    }
    channelRows.push({
      key: "legacy",
      label: "li xi (legacy)",
      counts: { ...legacyTotals, conversion: funnelConversion(legacyTotals) },
    });

    return {
      rows: channelRows.map((row) => ({
        key: row.key,
        label: row.label,
        opens: row.counts.opens,
        starts: row.counts.starts,
        completions: row.counts.completions,
        rewardOutcomes: row.counts.rewardOutcomes,
        claims: row.counts.claims,
        conversion: row.counts.conversion,
      })),
    };
  },
});

/**
 * Per-share-link funnel rows (label, channel, funnel, conversion) backed by
 * the per-link Sharded Counter scopes. Legacy draw traffic has no share link
 * and never appears here — see getCampaignChannelBreakdown for the legacy
 * remainder row.
 */
export const getCampaignShareLinkBreakdown = query({
  args: {
    campaignId: v.optional(v.id("campaigns")),
  },
  handler: async (ctx, args) => {
    const { ownerId } = await requireResolvedOwner(ctx, undefined, {
      notFoundMessage: "Không tìm thấy host",
      forbiddenMessage: "Bạn không có quyền xem analytics này",
    });
    const campaigns = await listBreakdownCampaigns(ctx, ownerId, args.campaignId);
    const links = (
      await Promise.all(
        campaigns.map((campaign) =>
          ctx.db
            .query("publicPlayLinks")
            .withIndex("by_campaign_createdAt", (q) => q.eq("campaignId", campaign._id))
            .collect(),
        ),
      )
    ).flat();
    const rows = await Promise.all(
      links.map(async (link) => {
        const [linkOpens, opens, starts, completions, rewardOutcomes, claims] = await Promise.all([
          ownerCounters.count(ctx, shareLinkMetricKey(link._id, "public_play_link_open")),
          ownerCounters.count(ctx, shareLinkMetricKey(link._id, "game_open")),
          ownerCounters.count(ctx, shareLinkMetricKey(link._id, "game_start")),
          ownerCounters.count(ctx, shareLinkMetricKey(link._id, "game_completion")),
          ownerCounters.count(ctx, shareLinkMetricKey(link._id, "reward_outcome")),
          ownerCounters.count(ctx, shareLinkMetricKey(link._id, "reward_claim")),
        ]);
        return {
          shareLinkId: link._id,
          campaignId: link.campaignId,
          campaignGameId: link.campaignGameId,
          label: link.label ?? null,
          channel: link.channel,
          linkOpens,
          opens,
          starts,
          completions,
          rewardOutcomes,
          claims,
          conversion: funnelConversion({ opens, claims }),
        };
      }),
    );
    rows.sort(
      (left, right) =>
        left.campaignId.localeCompare(right.campaignId) ||
        right.linkOpens - left.linkOpens ||
        left.shareLinkId.localeCompare(right.shareLinkId),
    );
    return { rows };
  },
});

/**
 * One-time, idempotent initialization of the channel/share-link counter
 * scopes for analytics event rows recorded before they existed (generic rows
 * already carry channel/shareLinkId/campaignGameId). Exactly-once is kept
 * with the row's own readiness stamp: live inserts already stamp
 * `counterScopesVersion: 1`, the backfill stamps each row whose scopes it
 * actually initialized, rows without channel/shareLinkId attribution (legacy
 * li xi traffic) are skipped, and attributed rows with no countable target id
 * stay unstamped and surface as `skippedUnscoped` instead of absorbing the
 * readiness stamp. Bounded paginate traversal: relay `continueCursor` while
 * `isDone` is false, like the playMaintenance traversals. `dryRun: true`
 * previews read-only.
 */
export const backfillOwnerChannelLinkCounters = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
    migrationToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireAnalyticsBackfillOwner(ctx, args.ownerId, args.migrationToken);
    const limit = normalizeBackfillLimit(args.limit);
    const dryRun = args.dryRun ?? false;
    const page = await ctx.db
      .query("analyticsCounterEvents")
      .withIndex("by_owner_createdAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    let countersBackfilled = 0;
    let countersWouldBackfill = 0;
    let skippedAlreadyScoped = 0;
    let legacyRowsSkipped = 0;
    let skippedUnscoped = 0;
    for (const event of page.page) {
      if (!event.channel && !event.shareLinkId) {
        legacyRowsSkipped += 1;
        continue;
      }
      if ((event.counterScopesVersion ?? 0) >= COUNTER_SCOPES_VERSION) {
        skippedAlreadyScoped += 1;
        continue;
      }
      // A row only initializes scopes that have a target id: an attributed
      // row without campaignId/campaignGameId/shareLinkId would otherwise be
      // stamped as scoped while nothing was counted. Such rows stay
      // unstamped and are reported separately instead.
      const hasScopedCounter =
        Boolean(event.channel && (event.campaignId || event.campaignGameId)) ||
        Boolean(event.shareLinkId);
      if (dryRun) {
        if (hasScopedCounter) {
          countersWouldBackfill += 1;
        } else {
          skippedUnscoped += 1;
        }
        continue;
      }
      let appliedScopes = 0;
      if (event.channel) {
        if (event.campaignId) {
          await ownerCounters.inc(
            ctx,
            campaignChannelMetricKey(event.campaignId, event.channel, event.metric)
          );
          appliedScopes += 1;
        }
        if (event.campaignGameId) {
          await ownerCounters.inc(
            ctx,
            gameChannelMetricKey(event.campaignGameId, event.channel, event.metric)
          );
          appliedScopes += 1;
        }
      }
      if (event.shareLinkId) {
        await ownerCounters.inc(ctx, shareLinkMetricKey(event.shareLinkId, event.metric));
        appliedScopes += 1;
      }
      if (appliedScopes === 0) {
        skippedUnscoped += 1;
        continue;
      }
      await ctx.db.patch(event._id, { counterScopesVersion: COUNTER_SCOPES_VERSION });
      countersBackfilled += 1;
    }

    return {
      eventsScanned: page.page.length,
      countersBackfilled,
      countersWouldBackfill,
      skippedAlreadyScoped,
      legacyRowsSkipped,
      skippedUnscoped,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      dryRun,
    };
  },
});
