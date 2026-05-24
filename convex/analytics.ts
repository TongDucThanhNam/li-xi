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
  redemptionCounterEventKey,
  sessionCounterEventKey,
  type AnalyticsCounterEventEstimate,
} from "../lib/analyticsPolicy";

type CounterCtx = QueryCtx | MutationCtx;
type OwnerMetric = "session_created" | "redemption_created";
type CampaignMetric = "session_created" | "redemption_created";
type CounterEventSource = "live" | "backfill";

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

    const [aggregatedRedemptionCount, aggregatedRedeemedAmount, sessionCreatedEvents, redemptionCreatedEvents] =
      await Promise.all([
        countOwnerRedemptions(ctx, ownerId),
        redemptionsByOwnerAmount.sum(ctx, { namespace: ownerId }),
        countOwnerMetric(ctx, ownerId, "session_created"),
        countOwnerMetric(ctx, ownerId, "redemption_created"),
      ]);

    return {
      aggregatedRedemptionCount,
      aggregatedRedeemedAmount,
      sessionCreatedEvents,
      redemptionCreatedEvents,
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
        const counterEstimate = await wouldRecordAnalyticsCounterEvent(ctx, {
          eventKey: redemptionCounterEventKey(redemption._id),
          ownerId,
          campaignId: ownedCampaignId,
          metric: "redemption_created",
        });
        if (counterEstimate.eventWouldBackfill) {
          redemptionCountersWouldBackfill += 1;
        }
        redemptionCounterEventsWouldBackfill +=
          counterEstimate.markerWouldInsert + counterEstimate.markerWouldPatch;
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
        if (
          await recordAnalyticsCounterEvent(ctx, {
            eventKey: redemptionCounterEventKey(redemption._id),
            ownerId,
            campaignId: ownedCampaignId,
            metric: "redemption_created",
            source: "backfill",
          })
        ) {
          redemptionCountersBackfilled += 1;
        }
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
        const counterEstimate = await wouldRecordAnalyticsCounterEvent(ctx, {
          eventKey: sessionCounterEventKey(session._id),
          ownerId,
          campaignId: ownedCampaignId,
          metric: "session_created",
        });
        if (counterEstimate.eventWouldBackfill) {
          sessionCountersWouldBackfill += 1;
        }
        sessionCounterEventsWouldBackfill +=
          counterEstimate.markerWouldInsert + counterEstimate.markerWouldPatch;
        sessionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        if (
          await recordAnalyticsCounterEvent(ctx, {
            eventKey: sessionCounterEventKey(session._id),
            ownerId,
            campaignId: ownedCampaignId,
            metric: "session_created",
            source: "backfill",
          })
        ) {
          sessionCountersBackfilled += 1;
        }
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

    const [aggregatedRedemptionCount, aggregatedRedeemedAmount, sessionCreatedEvents, redemptionCreatedEvents] =
      await Promise.all([
        redemptionsByCampaignAmount.count(ctx, { namespace: args.campaignId }),
        redemptionsByCampaignAmount.sum(ctx, { namespace: args.campaignId }),
        countCampaignMetric(ctx, args.campaignId, "session_created"),
        countCampaignMetric(ctx, args.campaignId, "redemption_created"),
      ]);

    return {
      campaignId: campaign._id,
      campaignName: campaign.name,
      aggregatedRedemptionCount,
      aggregatedRedeemedAmount,
      sessionCreatedEvents,
      redemptionCreatedEvents,
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
        const counterEstimate = await wouldRecordAnalyticsCounterEvent(ctx, {
          eventKey: redemptionCounterEventKey(redemption._id),
          ownerId,
          campaignId: args.campaignId,
          metric: "redemption_created",
        });
        if (counterEstimate.eventWouldBackfill) {
          redemptionCountersWouldBackfill += 1;
        }
        redemptionCounterEventsWouldBackfill +=
          counterEstimate.markerWouldInsert + counterEstimate.markerWouldPatch;
        redemptionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx, redemption);
        redemptionAggregatesBackfilled += 1;
        if (
          await recordAnalyticsCounterEvent(ctx, {
            eventKey: redemptionCounterEventKey(redemption._id),
            ownerId,
            campaignId: args.campaignId,
            metric: "redemption_created",
            source: "backfill",
          })
        ) {
          redemptionCountersBackfilled += 1;
        }
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
        const counterEstimate = await wouldRecordAnalyticsCounterEvent(ctx, {
          eventKey: redemptionCounterEventKey(targetRedemption._id),
          ownerId,
          campaignId: args.campaignId,
          metric: "redemption_created",
        });
        if (counterEstimate.eventWouldBackfill) {
          redemptionCountersWouldBackfill += 1;
        }
        redemptionCounterEventsWouldBackfill +=
          counterEstimate.markerWouldInsert + counterEstimate.markerWouldPatch;
        redemptionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      }

      if (!dryRun && targetRedemption.campaignId === args.campaignId) {
        await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx, targetRedemption);
        redemptionAggregatesBackfilled += 1;
        if (
          await recordAnalyticsCounterEvent(ctx, {
            eventKey: redemptionCounterEventKey(targetRedemption._id),
            ownerId,
            campaignId: args.campaignId,
            metric: "redemption_created",
            source: "backfill",
          })
        ) {
          redemptionCountersBackfilled += 1;
        }
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
        const counterEstimate = await wouldRecordAnalyticsCounterEvent(ctx, {
          eventKey: sessionCounterEventKey(session._id),
          ownerId,
          campaignId: args.campaignId,
          metric: "session_created",
        });
        if (counterEstimate.eventWouldBackfill) {
          sessionCountersWouldBackfill += 1;
        }
        sessionCounterEventsWouldBackfill +=
          counterEstimate.markerWouldInsert + counterEstimate.markerWouldPatch;
        sessionCounterIncrementsWouldBackfill += counterEstimate.counterIncrementsWouldBackfill;
      } else {
        if (
          await recordAnalyticsCounterEvent(ctx, {
            eventKey: sessionCounterEventKey(session._id),
            ownerId,
            campaignId: args.campaignId,
            metric: "session_created",
            source: "backfill",
          })
        ) {
          sessionCountersBackfilled += 1;
        }
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
