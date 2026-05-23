#!/usr/bin/env node

import { validateProductionEvidenceReport } from "./validate-production-evidence-report.mjs";

const validReport = `# Production Evidence

## Deployment

- Environment: staging
- App origin: https://app.example.com
- Convex cloud origin: https://prod-a.convex.cloud
- Convex HTTP Actions origin: https://prod-a.convex.site
- Evidence date: 2026-05-22
- Verifier: release owner
- Release/ref: abc123

## Local Gate

- Command: \`npm run verify:local\`
- Result: PASS
- Notes: clean

## Readiness Artifact

- Command:
  \`VITE_CONVEX_URL=https://prod-a.convex.cloud VITE_SITE_URL=https://app.example.com LI_XI_OPS_ADMIN_TOKEN=<token> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json\`
- Artifact validation: \`npm run verify:evidence -- /tmp/li-xi-production-readiness.json\`
- Result: PASS
- Artifact location: /tmp/li-xi-production-readiness.json
- \`productionReady\`: true
- Redaction metadata present: yes
- Ops token shape checked: yes
- Billing admin token shape checked: yes
- Migration token shape checked: yes
- Notes: clean

## Google OAuth

- Google callback URL: https://prod-a.convex.site/api/auth/callback/google
- Browser sign-in result: pass
- Redirect target after sign-in: /campaigns
- Host profile row id: users:abc
- Legacy owner session absent or ignored: yes
- Reload/token-refresh check: pass
- Result: PASS
- Notes: clean

## Campaign And Public Claim

- Campaign id or slug: campaign-1
- Campaign status: active
- Start CTA rendered: Thử vận may
- Collect CTA rendered: Nhận thưởng
- Station session created: yes
- Public claim code: abc123abc123abc123abc123
- Public claim hero rendered: yes
- Redeem result: pass
- Reopen same code closed: yes
- Malformed public code closed: yes
- Expired public code closed: yes
- Inactive campaign public claim closed: yes
- Guest API internal ids absent: yes
- Result: PASS
- Notes: clean

## Cloudflare R2

- Asset row id: asset-1
- Asset owner id: user-1
- Asset campaign id or slug: campaign-1
- R2 key: key-1
- Content type: image/webp; charset=binary
- Size: 8388608
- Bucket matches configured R2 bucket: yes
- Metadata source: r2
- Lifecycle status: attached
- Validation timestamp present: yes
- Campaign Studio preview rendered: yes
- Public claim hero rendered: yes
- Station hero rendered: yes
- Negative checks: pass
- Result: PASS
- Notes: clean

## Polar

- Polar customer id: customer-1
- Polar subscription id: sub-1
- Product alias/id: pro
- Checkout result: pass
- Plan change result: pass
- Customer portal result: pass
- Checkout return origin: https://app.example.com
- Checkout return URL: https://app.example.com/campaigns?checkout=success
- Customer portal return origin: https://app.example.com
- Customer portal return URL: https://app.example.com/campaigns
- Polar webhook URL: https://prod-a.convex.site/polar/events
- Webhook receipt time: 2026-05-22T00:00:00.000Z
- Convex billing state: active
- Billing sync token removed: yes
- Result: PASS
- Notes: clean

## Analytics And Backfill

- Owner id: user-1
- Campaign id: campaign-1
- New station session counter result: pass
- New public claim redemption counter result: pass
- Owner backfill dry-run: pass
- Owner backfill audit decisions: reviewed skipped counts and auditDecisions sample
- Owner backfill apply: pass
- Owner backfill rerun idempotent: pass
- Campaign backfill dry-run/apply/rerun: pass
- Campaign backfill rerun idempotent: pass
- Migration token removed: yes
- Result: PASS
- Notes: clean

## Cleanup

- Temporary tokens removed: reviewed LI_XI_OPS_ADMIN_TOKEN, LIXI_OPS_ADMIN_TOKEN, LI_XI_BILLING_ADMIN_TOKEN, LIXI_BILLING_ADMIN_TOKEN, LI_XI_MIGRATION_TOKEN, and LIXI_MIGRATION_TOKEN are removed or absent
- Legacy flags disabled: reviewed LI_XI_ENABLE_LEGACY_AUTH, LEGACY_AUTH_ENABLED, LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LEGACY_OWNER_BRIDGE_ENABLED, VITE_LI_XI_ENABLE_LEGACY_AUTH, VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LI_XI_ENABLE_PAID_PLAN_FALLBACK, and LIXI_ENABLE_PAID_PLAN_FALLBACK are disabled or absent
- Maintenance dry-run audit decisions: reviewed public-link sessionDecisions, stale asset assetDecisions, default profileDecision, active campaignDecisions, duplicate budgetDecisions, and duplicate profileDecisions before apply
- Test public links cancelled: yes
- Test campaigns/assets cleaned up: yes
- Test Polar subscriptions cleaned up: yes
- Secrets rotated if exposed: reviewed deployment logs and evidence artifacts; none exposed, rotation not needed
- Result: PASS
- Notes: clean

## Final Decision

- Production readiness accepted: YES
- Remaining risks: None
- Follow-up tasks: routine monitoring
- Approver: release owner
`;

