#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  campaignMetricKey,
  estimateAnalyticsCounterEventWrite,
  ownerMetricKey,
  redemptionCounterEventKey,
  sessionCounterEventKey,
} from "../lib/analyticsPolicy.ts";

assert.equal(ownerMetricKey("user_1", "session_created"), "owner:user_1:session_created");
assert.equal(campaignMetricKey("campaign_1", "redemption_created"), "campaign:campaign_1:redemption_created");
assert.equal(sessionCounterEventKey("session_1"), "session:session_1:session_created");
assert.equal(redemptionCounterEventKey("redemption_1"), "redemption:redemption_1:redemption_created");
assert.throws(() => ownerMetricKey("", "session_created"), /ownerId analytics không được rỗng/);
assert.throws(() => campaignMetricKey("   ", "redemption_created"), /campaignId analytics không được rỗng/);
assert.throws(() => sessionCounterEventKey(""), /sessionId analytics không được rỗng/);
assert.throws(() => redemptionCounterEventKey(""), /redemptionId analytics không được rỗng/);
assert.throws(() => ownerMetricKey(" user_1", "session_created"), /ownerId analytics không được chứa khoảng trắng ở đầu\/cuối/);
assert.throws(() => campaignMetricKey("campaign_1 ", "redemption_created"), /campaignId analytics không được chứa khoảng trắng ở đầu\/cuối/);
assert.throws(() => sessionCounterEventKey(" session_1"), /sessionId analytics không được chứa khoảng trắng ở đầu\/cuối/);
assert.throws(() => redemptionCounterEventKey("redemption_1 "), /redemptionId analytics không được chứa khoảng trắng ở đầu\/cuối/);
assert.throws(
  () =>
    estimateAnalyticsCounterEventWrite({
      existingEvent: null,
      ownerId: "",
      metric: "session_created",
    }),
  /ownerId analytics không được rỗng/
);
assert.throws(
  () =>
    estimateAnalyticsCounterEventWrite({
      existingEvent: null,
      ownerId: "user_1",
      campaignId: "",
      metric: "session_created",
    }),
  /campaignId analytics không được rỗng/
);

assert.deepEqual(
  estimateAnalyticsCounterEventWrite({
    existingEvent: null,
    ownerId: "user_1",
    metric: "session_created",
  }),
  {
    eventWouldBackfill: true,
    markerWouldInsert: 1,
    markerWouldPatch: 0,
    ownerCounterWouldIncrement: 1,
    campaignCounterWouldIncrement: 0,
    counterIncrementsWouldBackfill: 1,
  },
  "new owner-only events should insert marker and increment owner counter once"
);

assert.deepEqual(
  estimateAnalyticsCounterEventWrite({
    existingEvent: null,
    ownerId: "user_1",
    campaignId: "campaign_1",
    metric: "redemption_created",
  }),
  {
    eventWouldBackfill: true,
    markerWouldInsert: 1,
    markerWouldPatch: 0,
    ownerCounterWouldIncrement: 1,
    campaignCounterWouldIncrement: 1,
    counterIncrementsWouldBackfill: 2,
  },
  "new campaign events should insert marker and increment owner plus campaign counters"
);

assert.deepEqual(
  estimateAnalyticsCounterEventWrite({
    existingEvent: {
      ownerId: "user_1",
      metric: "redemption_created",
    },
    ownerId: "user_1",
    campaignId: "campaign_1",
    metric: "redemption_created",
  }),
  {
    eventWouldBackfill: true,
    markerWouldInsert: 0,
    markerWouldPatch: 1,
    ownerCounterWouldIncrement: 0,
    campaignCounterWouldIncrement: 1,
    counterIncrementsWouldBackfill: 1,
  },
  "owner-only legacy markers should upgrade to campaign scope without incrementing owner twice"
);

assert.deepEqual(
  estimateAnalyticsCounterEventWrite({
    existingEvent: {
      ownerId: "user_1",
      campaignId: "campaign_1",
      metric: "redemption_created",
    },
    ownerId: "user_1",
    campaignId: "campaign_1",
    metric: "redemption_created",
  }),
  {
    eventWouldBackfill: false,
    markerWouldInsert: 0,
    markerWouldPatch: 0,
    ownerCounterWouldIncrement: 0,
    campaignCounterWouldIncrement: 0,
    counterIncrementsWouldBackfill: 0,
  },
  "reruns for the same campaign-scoped marker should not count again"
);

assert.deepEqual(
  estimateAnalyticsCounterEventWrite({
    existingEvent: {
      ownerId: "user_1",
      campaignId: "campaign_1",
      metric: "redemption_created",
    },
    ownerId: "user_1",
    metric: "redemption_created",
  }),
  {
    eventWouldBackfill: false,
    markerWouldInsert: 0,
    markerWouldPatch: 0,
    ownerCounterWouldIncrement: 0,
    campaignCounterWouldIncrement: 0,
    counterIncrementsWouldBackfill: 0,
  },
  "owner backfill reruns should not downgrade existing campaign-scoped markers"
);

assert.throws(
  () =>
    estimateAnalyticsCounterEventWrite({
      existingEvent: {
        ownerId: "user_2",
        metric: "session_created",
      },
      ownerId: "user_1",
      metric: "session_created",
    }),
  /Analytics event không khớp owner hoặc metric/
);
assert.throws(
  () =>
    estimateAnalyticsCounterEventWrite({
      existingEvent: {
        ownerId: "user_1",
        metric: "session_created",
      },
      ownerId: "user_1",
      metric: "redemption_created",
    }),
  /Analytics event không khớp owner hoặc metric/
);
assert.throws(
  () =>
    estimateAnalyticsCounterEventWrite({
      existingEvent: {
        ownerId: "user_1",
        campaignId: "campaign_1",
        metric: "session_created",
      },
      ownerId: "user_1",
      campaignId: "campaign_2",
      metric: "session_created",
    }),
  /Analytics event đã thuộc chiến dịch khác/
);

console.log("analytics policy regression tests passed");
