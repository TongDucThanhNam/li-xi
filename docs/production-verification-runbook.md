# Production Verification Runbook

This runbook collects the live or staging evidence required before Li Xi
Station can be called production-ready as a SaaS prize-draw platform. Local
tests prove contracts and wiring. They do not prove Google OAuth, Cloudflare R2,
Polar, deployed Convex env, or browser-hosted claim flows.

Use [production-evidence-template.md](production-evidence-template.md) to record
the result of each live/staging check in a consistent audit shape.
After filling the report, run
`npm run verify:evidence-report -- <filled-evidence-report.md>` so incomplete
sections, non-`PASS` results, unresolved risks, or a missing final approval fail
before the release is marked ready.

Do not record secrets in notes, screenshots, tickets, or commits. Record only
redacted env status, row ids needed for audit, public claim codes used for test
flows, and external provider ids such as Polar subscription ids.
If an artifact is written inside the repo by mistake, `.gitignore` excludes
`li-xi-production-readiness*.json` and `production-evidence/`; still move final
evidence into the operational release record instead of committing it.

## Prerequisites

- A deployed Convex backend and deployed TanStack Start frontend.
- `SITE_URL` set to the deployed HTTPS app origin.
- `CONVEX_SITE_URL` set to `https://<deployment>.convex.site`.
- Frontend `VITE_CONVEX_URL` set to `https://<deployment>.convex.cloud`.
- Frontend `VITE_SITE_URL` set to the same HTTPS app origin as `SITE_URL`.
- Google OAuth configured with callback
  `https://<deployment>.convex.site/api/auth/callback/google`.
- Cloudflare R2 endpoint, bucket, token, access key, and secret configured.
- Polar organization token, webhook secret, production server, and distinct
  Pro/Business product ids configured.
- Polar webhook configured at
  `https://<deployment>.convex.site/polar/events`.
- `LI_XI_OPS_ADMIN_TOKEN` configured for readiness checks as a 32+ character
  production-safe random secret, not a placeholder. `LIXI_OPS_ADMIN_TOKEN` is
  accepted as a compatibility alias.
- `LI_XI_BILLING_ADMIN_TOKEN` configured only during product sync, as a 32+
  character production-safe random secret. `LIXI_BILLING_ADMIN_TOKEN` is
  accepted as a compatibility alias.
- `LI_XI_MIGRATION_TOKEN` configured only during migration or backfill windows,
  as a 32+ character production-safe random secret. `LIXI_MIGRATION_TOKEN` is
  accepted as a compatibility alias.

## 1. Local Gate

Run the local gate from a clean enough worktree to identify the intended diff:

```bash
npm run verify:local
```

Evidence to keep:

- Command output summary with pass/fail status.
- Any intentional lint, audit, or smoke-test exception.
- Confirmation that `.output` was removed after the smoke test. The local
  verifier fails if `.output` still exists.

## 2. Backend Readiness

Run the Convex readiness query and the production verifier against the deployed
origins:

```bash
npx convex run ops:getSaaSReadiness '{ "adminToken": "<ops-token>" }'
VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_SITE_URL=https://<app-domain> LI_XI_OPS_ADMIN_TOKEN=<ops-token> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json
npm run verify:evidence -- /tmp/li-xi-production-readiness.json
```

Evidence to keep:

- Redacted JSON artifact from `--evidence-out`.
- `allRequiredConfigured: true`.
- `allRequiredReady: true`.
- Derived Google OAuth callback and Polar webhook URLs.
- Frontend and backend origins match the deployed app and Convex deployment.
- Billing sync token is absent after product sync.
- Migration token is absent after migration/backfill windows.
- Legacy auth and legacy owner bridge flags are disabled.
- `POLAR_SERVER=production`.
- Ops token is redacted in captured evidence, whether using `LI_XI_OPS_ADMIN_TOKEN`
  or `LIXI_OPS_ADMIN_TOKEN`, and is not a weak placeholder or short shared secret.
