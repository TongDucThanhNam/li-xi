#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  convexAuthStorageNamespace,
  hasConvexAuthSessionInStorage,
  shouldAllowHostRoute,
} from "../lib/hostRouteAuthPolicy.ts";

function storageWith(entries) {
  const values = new Map(entries);
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
  };
}

const convexUrl = "https://prod-a.convex.cloud";
const namespace = convexAuthStorageNamespace(convexUrl);
const legacyOwnerSession = JSON.stringify({
  userId: "user_legacy",
  username: "legacy",
  authSource: "legacy",
});

assert.equal(namespace, "httpsprodaconvexcloud");
assert.equal(
  hasConvexAuthSessionInStorage(
    storageWith([[`__convexAuthJWT_${namespace}`, "jwt"]]),
    convexUrl
  ),
  true,
  "JWT token presence should satisfy the Convex Auth browser session guard"
);
assert.equal(
  hasConvexAuthSessionInStorage(
    storageWith([[`__convexAuthRefreshToken_${namespace}`, "refresh"]]),
    convexUrl
  ),
  true,
  "refresh token presence should satisfy the Convex Auth browser session guard"
);
assert.equal(
  hasConvexAuthSessionInStorage(storageWith([[`__convexAuthJWT_${namespace}`, "jwt"]]), undefined),
  false,
  "missing VITE_CONVEX_URL should fail closed even if unrelated storage tokens exist"
);
assert.equal(
  shouldAllowHostRoute({
    isBrowser: false,
    storage: null,
    convexUrl: undefined,
  }),
  true,
  "SSR should not redirect because Convex Auth browser storage is unavailable"
);
assert.equal(
  shouldAllowHostRoute({
    isBrowser: true,
    storage: storageWith([[`__convexAuthJWT_${namespace}`, "jwt"]]),
    convexUrl,
  }),
  true,
  "Convex Auth session should allow host routes"
);
assert.equal(
  shouldAllowHostRoute({
    isBrowser: true,
    storage: storageWith([["li_xi_owner_session", legacyOwnerSession]]),
    convexUrl,
  }),
  false,
  "legacy owner session should not allow host routes"
);
assert.equal(
  shouldAllowHostRoute({
    isBrowser: true,
    storage: storageWith([
      ["li_xi_owner_session", legacyOwnerSession],
      [`__convexAuthRefreshToken_${namespace}`, "refresh"],
    ]),
    convexUrl,
  }),
  true,
  "Convex Auth session should allow host routes even when stale legacy storage exists"
);
assert.equal(
  shouldAllowHostRoute({
    isBrowser: true,
    storage: storageWith([["li_xi_owner_session", legacyOwnerSession]]),
    convexUrl,
  }),
  false,
  "stale legacy owner session should not allow host routes"
);
assert.equal(
  shouldAllowHostRoute({
    isBrowser: true,
    storage: storageWith([]),
    convexUrl,
  }),
  false,
  "host routes should redirect without Convex Auth"
);

console.log("host route guard regression tests passed");