function assertRejects(name, report, expectedMessage) {
  try {
    validateProductionEvidenceReport(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedMessage)) {
      return;
    }
    throw new Error(`${name} failed with unexpected message: ${message}`);
  }
  throw new Error(`${name} should fail validation`);
}

validateProductionEvidenceReport(validReport);
validateProductionEvidenceReport(
  validReport.replace("LI_XI_OPS_ADMIN_TOKEN=<token>", "LIXI_OPS_ADMIN_TOKEN=<token>")
);

assertRejects(
  "raw ops token",
  validReport.replace("LI_XI_OPS_ADMIN_TOKEN=<token>", "LI_XI_OPS_ADMIN_TOKEN=raw-secret"),
  "must keep the ops token redacted"
);

assertRejects(
  "raw ops alias token",
  validReport.replace("LI_XI_OPS_ADMIN_TOKEN=<token>", "LIXI_OPS_ADMIN_TOKEN=raw-secret"),
  "must keep the ops token redacted"
);

assertRejects(
  "mismatched artifact path",
  validReport.replace("- Artifact location: /tmp/li-xi-production-readiness.json", "- Artifact location: /tmp/other.json"),
  "Artifact location must match --evidence-out path"
);

assertRejects(
  "wrong R2 metadata source",
  validReport.replace("- Metadata source: r2", "- Metadata source: client"),
  "Cloudflare R2.Metadata source must be one of: r2"
);

assertRejects(
  "boolean R2 asset row id evidence",
  validReport.replace("- Asset row id: asset-1", "- Asset row id: yes"),
  "Cloudflare R2.Asset row id must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "placeholder R2 asset row id evidence",
  validReport.replace("- Asset row id: asset-1", "- Asset row id: placeholder-asset-id"),
  "Cloudflare R2.Asset row id must not be a placeholder"
);

assertRejects(
  "URL R2 asset row id evidence",
  validReport.replace("- Asset row id: asset-1", "- Asset row id: https://dashboard.convex.dev/assets/asset-1"),
  "Cloudflare R2.Asset row id must not be a URL"
);

assertRejects(
  "mismatched R2 asset owner evidence",
  validReport.replace("- Asset owner id: user-1", "- Asset owner id: user-2"),
  "Cloudflare R2.Asset owner id must match Analytics And Backfill.Owner id"
);

assertRejects(
  "boolean R2 asset owner evidence",
  validReport.replace("- Asset owner id: user-1", "- Asset owner id: yes"),
  "Cloudflare R2.Asset owner id must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "mismatched R2 asset campaign evidence",
  validReport.replace("- Asset campaign id or slug: campaign-1", "- Asset campaign id or slug: campaign-2"),
  "Cloudflare R2.Asset campaign id or slug must match Campaign And Public Claim.Campaign id or slug"
);

assertRejects(
  "placeholder R2 asset campaign evidence",
  validReport.replace("- Asset campaign id or slug: campaign-1", "- Asset campaign id or slug: placeholder-campaign-id"),
  "Cloudflare R2.Asset campaign id or slug must not be a placeholder"
);

assertRejects(
  "R2 key recorded as signed URL",
  validReport.replace("- R2 key: key-1", "- R2 key: https://assets.example.com/key-1?signature=secret"),
  "Cloudflare R2.R2 key must be an object key, not a URL"
);

assertRejects(
  "R2 key with traversal",
  validReport.replace("- R2 key: key-1", "- R2 key: campaign-assets/../key-1"),
  "Cloudflare R2.R2 key must not contain empty or traversal path segments"
);

assertRejects(
  "R2 key with backslashes",
  validReport.replace("- R2 key: key-1", "- R2 key: campaign-assets\\\\key-1"),
  "Cloudflare R2.R2 key must use slash path separators, not backslashes"
);

