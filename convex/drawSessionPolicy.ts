import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isOpenPendingSession } from "./publicLinks";

type ConvexCtx = QueryCtx | MutationCtx;

export type PendingSessionDeliveryMode = "station" | "link" | undefined;

export const PENDING_SESSION_DELIVERY_MODES: readonly PendingSessionDeliveryMode[] = [
  "station",
  "link",
  undefined,
];

export const PENDING_STATION_SESSION_DELIVERY_MODES: readonly PendingSessionDeliveryMode[] = [
  "station",
  undefined,
];

export async function listPendingOwnerSessionsByDelivery(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  deliveryModes = PENDING_SESSION_DELIVERY_MODES
): Promise<Doc<"drawSessions">[]> {
  const groups = await Promise.all(
    deliveryModes.map((deliveryMode) =>
      ctx.db
        .query("drawSessions")
        .withIndex("by_owner_status_delivery", (q) =>
          q.eq("ownerId", ownerId).eq("status", "pending").eq("deliveryMode", deliveryMode)
        )
        .collect()
    )
  );

  return groups.flat();
}

export async function listPendingCampaignSessionsByDelivery(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns"> | undefined,
  deliveryModes = PENDING_SESSION_DELIVERY_MODES
): Promise<Doc<"drawSessions">[]> {
  const groups = await Promise.all(
    deliveryModes.map((deliveryMode) =>
      ctx.db
        .query("drawSessions")
        .withIndex("by_campaign_owner_status_delivery", (q) =>
          q
            .eq("campaignId", campaignId)
            .eq("ownerId", ownerId)
            .eq("status", "pending")
            .eq("deliveryMode", deliveryMode)
        )
        .collect()
    )
  );

  return groups.flat();
}

export async function hasOpenPendingSessionForOwner(
  ctx: ConvexCtx,
  ownerId: Id<"users">
) {
  const pendingSessions = await listPendingOwnerSessionsByDelivery(ctx, ownerId);
  return pendingSessions.some((session) => isOpenPendingSession(session));
}

export async function hasOpenPendingSessionForCampaign(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId: Id<"campaigns">
) {
  const pendingSessions = await listPendingCampaignSessionsByDelivery(ctx, ownerId, campaignId);
  return pendingSessions.some((session) => isOpenPendingSession(session));
}

export async function countOpenPendingOwnerSessions(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  now = Date.now()
) {
  const pendingSessions = await listPendingOwnerSessionsByDelivery(ctx, ownerId);
  return pendingSessions.filter((session) => isOpenPendingSession(session, now)).length;
}
