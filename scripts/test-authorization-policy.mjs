#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const repoRoot = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

const convexFiles = [
  "convex/analytics.ts",
  "convex/assets.ts",
  "convex/campaigns.ts",
  "convex/draw.ts",
  "convex/entitlements.ts",
  "convex/hostProfiles.ts",
  "convex/leaderboard.ts",
  "convex/migrations.ts",
  "convex/setup.ts",
];

const authorization = read("convex/authorization.ts");
assert(
  !authorization.includes("allowLegacyBridge") &&
    !authorization.includes('source: "legacy"') &&
    authorization.includes("Client ownerId không được dùng để xác thực"),
  "requireResolvedOwner must not expose a legacy owner bridge path"
);
assert(
  authorization.includes("export function isLegacyOwnerBridgeEnabled"),
  "legacy owner bridge env helper may remain only for env readiness and legacy login shutdown checks"
);

const callPattern = /requireResolvedOwner\(ctx,\s*(args\.ownerId|undefined),\s*\{[\s\S]*?\n\s*\}\);/g;
let callCount = 0;

for (const file of convexFiles) {
  const source = read(file);
  const calls = source.match(callPattern) ?? [];
  for (const call of calls) {
    callCount += 1;
    assert(
      !call.includes("args.ownerId"),
      `${relative(process.cwd(), file)} host owner resolution must derive owner from Convex Auth instead of client ownerId`
    );
    assert(
      !call.includes("allowLegacyBridge"),
      `${relative(process.cwd(), file)} requireResolvedOwner call must not pass legacy bridge options`
    );
  }
}

assert(callCount > 0, "authorization policy test must inspect owner resolution callsites");
assert(
  !read("convex/migrations.ts").includes("requireResolvedOwner(ctx, args.ownerId"),
  "migration maintenance must use migration-token owner resolution instead of the legacy owner bridge"
);

console.log("authorization policy regression tests passed");
