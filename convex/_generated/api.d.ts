/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as authorization from "../authorization.js";
import type * as billing from "../billing.js";
import type * as budgetScope from "../budgetScope.js";
import type * as campaignIdentity from "../campaignIdentity.js";
import type * as campaigns from "../campaigns.js";
import type * as crons from "../crons.js";
import type * as draw from "../draw.js";
import type * as entitlements from "../entitlements.js";
import type * as hostProfiles from "../hostProfiles.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as migrationToken from "../migrationToken.js";
import type * as migrations from "../migrations.js";
import type * as ops from "../ops.js";
import type * as polarClient from "../polarClient.js";
import type * as publicLinks from "../publicLinks.js";
import type * as security from "../security.js";
import type * as setup from "../setup.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  assets: typeof assets;
  auth: typeof auth;
  authorization: typeof authorization;
  billing: typeof billing;
  budgetScope: typeof budgetScope;
  campaignIdentity: typeof campaignIdentity;
  campaigns: typeof campaigns;
  crons: typeof crons;
  draw: typeof draw;
  entitlements: typeof entitlements;
  hostProfiles: typeof hostProfiles;
  http: typeof http;
  leaderboard: typeof leaderboard;
  migrationToken: typeof migrationToken;
  migrations: typeof migrations;
  ops: typeof ops;
  polarClient: typeof polarClient;
  publicLinks: typeof publicLinks;
  security: typeof security;
  setup: typeof setup;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  aggregate: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregate">;
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