- Billing admin token and migration token shape/shutdown checks are present in
  the readiness artifact and marked checked in the evidence report.

The JSON artifact proves machine-readable env/runtime readiness only. The filled
markdown evidence report and `verify:evidence-report` prove that browser and
provider workflows were actually checked.

The evidence artifact is audit-safe by design: it keeps public endpoints,
readiness booleans, runtime check statuses, and missing check keys, but omits the
ops token, secret values, configured env names, accepted env-name metadata, and
verbose runtime details. It also includes `redaction.mode: "audit-safe"` and an
`omittedFields` list so reviewers can distinguish intentional redaction from
missing verifier output.
The `verify:evidence` command validates that this artifact is production-ready:
schema matches, redaction metadata is present, public endpoints are HTTPS URLs,
the Convex HTTP Actions origin is a clean `https://<deployment>.convex.site`
origin, the public app origin is not local/private and not a raw IPv4/IPv6
literal, public endpoints do not
embed credentials, Google OAuth and Polar webhook paths match that Convex
origin, the artifact came from the admin-token readiness path, timestamps have
the expected machine-readable shapes, all readiness booleans are true, and
missing-check arrays are empty. It also requires the backend artifact to retain
the expected runtime readiness groups for OAuth/core endpoints, Cloudflare R2,
Polar billing, and operations safety, so provider checks cannot be dropped or
misfiled while the summary booleans still look ready.

## 3. Google OAuth Host Flow

Verify in a browser against the deployed frontend:

- Open `/auth` and sign in with Google.
- Confirm redirect to setup or Campaign Studio according to account state.
  Record the final redirect target as a root-relative route only: `/setup` or
  `/campaigns`. A full external URL, public claim URL, draw route, or hash
  fragment is not acceptable evidence.
- Confirm the host profile is materialized for the Convex Auth user.
- Confirm no legacy local owner session is needed for host routes.
- Reload `/setup`, `/draw`, `/campaigns`, and `/leaderboard`.
- Return after an OAuth token refresh window, or force a fresh browser session,
  and confirm host routes still resolve through Convex Auth.

Evidence to keep:

- Redacted browser notes or screenshots.
- Convex user id and host profile row id.
- Confirmation that legacy localStorage owner state was absent or ignored.
- Any redirect, callback, or token refresh failure.

## 4. Campaign And Public Claim Flow

Verify the core draw lifecycle:

- Create or activate a campaign in Campaign Studio.
- Set public claim headline, subtitle, CTA, and collect copy.
- Configure budget and host PIN if the host needs setup.
- Create a station draw session with guest name plus host PIN.
- Create a public claim link with guest name plus host PIN.
- Open `/claim/<publicCode>` in a clean browser session.
- Confirm the premium campaign hero renders before envelope selection.
- Confirm the hero start CTA and the result modal collect CTA render as two
  independent campaign copy values.
- Redeem the public claim once.
- Reopen the same public code and confirm it is no longer open.
- Open a malformed public code that is not 24-character hex and confirm it fails
  closed.
- Verify an expired public-code row fails closed when safe test data exists.
- Verify a public claim link for an inactive campaign fails closed in staging,
  or cite local contract-test evidence if exercising it against production would
  mutate a real campaign.

Evidence to keep:

- Campaign id or slug used for the test.
- Exact start CTA and collect CTA text observed in the browser.
- Public claim code used for the test.
- Confirmation that guest-facing APIs did not expose internal draw session ids.
- Redemption result, replay closed state, malformed-code closed state, expired
  code closed state, and inactive-campaign closed state.

## 5. Cloudflare R2 Campaign Assets

Verify browser upload and render behavior:

- Upload a supported hero image from Campaign Studio.
- Attach it to the selected campaign.
- Confirm the asset row reaches `attached` and records the configured bucket,
  content type, positive size, and validation timestamp.
