export type AnalyticsMetric = "session_created" | "redemption_created";

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
