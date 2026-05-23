# Production Evidence Template

Use this template after running
`docs/production-verification-runbook.md` against a live or staging deployment.
Keep it in the operational ticket, release record, or project notes. Do not
commit filled evidence if it contains deployment-specific operational data.
The repo ignores `li-xi-production-readiness*.json` and `production-evidence/`
as a guardrail for accidental local artifact output.

After filling the report, validate it with:

```bash
npm run verify:evidence-report -- <filled-evidence-report.md>
```

Use `Result: PASS` for every verification section only after the evidence is
complete. Use `Production readiness accepted: YES` and `Remaining risks: None`
only when the target deployment has no remaining launch blockers.
`Final Decision.Approver` must be a concrete release approver name, id, or alias,
not `yes`, `pass`, a placeholder, or dashboard URL.
`Final Decision.Follow-up tasks` must be filled and must not contain unresolved
launch blockers, unverified checks, failed checks, or remaining risks.
Do not fill required fields with `skipped`, `blocked`, `not tested`,
`unverified`, or `local only`; the report validator rejects those values.
In the readiness artifact section, `productionReady` and
`Redaction metadata present` must be `true` or `yes`.
Behavior fields must record successful live outcomes, not just any filled text:
OAuth sign-in/reload, station creation, public claim redemption/reopen/negative
checks, Polar checkout/plan-change/customer-portal, analytics/backfill reruns,
and test cleanup result fields must be `pass`, `yes`, or `true` as appropriate.
Public claim negative evidence must separately prove malformed-code, expired-link,
and inactive-campaign claim attempts fail closed; do not reuse one generic
negative check for all three.
Public claim privacy evidence must prove guest-facing claim APIs did not expose
internal draw session ids. R2 hero evidence must separately prove Campaign
Studio, public claim, and station guest surfaces rendered the uploaded asset.
`Campaign And Public Claim.Campaign id or slug` must be a concrete observed
campaign id or slug, not `yes`, `pass`, a placeholder, or dashboard URL.
Campaign status must be `active`, Convex billing state must be `active` or
`trialing`, and temporary billing/migration tokens plus legacy flags must be
removed or disabled before final acceptance. Cleanup token/flag evidence must
name the reviewed envs:
`LI_XI_OPS_ADMIN_TOKEN`, `LIXI_OPS_ADMIN_TOKEN`, `LI_XI_BILLING_ADMIN_TOKEN`,
`LIXI_BILLING_ADMIN_TOKEN`, `LI_XI_MIGRATION_TOKEN`, `LIXI_MIGRATION_TOKEN`,
`LI_XI_ENABLE_LEGACY_AUTH`, `LEGACY_AUTH_ENABLED`,
`LI_XI_ENABLE_LEGACY_OWNER_BRIDGE`, `LEGACY_OWNER_BRIDGE_ENABLED`,
`VITE_LI_XI_ENABLE_LEGACY_AUTH`, `VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE`,
`LI_XI_ENABLE_PAID_PLAN_FALLBACK`, and `LIXI_ENABLE_PAID_PLAN_FALLBACK`.
`Secrets rotated if exposed` must record reviewed exposure evidence and whether
rotation was performed or not needed; a bare `not needed` is insufficient.
Campaign copy evidence is different: `Start CTA rendered` and
`Collect CTA rendered` must record the exact observed button copy, not
`yes`/`pass`/`rendered`, and the two values must be distinct.
Analytics audit evidence must explicitly say the operator reviewed
`auditDecisions`. Cleanup evidence must explicitly say the operator reviewed the
maintenance decision arrays: `sessionDecisions`, `assetDecisions`,
`profileDecision`, `campaignDecisions`, `budgetDecisions`, and
`profileDecisions`.
Analytics `Owner id` and `Campaign id` must be concrete observed ids or aliases,
not `yes`, `pass`, placeholders, status names, or dashboard URLs.
`Analytics And Backfill.Campaign id` must match
`Campaign And Public Claim.Campaign id or slug` so the counter/backfill evidence
proves the same campaign that was exercised through the guest flow.
The validator also checks that the recorded commands include the standard local
gate, production readiness artifact generation with `--evidence-out`, and JSON
artifact validation commands.
Use concrete HTTPS public origins for `VITE_CONVEX_URL` and `VITE_SITE_URL` in
the command record, but keep `LI_XI_OPS_ADMIN_TOKEN` or `LIXI_OPS_ADMIN_TOKEN`
redacted or referenced from a shell variable.
`Deployment.Environment` must be `staging` or `production`; `Evidence date` must
be `YYYY-MM-DD`; `Verifier` and `Release/ref` must be concrete observed values,
not booleans, placeholders, or dashboard URLs.
`Deployment.App origin` and the command's `VITE_SITE_URL` must be public HTTPS
origins, not localhost, private/link-local/CGNAT hosts, `.local` hosts, or raw
IPv4/IPv6 addresses, and must not include custom or explicit default ports.
The command's `VITE_SITE_URL` must match `Deployment.App origin`, and
`VITE_CONVEX_URL` must match `Deployment.Convex cloud origin`.
`Deployment.Convex cloud origin` and `Deployment.Convex HTTP Actions origin`
must use the same Convex deployment label.
The Google callback URL must use `Deployment.Convex HTTP Actions origin` with
the exact `/api/auth/callback/google` path.
`Host profile row id` must be a concrete observed host profile row id or alias,
not `yes`, `pass`, a placeholder, or dashboard URL.
`Redirect target after sign-in` must be a root-relative host app route:
`/setup` or `/campaigns`. Do not record a full external URL,
scheme-relative URL, public claim URL, query string, or route with a hash fragment.
`Public claim code` must be the exact 24-character lowercase hex token minted by
the backend, not a share URL, label, or placeholder.
The Polar webhook URL must use `Deployment.Convex HTTP Actions origin` with the
exact `/polar/events` path.
The JSON artifact endpoint validator also rejects explicit default ports on
`endpoints.convexSiteOrigin`, `endpoints.googleCallbackUrl`, and
`endpoints.polarWebhookUrl`; record the canonical clean URLs from readiness
output.
The Polar checkout and customer portal return origins must match
`Deployment.App origin` and must be clean HTTPS public origins with no
credentials, localhost, private/link-local/CGNAT hosts, raw IPv4/IPv6
addresses, or custom or explicit default ports.
Polar customer id, subscription id, and product alias/id evidence must be the
concrete observed values, not `yes`, `pass`, placeholders, status names, or
provider dashboard URLs.
The `--evidence-out` path, `Artifact validation` path, and `Artifact location`
field must all refer to the same `li-xi-production-readiness*.json` artifact.
Cloudflare R2 evidence must prove a supported campaign image upload:
`Asset row id` must be the concrete Convex asset row id, not a boolean,
placeholder, or dashboard URL; `Content type` must be one of `image/jpeg`,
`image/png`, `image/webp`, `image/gif`, or `image/avif`; `Size` must be an
integer byte count from 1 byte through 8 MB; `R2 key` must be the relative
object key, not a signed URL, public URL, query string, hash, absolute path,
backslash path, or traversal path;
`Asset owner id` must match `Analytics And Backfill.Owner id`;
`Asset campaign id or slug` must match the tested
`Campaign And Public Claim.Campaign id or slug`;
bucket-match evidence must be true; `Metadata source` must be `r2`; `Lifecycle status` must be
`attached`; validation timestamp, Campaign Studio preview, and public/station
hero render checks must be true. `Negative checks` must be `pass`; use staging
evidence or local contract-test evidence for cases that are unsafe to exercise
directly against production.