- Confirm Campaign Studio preview renders through a signed URL.
- Confirm the public claim and station hero render the uploaded asset.
- Exercise unsupported type and too-large file checks in staging or production
  only when safe. Exercise wrong-bucket or stale-reservation checks in staging,
  or cite the local contract-test artifact when those cases are unsafe against
  production.

Evidence to keep:

- Campaign asset row id and R2 key.
- Content type and size.
- Configured bucket match and `metadataSource: r2`.
- Signed URL response status, without storing the full long-lived URL if one is
  ever introduced.
- Staging evidence or local contract-test evidence for negative cases that are
  unsafe to exercise directly against production.

## 6. Polar Billing Flow

Verify billing after product sync:

- Temporarily set `LI_XI_BILLING_ADMIN_TOKEN` or `LIXI_BILLING_ADMIN_TOKEN`.
- Run `billing:syncPolarProducts` for the configured Polar server.
- Remove `LI_XI_BILLING_ADMIN_TOKEN` / `LIXI_BILLING_ADMIN_TOKEN`.
- Re-run readiness and confirm billing sync token shutdown passes.
- As a new/free host, start checkout for a configured product.
- Complete checkout in the selected Polar environment.
- Record the checkout return origin and full return URL; confirm the origin
  matches the deployed app origin and the URL returns to `/campaigns`.
- Confirm the subscription state appears in Convex and Campaign Studio.
- From an active, trialing, or past-due subscription, change plan.
- Open the customer portal and return to the app.
- Record the customer portal return origin and full return URL; confirm the
  origin matches the deployed app origin and the URL returns to `/campaigns`.
- Confirm the `/polar/events` webhook updates billing state.

Evidence to keep:

- Polar customer id and subscription id.
- Product id or alias selected.
- Checkout return origin/URL and customer portal return origin/URL.
- Convex plan source and subscription status.
- Webhook receipt time and resulting app state.
- Any checkout, portal, webhook signature, or plan-change failure.

## 7. Analytics And Backfill

Verify live counter behavior:

- Create a station session and a public claim redemption.
- Confirm owner analytics session and redemption counters update.
- Confirm campaign analytics session and redemption counters update.
- In staging or for a selected migrated owner, run owner analytics backfill
  dry-run, then apply.
- Review owner SaaS migration/backfill skipped counts and the bounded
  `auditDecisions` sample for foreign campaign references, foreign session
  references, and invalid public-code expiry rows before applying migration
  writes.
- Run the same backfill again and confirm idempotent output.
- Repeat for campaign analytics backfill when campaign history exists.
- Re-run campaign analytics backfill and confirm no campaign counter or Aggregate
  double-count.
- Remove `LI_XI_MIGRATION_TOKEN` / `LIXI_MIGRATION_TOKEN` after the backfill
  window.

Evidence to keep:

- Owner id and campaign id tested.
- Dry-run and apply summaries.
- Owner backfill audit decision summary, including whether `auditDecisions` was
  empty or which sampled source rows required manual repair.
- Owner and campaign rerun summaries showing no double-count.
- Readiness result proving migration token shutdown.

## Cleanup And Rollback

- Remove temporary billing sync and migration tokens.
- Disable all legacy auth and owner bridge flags.
- Run cleanup/repair maintenance mutations in `dryRun` first and review their
  audit decision arrays before apply: public-link `sessionDecisions`, stale asset
  `assetDecisions`, active/default campaign `profileDecision` or
  `campaignDecisions`, duplicate budget `budgetDecisions`, and duplicate profile
  `profileDecisions`.
- Archive or delete test campaigns/assets only through supported app or
  migration paths.
- Cancel pending public links created for testing.
- Clean up test Polar subscriptions in the Polar dashboard.
- Rotate any token that appeared in logs or screenshots.

## Completion Criteria

The production readiness goal is complete only when every section above has
fresh evidence for the target deployment and the filled report passes:

```bash
npm run verify:evidence-report -- <filled-evidence-report.md>
```

If any section is skipped, blocked, verified only locally, or cannot be marked
`Result: PASS`, the remaining production risk must stay open.
