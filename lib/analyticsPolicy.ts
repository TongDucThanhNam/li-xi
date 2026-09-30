export type AnalyticsMetric =
  | "session_created"
  | "redemption_created"
  | "game_open"
  | "game_start"
  | "game_completion"
  | "reward_outcome"
  | "reward_claim"
  | "public_play_link_open";

export type GameFunnelMetric = Exclude<
  AnalyticsMetric,
  "session_created" | "redemption_created"
>;

/** Attribution channel carried by generic play events. */
export type RewardChannel = "public-link" | "station";

export type ExistingAnalyticsCounterEvent = {
  ownerId: string;
  campaignId?: string;
  metric: AnalyticsMetric;
};

export type AnalyticsCounterEventEstimate = {
  eventWouldBackfill: boolean;
  markerWouldInsert: 0 | 1;
  markerWouldPatch: 0 | 1;
  ownerCounterWouldIncrement: 0 | 1;
  campaignCounterWouldIncrement: 0 | 1;
  counterIncrementsWouldBackfill: number;
};

function assertNonEmptyAnalyticsId(value: string, label: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    const messages: Record<string, string> = {
      ownerId: "ownerId analytics không được rỗng",
      campaignId: "campaignId analytics không được rỗng",
      sessionId: "sessionId analytics không được rỗng",
      redemptionId: "redemptionId analytics không được rỗng",
    };
    throw new Error(messages[label] ?? "Analytics id không được rỗng");
  }
  if (trimmedValue !== value) {
    const messages: Record<string, string> = {
      ownerId: "ownerId analytics không được chứa khoảng trắng ở đầu/cuối",
      campaignId: "campaignId analytics không được chứa khoảng trắng ở đầu/cuối",
      sessionId: "sessionId analytics không được chứa khoảng trắng ở đầu/cuối",
      redemptionId: "redemptionId analytics không được chứa khoảng trắng ở đầu/cuối",
    };
    throw new Error(messages[label] ?? "Analytics id không được chứa khoảng trắng ở đầu/cuối");
  }
  return value;
}

export function ownerMetricKey(ownerId: string, metric: AnalyticsMetric) {
  assertNonEmptyAnalyticsId(ownerId, "ownerId");
  return `owner:${ownerId}:${metric}`;
}

export function campaignMetricKey(campaignId: string, metric: AnalyticsMetric) {
  assertNonEmptyAnalyticsId(campaignId, "campaignId");
  return `campaign:${campaignId}:${metric}`;
}

export function sessionCounterEventKey(sessionId: string) {
  assertNonEmptyAnalyticsId(sessionId, "sessionId");
  return `session:${sessionId}:session_created`;
}

export function redemptionCounterEventKey(redemptionId: string) {
  assertNonEmptyAnalyticsId(redemptionId, "redemptionId");
  return `redemption:${redemptionId}:redemption_created`;
}

export function playSessionCounterEventKey(sessionId: string, metric: GameFunnelMetric) {
  assertNonEmptyAnalyticsId(sessionId, "sessionId");
  return `play-session:${sessionId}:${metric}`;
}

export function shareLinkCounterEventKey(
  shareLinkId: string,
  openKey: string,
  metric: Extract<GameFunnelMetric, "game_open" | "public_play_link_open">,
) {
  assertNonEmptyAnalyticsId(shareLinkId, "shareLinkId");
  assertNonEmptyAnalyticsId(openKey, "openKey");
  return `share-open:${shareLinkId}:${openKey}:${metric}`;
}

/**
 * Station waiting-screen opens. One stable client-generated key per
 * waiting-screen mount, so a retried (or replayed) open can never double
 * count; namespaced separately from share-link opens because a station has
 * no share link.
 */
export function stationOpenCounterEventKey(
  campaignGameId: string,
  openKey: string,
  metric: Extract<GameFunnelMetric, "game_open">,
) {
  assertNonEmptyAnalyticsId(campaignGameId, "campaignGameId");
  assertNonEmptyAnalyticsId(openKey, "openKey");
  return `station-open:${campaignGameId}:${openKey}:${metric}`;
}

export function campaignGameMetricKey(campaignGameId: string, metric: AnalyticsMetric) {
  assertNonEmptyAnalyticsId(campaignGameId, "campaignGameId");
  return `campaign-game:${campaignGameId}:${metric}`;
}

/** Per-campaign channel funnel counters (public-link vs station). */
export function campaignChannelMetricKey(
  campaignId: string,
  channel: RewardChannel,
  metric: AnalyticsMetric
) {
  assertNonEmptyAnalyticsId(campaignId, "campaignId");
  return `campaign-channel:${campaignId}:${channel}:${metric}`;
}

/** Per-game channel funnel counters (public-link vs station). */
export function gameChannelMetricKey(
  campaignGameId: string,
  channel: RewardChannel,
  metric: AnalyticsMetric
) {
  assertNonEmptyAnalyticsId(campaignGameId, "campaignGameId");
  return `game-channel:${campaignGameId}:${channel}:${metric}`;
}

/** Per-share-link funnel counters. */
export function shareLinkMetricKey(shareLinkId: string, metric: AnalyticsMetric) {
  assertNonEmptyAnalyticsId(shareLinkId, "shareLinkId");
  return `share-link:${shareLinkId}:${metric}`;
}

/**
 * Readiness stamp written onto an analytics event row once every counter
 * scope it carries (per-game, per-channel, per-share-link) has been
 * incremented exactly once — live inserts stamp immediately, and
 * backfillOwnerChannelLinkCounters stamps rows it initializes, so replays of
 * either path can never double count.
 */
export const COUNTER_SCOPES_VERSION = 1;


export function rewardCounterEventKey(
  redemptionId: string,
  metric: "reward_outcome" | "reward_claim" | "game_completion"
) {
  assertNonEmptyAnalyticsId(redemptionId, "redemptionId");
  return `reward:${redemptionId}:${metric}`;
}

export function estimateAnalyticsCounterEventWrite(args: {
  existingEvent: ExistingAnalyticsCounterEvent | null;
  ownerId: string;
  campaignId?: string;
  metric: AnalyticsMetric;
}): AnalyticsCounterEventEstimate {
  const { existingEvent } = args;
  assertNonEmptyAnalyticsId(args.ownerId, "ownerId");
  if (args.campaignId !== undefined) {
    assertNonEmptyAnalyticsId(args.campaignId, "campaignId");
  }
  if (!existingEvent) {
    const campaignCounterWouldIncrement = args.campaignId ? 1 : 0;
    return {
      eventWouldBackfill: true,
      markerWouldInsert: 1,
      markerWouldPatch: 0,
      ownerCounterWouldIncrement: 1,
      campaignCounterWouldIncrement,
      counterIncrementsWouldBackfill: 1 + campaignCounterWouldIncrement,
    };
  }

  if (existingEvent.ownerId !== args.ownerId || existingEvent.metric !== args.metric) {
    throw new Error("Analytics event không khớp owner hoặc metric");
  }

  if (!args.campaignId || existingEvent.campaignId === args.campaignId) {
    return {
      eventWouldBackfill: false,
      markerWouldInsert: 0,
      markerWouldPatch: 0,
      ownerCounterWouldIncrement: 0,
      campaignCounterWouldIncrement: 0,
      counterIncrementsWouldBackfill: 0,
    };
  }

  if (existingEvent.campaignId) {
    throw new Error("Analytics event đã thuộc chiến dịch khác");
  }

  return {
    eventWouldBackfill: true,
    markerWouldInsert: 0,
    markerWouldPatch: 1,
    ownerCounterWouldIncrement: 0,
    campaignCounterWouldIncrement: 1,
    counterIncrementsWouldBackfill: 1,
  };
}