assertRejects(
  "failed public claim redeem",
  validReport.replace("- Redeem result: pass", "- Redeem result: fail"),
  "Campaign And Public Claim.Redeem result must be one of: pass, yes, true"
);

assertRejects(
  "boolean campaign id evidence",
  validReport.replace("- Campaign id or slug: campaign-1", "- Campaign id or slug: yes"),
  "Campaign And Public Claim.Campaign id or slug must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "placeholder campaign id evidence",
  validReport.replace("- Campaign id or slug: campaign-1", "- Campaign id or slug: placeholder-campaign-id"),
  "Campaign And Public Claim.Campaign id or slug must not be a placeholder"
);

assertRejects(
  "URL campaign id evidence",
  validReport.replace(
    "- Campaign id or slug: campaign-1",
    "- Campaign id or slug: https://dashboard.convex.dev/campaigns/campaign-1"
  ),
  "Campaign And Public Claim.Campaign id or slug must not be a URL"
);

assertRejects(
  "boolean start CTA evidence",
  validReport.replace("- Start CTA rendered: Thử vận may", "- Start CTA rendered: yes"),
  "Campaign And Public Claim.Start CTA rendered must record the observed copy text, not a boolean result"
);

assertRejects(
  "duplicate campaign CTA evidence",
  validReport.replace("- Collect CTA rendered: Nhận thưởng", "- Collect CTA rendered: Thử vận may"),
  "Campaign And Public Claim start and collect CTA evidence must be distinct copy values"
);

assertRejects(
  "malformed public claim code",
  validReport.replace("- Public claim code: abc123abc123abc123abc123", "- Public claim code: claim-123"),
  "Campaign And Public Claim.Public claim code must be a 24-character lowercase hex code"
);

assertRejects(
  "failed malformed public code check",
  validReport.replace("- Malformed public code closed: yes", "- Malformed public code closed: no"),
  "Campaign And Public Claim.Malformed public code closed must be one of: yes, true, pass"
);

assertRejects(
  "failed expired public code check",
  validReport.replace("- Expired public code closed: yes", "- Expired public code closed: no"),
  "Campaign And Public Claim.Expired public code closed must be one of: yes, true, pass"
);

assertRejects(
  "failed inactive campaign public claim check",
  validReport.replace(
    "- Inactive campaign public claim closed: yes",
    "- Inactive campaign public claim closed: no"
  ),
  "Campaign And Public Claim.Inactive campaign public claim closed must be one of: yes, true, pass"
);

assertRejects(
  "guest API internal ids exposed",
  validReport.replace("- Guest API internal ids absent: yes", "- Guest API internal ids absent: no"),
  "Campaign And Public Claim.Guest API internal ids absent must be one of: yes, true, pass"
);

assertRejects(
  "bad Convex deployment label",
  validReport.replace("- Convex HTTP Actions origin: https://prod-a.convex.site", "- Convex HTTP Actions origin: https://prod-.convex.site"),
  "Deployment.Convex HTTP Actions origin must include a clean deployment label"
);

assertRejects(
  "invalid deployment environment",
  validReport.replace("- Environment: staging", "- Environment: local"),
  "Deployment.Environment must be one of: staging, production"
);

assertRejects(
  "invalid evidence date",
  validReport.replace("- Evidence date: 2026-05-22", "- Evidence date: 2026/05/22"),
  "Deployment.Evidence date must be an ISO date"
);

assertRejects(
  "boolean verifier evidence",
  validReport.replace("- Verifier: release owner", "- Verifier: yes"),
  "Deployment.Verifier must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "URL release ref evidence",
  validReport.replace("- Release/ref: abc123", "- Release/ref: https://github.com/acme/li-xi/commit/abc123"),
  "Deployment.Release/ref must not be a URL"
);

assertRejects(
  "app origin with port",
  validReport.replaceAll("https://app.example.com", "https://app.example.com:8443"),
  "Deployment.App origin must not include a port"
);

assertRejects(
  "private app origin",
  validReport.replaceAll("https://app.example.com", "https://10.0.0.1"),
  "Deployment.App origin must not be a raw IPv4 address"
);

assertRejects(
  "localhost app origin",
  validReport.replaceAll("https://app.example.com", "https://localhost"),
  "Deployment.App origin must be a public app origin"
);

assertRejects(
  "wrong Polar webhook path",
  validReport.replace("https://prod-a.convex.site/polar/events", "https://prod-a.convex.site/polar/webhook"),
  "Polar.Polar webhook URL must use /polar/events"
);

