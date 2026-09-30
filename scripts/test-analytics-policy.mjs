#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  campaignChannelMetricKey,
  campaignMetricKey,
  COUNTER_SCOPES_VERSION,
  estimateAnalyticsCounterEventWrite,
  gameChannelMetricKey,
  ownerMetricKey,
  playSessionCounterEventKey,
  redemptionCounterEventKey,
  rewardCounterEventKey,
  sessionCounterEventKey,
  shareLinkMetricKey,
} from "../lib/analyticsPolicy.ts";

assert.equal(ownerMetricKey("user_1", "session_created"), "owner:user_1:session_created");
assert.equal(campaignMetricKey("campaign_1", "redemption_created"), "campaign:campaign_1:redemption_created");
// Channel/share-link counter scopes (slice 4c): per campaign, per game, and
// per link, derived from the same validated id inputs as the owner scopes.
assert.equal(
  campaignChannelMetricKey("campaign_1", "public-link", "game_open"),
  "campaign-channel:campaign_1:public-link:game_open"
);
assert.equal(
  campaignChannelMetricKey("campaign_1", "station", "reward_claim"),
  "campaign-channel:campaign_1:station:reward_claim"
);
assert.equal(
  gameChannelMetricKey("game_1", "station", "game_completion"),
  "game-channel:game_1:station:game_completion"
);
assert.equal(
  shareLinkMetricKey("link_1", "public_play_link_open"),
  "share-link:link_1:public_play_link_open"
);
assert.throws(() => campaignChannelMetricKey("", "public-link", "game_open"), /campaignId analytics không được rỗng/);
assert.throws(() => gameChannelMetricKey("  ", "station", "game_open"), /Analytics id không được rỗng/);
assert.throws(() => shareLinkMetricKey("", "game_open"), /Analytics id không được rỗng/);
// The readiness stamp stays a stable exactly-once marker for the backfill.
assert.equal(COUNTER_SCOPES_VERSION, 1);
assert.equal(sessionCounterEventKey("session_1"), "session:session_1:session_created");
assert.equal(redemptionCounterEventKey("redemption_1"), "redemption:redemption_1:redemption_created");
assert.equal(playSessionCounterEventKey("session_1", "game_open"), "play-session:session_1:game_open");
assert.equal(playSessionCounterEventKey("session_1", "public_play_link_open"), "play-session:session_1:public_play_link_open");
assert.equal(rewardCounterEventKey("redemption_1", "reward_outcome"), "reward:redemption_1:reward_outcome");
assert.equal(rewardCounterEventKey("redemption_1", "reward_claim"), "reward:redemption_1:reward_claim");
assert.equal(rewardCounterEventKey("redemption_1", "game_completion"), "reward:redemption_1:game_completion");
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
