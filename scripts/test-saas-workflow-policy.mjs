#!/usr/bin/env node

import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, expected, message) {
  assert(source.includes(expected), message);
}

function assertMatches(source, pattern, message) {
  assert(pattern.test(source), message);
}

const authRoute = read("app/auth.tsx");
const setupRoute = read("app/setup.tsx");
const campaignsRoute = read("app/campaigns.tsx");
const drawRoute = read("app/draw.tsx");
const claimRoute = read("app/claim/$publicCode.tsx");
const setup = read("convex/setup.ts");
const campaigns = read("convex/campaigns.ts");
const draw = read("convex/draw.ts");
const assets = read("convex/assets.ts");
const entitlements = read("convex/entitlements.ts");
const productionEvidenceReport = read("scripts/validate-production-evidence-report.mjs");

assertIncludes(authRoute, 'signIn("google"', "OAuth route must initiate Google sign-in");
assertIncludes(
  authRoute,
  "api.auth.ensureCurrentHostProfile",
  "OAuth completion must materialize the Convex Auth host profile"
);
assertIncludes(
  authRoute,
  "api.setup.getSetupState",
  "OAuth completion must inspect setup state before routing"
);
assertIncludes(
  authRoute,
  'setupState.hasSetup ? "/campaigns" : "/setup"',
  "OAuth completion must route configured hosts to Campaign Studio and new hosts to setup"
);
assertIncludes(
  authRoute,
  "clearOwnerSession()",
  "OAuth completion must clear stale legacy owner-session state"
);

assertIncludes(
  campaignsRoute,
  "CampaignEditor",
  "Campaign Studio route must delegate editing to CampaignEditor"
);
assertIncludes(
  campaignsRoute,
  "BillingPanel",
  "Campaign Studio route must delegate billing controls to BillingPanel"
);
assertIncludes(
  campaignsRoute,
  "ReadinessPanel",
  "Campaign Studio route must delegate readiness controls to ReadinessPanel"
);
assertIncludes(
  campaigns,
  "await assertCanCreateCampaign(ctx, ownerId)",
  "campaign creation must be entitlement-gated"
);
assertIncludes(
  campaigns,
  "await hasOpenPendingSessionForCampaign(ctx, ownerId, campaignId)",
  "campaign status changes must guard open station/public sessions"
);

assertIncludes(
  setupRoute,
  "NativeSelect",
  "budget setup must expose an explicit campaign selector"
);
assertIncludes(
  setupRoute,
  "api.setup.getSetupState",
  "budget setup must read scoped setup state"
);
assertIncludes(
  setupRoute,
  "campaignId: selectedCampaignId ?? setupState.budgetScope.campaignId",
  "budget setup submissions must send the selected campaign scope"
);
assertMatches(
  setup,
  /getSetupState[\s\S]*campaignId: v\.optional\(v\.id\("campaigns"\)\)/,
  "setup state query must accept an explicit campaign id"
);
assertMatches(
  setup,
  /configureBudget[\s\S]*campaignId: v\.optional\(v\.id\("campaigns"\)\)/,
  "budget configuration must accept an explicit campaign id"
);
assertMatches(
  setup,
  /syncBudgetFromItems[\s\S]*campaignId: v\.optional\(v\.id\("campaigns"\)\)/,
  "budget sync must accept an explicit campaign id"
);
assertIncludes(
  setup,
  "campaignId: scope.campaignId",
  "new budget and budget item writes must carry the resolved campaign scope"
);
assertIncludes(
  setup,
  "await assertBudgetItemCount(ctx, ownerId",
  "budget item writes must be entitlement-gated"
);

assertIncludes(
  drawRoute,
  'useState<DeliveryMode>("station")',
  "station draw route must default to station delivery"
);
assertIncludes(
  drawRoute,
  "deliveryMode,",
  "station draw route must pass the selected delivery mode to createSession"
);
assertIncludes(
  draw,
  'v.union(v.literal("station"), v.literal("link"))',
  "draw session mutation must validate station and public-link delivery modes"
);
assertIncludes(
  draw,
  "deliveryMode === \"link\" ? await generateUniquePublicCode(ctx) : undefined",
  "public-link sessions must mint a public code only for link delivery"
);
assertIncludes(
  draw,
  "deliveryMode === \"station\" && pendingStationSession",
  "station sessions must preserve the single live station guard"
);
assertIncludes(
  draw,
  "await recordSessionCreated(ctx, sessionId, ownerId, campaignId)",
  "new session analytics must be recorded with the resolved campaign id"
);

assertIncludes(
  claimRoute,
  'createFileRoute("/claim/$publicCode")',
  "public claim route must be a tokenized route"
);
assertIncludes(
  claimRoute,
  "normalizePublicClaimCode(publicCode)",
  "public claim route must normalize claim tokens before querying"
);
assertIncludes(
  claimRoute,
  "api.draw.getPublicSession",
  "public claim route must resolve public session state through the guest-safe query"
);
assertIncludes(
  claimRoute,
  "api.draw.redeemPublicSession",
  "public claim route must redeem through the public claim mutation"
);
assertIncludes(
  draw,
  "findPendingLinkSessionByPublicCode(ctx, publicCode)",
  "public claim backend must resolve only pending link sessions by public code"
);
assertIncludes(
  draw,
  "const campaignId = await requireRedeemableSessionCampaign(ctx, session)",
  "redeem writes must require a concrete campaign id before mutating budget or redemptions"
);
assertIncludes(
  draw,
  "campaignId,",
  "redemption insert must carry the validated campaign id"
);

assertIncludes(
  entitlements,
  "export async function assertCanCreateCampaign",
  "entitlement policy must expose campaign creation limits"
);
assertIncludes(
  entitlements,
  "export async function assertCanUploadAsset",
  "entitlement policy must expose asset upload limits"
);
assertIncludes(
  entitlements,
  "export async function assertCanCreateSession",
  "entitlement policy must expose open-session limits"
);
assertIncludes(
  entitlements,
  "export async function assertCanRedeem",
  "entitlement policy must expose redemption limits"
);
assertIncludes(
  assets,
  "await assertCanUploadAsset(ctx, ownerId)",
  "campaign asset uploads must be entitlement-gated"
);

for (const requiredField of [
  "Browser sign-in result",
  "Campaign id or slug",
  "Station session created",
  "Public claim code",
  "Redeem result",
  "Reopen same code closed",
  "Malformed public code closed",
  "Inactive campaign public claim closed",
  "Checkout result",
  "Plan change result",
  "Convex billing state",
]) {
  assertIncludes(
    productionEvidenceReport,
    `"${requiredField}"`,
    `production evidence report must require live workflow evidence for ${requiredField}`
  );
}

console.log("SaaS workflow policy checks passed");