assertRejects(
  "boolean Polar customer id evidence",
  validReport.replace("- Polar customer id: customer-1", "- Polar customer id: yes"),
  "Polar.Polar customer id must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "placeholder Polar subscription id evidence",
  validReport.replace("- Polar subscription id: sub-1", "- Polar subscription id: placeholder-subscription-id"),
  "Polar.Polar subscription id must not be a placeholder"
);

assertRejects(
  "URL Polar product evidence",
  validReport.replace("- Product alias/id: pro", "- Product alias/id: https://polar.sh/products/pro"),
  "Polar.Product alias/id must not be a URL"
);

assertRejects(
  "default-port Google callback URL",
  validReport.replace(
    "- Google callback URL: https://prod-a.convex.site/api/auth/callback/google",
    "- Google callback URL: https://prod-a.convex.site:443/api/auth/callback/google"
  ),
  "Google OAuth.Google callback URL must be a clean endpoint URL"
);

assertRejects(
  "external OAuth redirect target",
  validReport.replace(
    "- Redirect target after sign-in: /campaigns",
    "- Redirect target after sign-in: https://evil.example.com/campaigns"
  ),
  "Google OAuth.Redirect target after sign-in must be a root-relative app route"
);

assertRejects(
  "wrong OAuth redirect target",
  validReport.replace(
    "- Redirect target after sign-in: /campaigns",
    "- Redirect target after sign-in: /draw"
  ),
  "Google OAuth.Redirect target after sign-in must be one of: /setup, /campaigns"
);

assertRejects(
  "OAuth redirect target with query",
  validReport.replace(
    "- Redirect target after sign-in: /campaigns",
    "- Redirect target after sign-in: /campaigns?next=/claim/abc123abc123abc123abc123"
  ),
  "Google OAuth.Redirect target after sign-in must not include a query string"
);

assertRejects(
  "boolean host profile row id evidence",
  validReport.replace("- Host profile row id: users:abc", "- Host profile row id: yes"),
  "Google OAuth.Host profile row id must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "placeholder host profile row id evidence",
  validReport.replace("- Host profile row id: users:abc", "- Host profile row id: placeholder-host-profile-id"),
  "Google OAuth.Host profile row id must not be a placeholder"
);

assertRejects(
  "URL host profile row id evidence",
  validReport.replace("- Host profile row id: users:abc", "- Host profile row id: https://dashboard.convex.dev/users/abc"),
  "Google OAuth.Host profile row id must not be a URL"
);

assertRejects(
  "default-port Polar webhook URL",
  validReport.replace(
    "- Polar webhook URL: https://prod-a.convex.site/polar/events",
    "- Polar webhook URL: https://prod-a.convex.site:443/polar/events"
  ),
  "Polar.Polar webhook URL must be a clean endpoint URL"
);

assertRejects(
  "mismatched Polar checkout return origin",
  validReport.replace("- Checkout return origin: https://app.example.com", "- Checkout return origin: https://billing.example.com"),
  "Polar.Checkout return origin must match Deployment.App origin"
);

assertRejects(
  "wrong Polar checkout return path",
  validReport.replace(
    "- Checkout return URL: https://app.example.com/campaigns?checkout=success",
    "- Checkout return URL: https://app.example.com/draw?checkout=success"
  ),
  "Polar.Checkout return URL must use /campaigns"
);

assertRejects(
  "unexpected Polar checkout return query",
  validReport.replace(
    "- Checkout return URL: https://app.example.com/campaigns?checkout=success",
    "- Checkout return URL: https://app.example.com/campaigns?next=/draw"
  ),
  "Polar.Checkout return URL must use one of these query strings: (none), ?checkout=success"
);

assertRejects(
  "failed Polar checkout result",
  validReport.replace("- Checkout result: pass", "- Checkout result: fail"),
  "Polar.Checkout result must be one of: pass, yes, true"
);

assertRejects(
  "default-port Polar checkout return origin",
  validReport.replace("- Checkout return origin: https://app.example.com", "- Checkout return origin: https://app.example.com:443"),
  "Polar.Checkout return origin must be a clean origin"
);

assertRejects(
  "raw Polar portal return origin",
  validReport.replace("- Customer portal return origin: https://app.example.com", "- Customer portal return origin: https://8.8.8.8"),
  "Polar.Customer portal return origin must not be a raw IPv4 address"
);

assertRejects(
  "wrong Polar portal return path",
  validReport.replace(
    "- Customer portal return URL: https://app.example.com/campaigns",
    "- Customer portal return URL: https://app.example.com/leaderboard"
  ),
  "Polar.Customer portal return URL must use /campaigns"
);