## Deployment

- Environment:
- App origin:
- Convex cloud origin:
- Convex HTTP Actions origin:
- Evidence date:
- Verifier:
- Release/ref:

## Local Gate

- Command: `npm run verify:local`
- Result:
- Notes:

## Readiness Artifact

- Command:
  `VITE_CONVEX_URL=<convex-url> VITE_SITE_URL=<app-origin> LI_XI_OPS_ADMIN_TOKEN=<token> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json`
- Ops token shape checked: yes/no
- Billing admin token shape checked: yes/no
- Migration token shape checked: yes/no
- Artifact validation: `npm run verify:evidence -- /tmp/li-xi-production-readiness.json`
- Result:
- Artifact location:
- `productionReady`:
- Redaction metadata present:
- Notes:

## Google OAuth

- Google callback URL:
- Browser sign-in result:
- Redirect target after sign-in:
- Host profile row id:
- Legacy owner session absent or ignored:
- Reload/token-refresh check:
- Result:
- Notes:

## Campaign And Public Claim

- Campaign id or slug:
- Campaign status:
- Start CTA rendered:
- Collect CTA rendered:
- Station session created:
- Public claim code:
- Public claim hero rendered:
- Redeem result:
- Reopen same code closed:
- Malformed public code closed:
- Expired public code closed:
- Inactive campaign public claim closed:
- Guest API internal ids absent:
- Result:
- Notes:

## Cloudflare R2

- Asset row id:
- Asset owner id:
- Asset campaign id or slug:
- R2 key:
- Content type:
- Size:
- Bucket matches configured R2 bucket:
- Metadata source:
- Lifecycle status:
- Validation timestamp present:
- Campaign Studio preview rendered:
- Public claim hero rendered:
- Station hero rendered:
- Negative checks:
- Result:
- Notes:

## Polar

- Polar customer id:
- Polar subscription id:
- Product alias/id:
- Checkout result:
- Plan change result:
- Customer portal result:
- Checkout return origin:
- Checkout return URL:
- Customer portal return origin:
- Customer portal return URL:
- Polar webhook URL:
- Webhook receipt time:
- Convex billing state:
- Billing sync token removed:
- Result:
- Notes:

## Analytics And Backfill

- Owner id:
- Campaign id:
- New station session counter result:
- New public claim redemption counter result:
- Owner backfill dry-run:
- Owner backfill audit decisions:
- Owner backfill apply:
- Owner backfill rerun idempotent:
- Campaign backfill dry-run/apply/rerun:
- Campaign backfill rerun idempotent:
- Migration token removed:
- Result:
- Notes:

## Cleanup

- Temporary tokens removed: reviewed LI_XI_OPS_ADMIN_TOKEN, LIXI_OPS_ADMIN_TOKEN, LI_XI_BILLING_ADMIN_TOKEN, LIXI_BILLING_ADMIN_TOKEN, LI_XI_MIGRATION_TOKEN, and LIXI_MIGRATION_TOKEN are removed or absent
- Legacy flags disabled: reviewed LI_XI_ENABLE_LEGACY_AUTH, LEGACY_AUTH_ENABLED, LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LEGACY_OWNER_BRIDGE_ENABLED, VITE_LI_XI_ENABLE_LEGACY_AUTH, VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LI_XI_ENABLE_PAID_PLAN_FALLBACK, and LIXI_ENABLE_PAID_PLAN_FALLBACK are disabled or absent
- Maintenance dry-run audit decisions:
- Test public links cancelled:
- Test campaigns/assets cleaned up:
- Test Polar subscriptions cleaned up:
- Secrets rotated if exposed:
- Result:
- Notes:

## Final Decision

- Production readiness accepted:
- Remaining risks:
- Follow-up tasks:
- Approver:
