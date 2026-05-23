#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  PUBLIC_LINK_TTL_MS,
  PUBLIC_CODE_BYTES,
  PUBLIC_CODE_HEX_LENGTH,
  getPublicLinkExpiresAt,
  isExpiredPendingLinkSession,
  isOpenPendingSession,
  isPendingLinkSession,
  isSafePublicLinkTimestamp,
  normalizePublicCode,
  resolvePublicLinkExpiresAt,
} from "../convex/publicLinks.ts";

const createdAt = 1_700_000_000_000;
const publicCode = "abcdefabcdefabcdefabcdef";
const pendingLink = {
  status: "pending",
  deliveryMode: "link",
  publicCode,
  createdAt,
};

assert.equal(PUBLIC_LINK_TTL_MS, 7 * 24 * 60 * 60 * 1000);
assert.equal(PUBLIC_CODE_BYTES, 12);
assert.equal(PUBLIC_CODE_HEX_LENGTH, 24);
assert.equal(normalizePublicCode(" ABCDEFabcdef123456789012 "), "abcdefabcdef123456789012");
assert.equal(normalizePublicCode("abcdefabcdefabcdefabcde"), null);
assert.equal(normalizePublicCode("abcdefabcdefabcdefabcdeg"), null);
assert.equal(normalizePublicCode("abcdef-abcdef-abcdef"), null);
assert.equal(isSafePublicLinkTimestamp(createdAt), true);
assert.equal(isSafePublicLinkTimestamp(0), false);
assert.equal(isSafePublicLinkTimestamp(Number.MAX_SAFE_INTEGER + 1), false);
assert.equal(getPublicLinkExpiresAt(createdAt), createdAt + PUBLIC_LINK_TTL_MS);
assert.throws(() => getPublicLinkExpiresAt(0), /Thời điểm tạo link public không hợp lệ/);
assert.throws(
  () => getPublicLinkExpiresAt(Number.MAX_SAFE_INTEGER),
  /Thời điểm hết hạn link public không hợp lệ/,
  "expiry timestamps that overflow safe integer range should fail closed"
);

assert.equal(isPendingLinkSession(pendingLink), true);
assert.equal(
  isPendingLinkSession({
    status: "pending",
    publicCode,
    createdAt,
  }),
  true,
  "legacy pending rows with publicCode and missing deliveryMode should be treated as link mode"
);
assert.equal(
  isPendingLinkSession({
    status: "pending",
    deliveryMode: "station",
    publicCode,
    createdAt,
  }),
  false,
  "station sessions should not become public links just because a malformed publicCode exists"
);
assert.equal(
  resolvePublicLinkExpiresAt(pendingLink),
  createdAt + PUBLIC_LINK_TTL_MS,
  "missing explicit expiry should default to createdAt plus TTL"
);
assert.equal(
  resolvePublicLinkExpiresAt({
    ...pendingLink,
    publicCodeExpiresAt: createdAt + 60_000,
  }),
  createdAt + 60_000,
  "explicit safe expiry inside TTL should be honored"
);
assert.equal(
  resolvePublicLinkExpiresAt({
    ...pendingLink,
    publicCodeExpiresAt: createdAt + PUBLIC_LINK_TTL_MS + 1,
  }),
  0,
  "explicit expiry beyond the max TTL should fail closed"
);
assert.equal(
  resolvePublicLinkExpiresAt({
    ...pendingLink,
    publicCodeExpiresAt: Number.MAX_SAFE_INTEGER + 1,
  }),
  0,
  "unsafe explicit expiry should fail closed"
);
assert.equal(
  resolvePublicLinkExpiresAt({
    ...pendingLink,
    createdAt: 0,
  }),
  0,
  "unsafe createdAt should fail closed"
);
assert.equal(
  resolvePublicLinkExpiresAt({
    ...pendingLink,
    createdAt: Number.MAX_SAFE_INTEGER,
  }),
  0,
  "missing explicit expiry should not synthesize an unsafe timestamp"
);
assert.equal(isExpiredPendingLinkSession(pendingLink, createdAt + PUBLIC_LINK_TTL_MS - 1), false);
assert.equal(isExpiredPendingLinkSession(pendingLink, createdAt + PUBLIC_LINK_TTL_MS), true);
assert.equal(isOpenPendingSession(pendingLink, createdAt + PUBLIC_LINK_TTL_MS - 1), true);
assert.equal(isOpenPendingSession(pendingLink, createdAt + PUBLIC_LINK_TTL_MS), false);
assert.equal(
  isOpenPendingSession(
    {
      status: "pending",
      deliveryMode: "station",
      createdAt,
    },
    createdAt + PUBLIC_LINK_TTL_MS
  ),
  true,
  "station pending sessions should not expire through public link TTL"
);
assert.equal(
  isOpenPendingSession(
    {
      ...pendingLink,
      status: "redeemed",
    },
    createdAt
  ),
  false,
  "non-pending link sessions should not count as open"
);

console.log("public link policy regression tests passed");