assertRejects(
  "unexpected Polar portal return query",
  validReport.replace(
    "- Customer portal return URL: https://app.example.com/campaigns",
    "- Customer portal return URL: https://app.example.com/campaigns?checkout=success"
  ),
  "Polar.Customer portal return URL must use one of these query strings: (none)"
);

assertRejects(
  "billing sync token still present",
  validReport.replace("- Billing sync token removed: yes", "- Billing sync token removed: no"),
  "Polar.Billing sync token removed must be one of: yes, true, pass"
);

assertRejects(
  "invalid Polar webhook receipt time",
  validReport.replace("- Webhook receipt time: 2026-05-22T00:00:00.000Z", "- Webhook receipt time: received"),
  "Polar.Webhook receipt time must be an ISO-8601 UTC timestamp"
);

assertRejects(
  "ops token shape unchecked",
  validReport.replace("- Ops token shape checked: yes", "- Ops token shape checked: no"),
  "Readiness Artifact.Ops token shape checked must be one of: yes, true, pass"
);

assertRejects(
  "billing admin token shape unchecked",
  validReport.replace(
    "- Billing admin token shape checked: yes",
    "- Billing admin token shape checked: no"
  ),
  "Readiness Artifact.Billing admin token shape checked must be one of: yes, true, pass"
);

assertRejects(
  "migration token shape unchecked",
  validReport.replace("- Migration token shape checked: yes", "- Migration token shape checked: no"),
  "Readiness Artifact.Migration token shape checked must be one of: yes, true, pass"
);

assertRejects(
  "failed campaign backfill rerun idempotency",
  validReport.replace(
    "- Campaign backfill rerun idempotent: pass",
    "- Campaign backfill rerun idempotent: fail"
  ),
  "Analytics And Backfill.Campaign backfill rerun idempotent must be one of: pass, yes, true"
);

assertRejects(
  "boolean analytics owner id evidence",
  validReport.replace("- Owner id: user-1", "- Owner id: yes"),
  "Analytics And Backfill.Owner id must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "placeholder analytics campaign id evidence",
  validReport.replace("- Campaign id: campaign-1", "- Campaign id: placeholder-campaign-id"),
  "Analytics And Backfill.Campaign id must not be a placeholder"
);

assertRejects(
  "mismatched analytics campaign evidence",
  validReport.replace("- Campaign id: campaign-1", "- Campaign id: campaign-2"),
  "Analytics And Backfill.Campaign id must match Campaign And Public Claim.Campaign id or slug"
);

assertRejects(
  "URL analytics campaign id evidence",
  validReport.replace("- Campaign id: campaign-1", "- Campaign id: https://dashboard.convex.dev/campaigns/campaign-1"),
  "Analytics And Backfill.Campaign id must not be a URL"
);

assertRejects(
  "analytics audit decisions not reviewed",
  validReport.replace(
    "- Owner backfill audit decisions: reviewed skipped counts and auditDecisions sample",
    "- Owner backfill audit decisions: completed"
  ),
  "Analytics And Backfill.Owner backfill audit decisions must record reviewed audit decisions"
);

assertRejects(
  "maintenance decisions not enumerated",
  validReport.replace(
    "- Maintenance dry-run audit decisions: reviewed public-link sessionDecisions, stale asset assetDecisions, default profileDecision, active campaignDecisions, duplicate budgetDecisions, and duplicate profileDecisions before apply",
    "- Maintenance dry-run audit decisions: reviewed cleanup decisions"
  ),
  "Cleanup.Maintenance dry-run audit decisions must mention sessionDecisions"
);

assertRejects(
  "migration token still present",
  validReport.replace("- Migration token removed: yes", "- Migration token removed: no"),
  "Analytics And Backfill.Migration token removed must be one of: yes, true, pass"
);

assertRejects(
  "generic temporary token cleanup evidence",
  validReport.replace(
    "- Temporary tokens removed: reviewed LI_XI_OPS_ADMIN_TOKEN, LIXI_OPS_ADMIN_TOKEN, LI_XI_BILLING_ADMIN_TOKEN, LIXI_BILLING_ADMIN_TOKEN, LI_XI_MIGRATION_TOKEN, and LIXI_MIGRATION_TOKEN are removed or absent",
    "- Temporary tokens removed: yes"
  ),
  "Cleanup.Temporary tokens removed must record reviewed cleanup evidence"
);

assertRejects(
  "missing ops admin token cleanup evidence",
  validReport.replace("LI_XI_OPS_ADMIN_TOKEN, ", ""),
  "Cleanup.Temporary tokens removed must mention LI_XI_OPS_ADMIN_TOKEN"
);

assertRejects(
  "missing ops admin alias token cleanup evidence",
  validReport.replace("LIXI_OPS_ADMIN_TOKEN, ", ""),
  "Cleanup.Temporary tokens removed must mention LIXI_OPS_ADMIN_TOKEN"
);

assertRejects(
  "missing billing admin token cleanup evidence",
  validReport.replace(
    "LI_XI_BILLING_ADMIN_TOKEN, LIXI_BILLING_ADMIN_TOKEN, ",
    ""
  ),
  "Cleanup.Temporary tokens removed must mention LI_XI_BILLING_ADMIN_TOKEN"
);

assertRejects(
  "missing billing admin alias token cleanup evidence",
  validReport.replace("LIXI_BILLING_ADMIN_TOKEN, ", ""),
  "Cleanup.Temporary tokens removed must mention LIXI_BILLING_ADMIN_TOKEN"
);

assertRejects(
  "missing migration token cleanup evidence",
  validReport.replace("LI_XI_MIGRATION_TOKEN, and ", ""),
  "Cleanup.Temporary tokens removed must mention LI_XI_MIGRATION_TOKEN"
);

assertRejects(
  "missing migration token alias cleanup evidence",
  validReport.replace(", and LIXI_MIGRATION_TOKEN", ""),
  "Cleanup.Temporary tokens removed must mention LIXI_MIGRATION_TOKEN"
);

assertRejects(
  "generic legacy flag cleanup evidence",
    validReport.replace(
    "- Legacy flags disabled: reviewed LI_XI_ENABLE_LEGACY_AUTH, LEGACY_AUTH_ENABLED, LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LEGACY_OWNER_BRIDGE_ENABLED, VITE_LI_XI_ENABLE_LEGACY_AUTH, VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LI_XI_ENABLE_PAID_PLAN_FALLBACK, and LIXI_ENABLE_PAID_PLAN_FALLBACK are disabled or absent",
    "- Legacy flags disabled: yes"
  ),
  "Cleanup.Legacy flags disabled must record reviewed cleanup evidence"
);

assertRejects(
  "missing paid fallback cleanup evidence",
  validReport.replace(
    ", LI_XI_ENABLE_PAID_PLAN_FALLBACK, and LIXI_ENABLE_PAID_PLAN_FALLBACK",
    ""
  ),
  "Cleanup.Legacy flags disabled must mention LI_XI_ENABLE_PAID_PLAN_FALLBACK"
);

assertRejects(
  "missing legacy owner bridge cleanup evidence",
  validReport.replace(
    ", LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LEGACY_OWNER_BRIDGE_ENABLED",
    ""
  ),
  "Cleanup.Legacy flags disabled must mention LEGACY_OWNER_BRIDGE_ENABLED"
);

assertRejects(
  "bare secrets rotation not needed",
  validReport.replace(
    "- Secrets rotated if exposed: reviewed deployment logs and evidence artifacts; none exposed, rotation not needed",
    "- Secrets rotated if exposed: not needed"
  ),
  "Cleanup.Secrets rotated if exposed must record reviewed secret-exposure evidence"
);

assertRejects(
  "boolean final approver evidence",
  validReport.replace("- Approver: release owner", "- Approver: yes"),
  "Final Decision.Approver must record the concrete id or alias, not a boolean/status result"
);

assertRejects(
  "placeholder final approver evidence",
  validReport.replace("- Approver: release owner", "- Approver: placeholder-approver"),
  "Final Decision.Approver must not be a placeholder"
);

assertRejects(
  "URL final approver evidence",
  validReport.replace("- Approver: release owner", "- Approver: https://dashboard.acme.org/users/release-owner"),
  "Final Decision.Approver must not be a URL"
);

assertRejects(
  "missing final follow-up tasks",
  validReport.replace("- Follow-up tasks: routine monitoring", "- Follow-up tasks:"),
  "Final Decision.Follow-up tasks must be filled"
);

assertRejects(
  "blocking final follow-up tasks",
  validReport.replace(
    "- Follow-up tasks: routine monitoring",
    "- Follow-up tasks: Polar webhook unverified launch risk"
  ),
  "Final Decision.Follow-up tasks must not record unresolved launch blockers"
);

console.log("production evidence report validator import tests passed");
