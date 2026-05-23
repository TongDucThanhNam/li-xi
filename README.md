# Li Xi Station

SaaS prize-draw platform cho branded lucky campaigns. Theme Tết/lì xì là
default campaign skin, nhưng host có thể cấu hình chiến dịch, upload asset,
tạo lượt rút tại trạm, phát public claim link, theo dõi billing/analytics, và
giữ trải nghiệm end-user premium.

Flow sản phẩm chính:

1. Host đăng nhập bằng Google OAuth.
2. Host tạo/cấu hình chiến dịch trong Campaign Studio.
3. Host cấu hình ngân sách giải thưởng theo chiến dịch.
4. Host tạo lượt rút trực tiếp hoặc public claim link cho người tham gia.
5. Người tham gia vào màn hình trạm hoặc link public `/claim/<publicCode>`.
6. Người tham gia chọn 1 trong 10 phong bao theo campaign skin.
7. Kết quả được lưu và hiển thị trong leaderboard/analytics theo host hoặc chiến dịch.

## Công nghệ

- TanStack Start + Vite + React 19
- Convex
- Convex Auth + Google OAuth foundation
- TypeScript

## Chạy local

```bash
# Terminal 1
npx convex dev

# Terminal 2
npm run dev
```

Frontend dùng `VITE_CONVEX_URL` và `VITE_SITE_URL` trong môi trường
Vite/TanStack Start. Runtime không đọc fallback `NEXT_PUBLIC_CONVEX_URL`;
production readiness yêu cầu `VITE_CONVEX_URL` rõ ràng và là HTTPS origin dạng
`https://<deployment>.convex.cloud`, còn `VITE_SITE_URL` là public HTTPS origin
của app, đều không kèm path/query/hash/port/credentials và không trỏ về
localhost/.localhost/.local/private/link-local/CGNAT host.

Truy cập:

- `http://localhost:3000/auth`
- `http://localhost:3000/campaigns`
- `http://localhost:3000/setup`
- `http://localhost:3000/draw`
- `http://localhost:3000/leaderboard`
- `http://localhost:3000/claim/<publicCode>`

## Verification

```bash
npm run verify:local
# after production env is configured
VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_SITE_URL=https://<app-domain> LI_XI_OPS_ADMIN_TOKEN=<random-secret> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json
npm run verify:evidence -- /tmp/li-xi-production-readiness.json
npm run verify:evidence-report -- <filled-evidence-report.md>
```

`npm run verify:local` runs `npx convex codegen`, `npm run typecheck`,
`npm run test:contracts`, `npm run lint`, `npm audit --omit=dev`,
`npm run test:smoke`, then removes `.output` and fails if the build output
remains.
`npm run verify:production -- --evidence-out <path>` writes an audit-safe JSON
artifact with public endpoints, readiness statuses, and missing check keys. It
omits the ops token, secret values, configured env names, accepted env-name
metadata, and verbose runtime details. The artifact includes `redaction.mode:
"audit-safe"` plus an `omittedFields` list so reviewers know which details were
intentionally excluded.
`npm run verify:evidence -- <path>` validates that artifact schema, redaction
metadata, readiness booleans, missing-check arrays, and public endpoint URLs are
consistent with a production-ready deployment.
`npm run verify:evidence-report -- <path>` validates the filled markdown
evidence report: every live verification section must be `Result: PASS`, final
readiness must be accepted, and remaining risks must be `None`.

Use [docs/production-verification-runbook.md](docs/production-verification-runbook.md)
to collect the live/staging evidence for Google OAuth, R2 uploads, Polar billing,
public claim links, analytics counters, and temporary-token shutdown before
calling the SaaS migration production-ready. Use
[docs/production-evidence-template.md](docs/production-evidence-template.md) to
record the live/staging results without mixing them into repo secrets, then run
`npm run verify:evidence-report -- <filled-evidence-report.md>` before treating
the release as production-ready.

`npm run test:contracts` checks SaaS invariants that should not regress: no
Next.js route/import surface, required TanStack Start files, Convex components,
Google OAuth wiring, public claim privacy, campaign-scoped participant checks,
owner-bridge identity boundaries, ops readiness wiring, and production readiness
self-tests for invalid `CONVEX_SITE_URL` shapes, frontend legacy flag shutdown,
exact Google OAuth callback and Polar webhook derivation from the Convex HTTP
Actions origin, frontend/backend Convex deployment mismatches, and backend runtime
failures such as an enabled billing sync admin token or private/link-local backend
`SITE_URL`.
The self-tests also assert that private or link-local frontend public origins
fail `frontendSiteUrlPublicOrigin`, and that host route access only passes with
Convex Auth browser tokens. R2 asset
policy regressions verify that only attached, R2-validated, owner-owned assets in
the configured bucket can mint render URLs. Billing policy regressions verify
Polar product allowlists, trusted `SITE_URL` return URLs, private-host rejection,
and locale normalization before checkout/portal actions call Polar. Public link
policy regressions verify the 7-day TTL, legacy link-mode inference, malformed
expiry fail-closed behavior, and open-session filtering. Analytics policy
regressions verify Sharded Counter event keys and idempotent owner/campaign
counter upgrade behavior. The contract gate also requires the live/staging
production verification runbook to remain linked from the repo docs and to keep
explicit evidence gates for OAuth, public claims, R2, Polar, analytics, and
temporary-token shutdown.

`npm run test:smoke` builds the TanStack Start app with deterministic public Vite
env, starts the production server on port `3100`, checks the core host flow routes (`/auth`, `/setup`,
`/draw`, `/campaigns`, `/claim/abcdefabcdefabcdefabcdef`, `/claim/not-a-code`, `/leaderboard`), verifies route-specific
loading shells plus `/auth` staying Google-first by default, then removes `.output`. Use
`SMOKE_BASE_URL=http://localhost:3000` to run the same checks against an already
running server.

## Migration / Backfill

Legacy owner records can be promoted into the SaaS model per host. Run dry-run
first; then run without `dryRun` after checking skipped counts and the bounded
`auditDecisions` sample for rows that need manual repair. When running from CLI
without an authenticated Convex Auth session, set and pass `LI_XI_MIGRATION_TOKEN`
or `LIXI_MIGRATION_TOKEN`:

```bash
npx convex env set LI_XI_MIGRATION_TOKEN <32+ char random secret>
npx convex run migrations:backfillOwnerSaaSModel '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:backfillOwnerSaaSModel '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

Expired public claim links fail closed at runtime and are no longer mutable
through the normal host cancel flow. To clean old pending link rows after the
expiry window, run the owner-scoped maintenance mutation:

```bash
npx convex run migrations:cleanupExpiredPublicLinks '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:cleanupExpiredPublicLinks '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

The cleanup scans oldest pending `link` rows and legacy pending rows with missing
`deliveryMode`, then only patches sessions that the shared public-link expiry
helper considers expired or malformed. Dry-run output includes redacted
session-level keep/cancel decisions with session id, delivery bucket, whether a
public code exists, campaign id, timestamps, resolved expiry, and reason, but not
the raw public claim code. Apply sets `status: "cancelled"` and `cancelledAt`
while preserving public code, snapshots, campaign, and guest audit fields.

If old data has a host profile default campaign that points to an archived,
missing, or foreign campaign, repair it with the owner-scoped maintenance
mutation:

```bash
npx convex run migrations:repairHostProfileDefaultCampaign '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:repairHostProfileDefaultCampaign '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

The repair picks the latest active campaign for that owner, then the latest draft
if no active campaign exists. Dry-run output includes a profile decision with the
profile id, previous default, replacement default, action, and reason
(`missing`, `foreign`, or `archived` default). If no visible campaign remains, it
clears `defaultCampaignId`.

If imported data has more than one `hostProfiles` row for an owner, public host
identity reads fail closed until the ambiguity is repaired:

```bash
npx convex run migrations:repairDuplicateHostProfiles '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:repairDuplicateHostProfiles '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

The dry-run response includes each profile decision with slug, default campaign,
onboarding state, and timestamps. The repair keeps the most recently updated
profile for that owner and deletes the extra rows only on apply.

Legacy/imported data may contain more than one active campaign for a host, while
new Campaign Studio saves enforce a single active campaign. Repair those rows
owner-by-owner before relying on active-campaign defaults:

```bash
npx convex run migrations:repairOwnerActiveCampaigns '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:repairOwnerActiveCampaigns '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

The repair keeps the active campaign already selected as the host default when it
is one of the active rows; otherwise it keeps the most recently updated active
campaign. Dry-run output includes campaign-level keep/demote decisions with
default-selection and timestamp metadata, plus a profile decision showing the
previous and next default campaign. Extra active rows are demoted to `draft`, and
an existing host profile is pointed at the kept active campaign.

If imported data has more than one `ownerBudgets` row for the same owner/campaign
scope, setup and payout fail closed until the ambiguity is repaired:

```bash
npx convex run migrations:repairDuplicateOwnerBudgets '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:repairDuplicateOwnerBudgets '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

The repair scans one owner through the `by_owner` budget index, groups budgets by
`campaignId` including the legacy missing-campaign scope, returns budget-level
keep/delete decisions with scope, totals, remaining budget, and timestamps for
dry-run audit, keeps the most recently updated row in each duplicate scope, and
deletes the extra rows.

Abandoned R2 upload reservations count toward the asset quota while they are
`reserved`. To reject old reservations that never completed browser upload, run:

```bash
npx convex run migrations:cleanupStaleReservedAssets '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run migrations:cleanupStaleReservedAssets '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
```

By default this scans the oldest `reserved` assets first, returns asset-level
keep/reject decisions with key, campaign, bucket, metadata, age, and rejection
reason for dry-run audit, and rejects reservations older than 24 hours. Pass
`olderThanMs` for a bounded maintenance window; it is clamped between 1 hour and
30 days. Rejected reservations no longer count against the upload quota.

`LIXI_MIGRATION_TOKEN` is accepted as a compatibility alias for migration
scripts, but migration access rejects short, placeholder, whitespace, or
angle-bracket token values, compares accepted values through the shared
timing-safe helper, and production readiness fails if either migration token env
remains configured after the backfill window.

The migration creates/updates host profile state, sets missing draw
`deliveryMode`, links unambiguous legacy sessions/redemptions/budgets/items to
the target campaign, fills missing host/campaign/claim-copy snapshots, and backfills
redemption aggregates idempotently. Existing campaign/session references are only
used when they belong to the owner being migrated; foreign references are reported
in skipped counters instead of being folded into campaign aggregates. Session rows
with foreign campaign references are also reported and are not used as snapshot
targets. Legacy link rows with malformed `createdAt` are reported as
`skippedInvalidPublicCodeExpiry` instead of crashing the migration; runtime keeps
those links fail-closed until the source data is repaired. The response includes
up to 50 `auditDecisions` samples for foreign campaign references, foreign
session references, and invalid public-code expiry rows so operators can identify
specific source records without returning an unbounded row list. Dry-run mode
reports scanned and patchable rows only; aggregate backfill counters increment
only when the mutation actually writes aggregate records.

Analytics backfills also support dry-run before writing Aggregate/Sharded Counter
state:

```bash
npx convex run analytics:backfillOwnerRedemptionAggregate '{ "ownerId": "<user-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run analytics:backfillOwnerRedemptionAggregate '{ "ownerId": "<user-id>", "migrationToken": "<random-secret>" }'
npx convex run analytics:backfillCampaignAnalytics '{ "ownerId": "<user-id>", "campaignId": "<campaign-id>", "dryRun": true, "migrationToken": "<random-secret>" }'
npx convex run analytics:backfillCampaignAnalytics '{ "ownerId": "<user-id>", "campaignId": "<campaign-id>", "migrationToken": "<random-secret>" }'
```

Dry-run scans owner/campaign rows and returns `...WouldBackfill` /
`redemptionsWouldPatchCampaign` estimates, but does not write Aggregate records,
Sharded Counter event markers, counter increments, or legacy redemption campaign
patches. `...CounterEventsWouldBackfill` estimates marker inserts/patches, while
`...CounterIncrementsWouldBackfill` estimates Sharded Counter increments.

## Convex Auth / OAuth

Google OAuth cần các biến môi trường Convex sau:

```bash
npx convex env set CONVEX_SITE_URL https://<deployment>.convex.site
npx convex env set SITE_URL https://<app-domain>
npx convex env set AUTH_GOOGLE_ID <google-client-id>
npx convex env set AUTH_GOOGLE_SECRET <google-client-secret>
npx convex env set JWT_PRIVATE_KEY "<pkcs8-private-key>"
npx convex env set JWKS '<public-jwks-json>'
```

Callback URL trong Google Cloud dùng Convex HTTP Actions URL:

```text
https://<deployment>.convex.site/api/auth/callback/google
```

`JWT_PRIVATE_KEY` và `JWKS` là cặp key do Convex Auth dùng để ký và expose JWT
qua `/.well-known/jwks.json`; sinh bằng `npx @convex-dev/auth` nếu chưa có.
Production readiness kiểm tra `AUTH_GOOGLE_ID` có dạng Google OAuth client id
`<client-id>.apps.googleusercontent.com`; `AUTH_GOOGLE_SECRET` phải là secret
thực, không phải placeholder, không quá ngắn và không chứa whitespace.
`ops:getSaaSReadiness` cũng trả `endpoints.googleCallbackUrl` để tránh cấu hình
sai callback theo deployment. Campaign Studio hiển thị cùng URL này trong panel
SaaS readiness khi host đăng nhập bằng Google OAuth.

Legacy username/PIN account auth and the legacy owner-bridge compatibility flag
are disabled by default. They can be temporarily enabled only during migration
and account-linking checks:

```bash
npx convex env set LI_XI_ENABLE_LEGACY_AUTH true
npx convex env set LI_XI_ENABLE_LEGACY_OWNER_BRIDGE true
```

Legacy account auth and the backend owner bridge are separate flags, and the
legacy login/register backend mutations require both backend migration flags.
The host UI no longer exposes the legacy username/PIN form, and frontend host
routes ignore and clear stale localStorage owner sessions instead of using them
as an auth bridge. Convex Auth browser sessions never write local owner
identity, the frontend no longer exports a local owner-session writer, host
screens omit client-supplied `ownerId`, and host-facing Convex APIs no longer
accept `ownerId` in their public validators. Backend APIs resolve ownership from
the live auth session; explicit owner IDs remain only on migration/backfill
maintenance commands.
Backend helpers distinguish the two boundaries: `requireResolvedOwner` no
longer exposes any legacy bridge opt-in for host APIs, while verified-owner
helpers require a live Convex Auth user and fail closed when unauthenticated.
Migration maintenance commands use their own authenticated-owner or migration-token
owner resolver, so CLI backfills do not require the legacy owner bridge env.

## Campaign Assets / Billing

Cloudflare R2 cho ảnh chiến dịch:

```bash
npx convex env set R2_TOKEN <token>
npx convex env set R2_ACCESS_KEY_ID <access-key>
npx convex env set R2_SECRET_ACCESS_KEY <secret>
npx convex env set R2_ENDPOINT https://<account-id>.r2.cloudflarestorage.com
npx convex env set R2_BUCKET <bucket>
```

`R2_ENDPOINT` phải là Cloudflare R2 HTTPS origin dạng
`https://<account-id>.r2.cloudflarestorage.com`, không kèm
path/query/hash/port/credentials.
`R2_BUCKET` phải dùng tên bucket an toàn 3-63 ký tự, chữ thường/số/dấu chấm/gạch
nối, và không được là IPv4 literal.
`R2_TOKEN`, `R2_ACCESS_KEY_ID` và `R2_SECRET_ACCESS_KEY` cũng phải giống
credential thật: không phải placeholder, không quá ngắn, không chứa whitespace
hoặc dấu `< >`.

Polar cho SaaS billing:

```bash
npx convex env set POLAR_ORGANIZATION_TOKEN <token>
npx convex env set POLAR_SERVER production
npx convex env set POLAR_WEBHOOK_SECRET <secret>
npx convex env set POLAR_PRO_PRODUCT_ID <polar-pro-product-id>
npx convex env set POLAR_BUSINESS_PRODUCT_ID <polar-business-product-id>
npx convex env set LI_XI_BILLING_ADMIN_TOKEN <32+ char random secret>
```

Sau khi cấu hình product IDs, đồng bộ product catalog về Convex:

```bash
npx convex run billing:syncPolarProducts '{ "adminToken": "<random-secret>" }'
```

Sau khi sync xong, gỡ `LI_XI_BILLING_ADMIN_TOKEN` / `LIXI_BILLING_ADMIN_TOKEN`
khỏi production env. Token sync phải là secret production-safe tối thiểu 32 ký
tự, không chứa whitespace và không phải placeholder. Production readiness fail
nếu token quản trị sync product còn cấu hình, vì `billing:syncPolarProducts` là
action export bằng shared secret, dùng timing-safe compare, và chỉ nên bật tạm
trong cửa sổ vận hành.

Webhook URL trong Polar dashboard dùng Convex HTTP Actions URL tại path explicit:

```text
https://<deployment>.convex.site/polar/events
```

`ops:getSaaSReadiness` trả cùng URL này ở `endpoints.polarWebhookUrl`; output
không chứa secret hoặc product ID, nhưng query này vẫn yêu cầu
`LI_XI_OPS_ADMIN_TOKEN`. Campaign Studio dùng query redacted
`ops:getHostSaaSReadiness` cho host Google OAuth, chỉ hiển thị summary và public
setup endpoints.
Backend truyền `POLAR_WEBHOOK_SECRET` explicit vào Convex Polar component để
webhook ở path này luôn đi qua xác thực chữ ký của Polar.
Production readiness cũng kiểm tra `POLAR_ORGANIZATION_TOKEN` và
`POLAR_WEBHOOK_SECRET` có hình dạng secret thật. Token sync billing phải được
gỡ sau khi sync product catalog; nếu `LI_XI_BILLING_ADMIN_TOKEN` hoặc
`LIXI_BILLING_ADMIN_TOKEN` còn cấu hình thì readiness fail.

Kiểm tra trạng thái cấu hình production mà không in secret:

```bash
npx convex env set LI_XI_OPS_ADMIN_TOKEN <32+ char random secret>
npx convex run ops:getSaaSReadiness '{ "adminToken": "<random-secret>" }'
VITE_CONVEX_URL=https://<deployment>.convex.cloud VITE_SITE_URL=https://<app-domain> LI_XI_OPS_ADMIN_TOKEN=<random-secret> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json
npm run verify:evidence -- /tmp/li-xi-production-readiness.json
npm run verify:evidence-report -- <filled-evidence-report.md>
```

`LI_XI_OPS_ADMIN_TOKEN` / `LIXI_OPS_ADMIN_TOKEN` phải là secret
production-safe tối thiểu 32 ký tự, không chứa whitespace và không phải
placeholder; backend và verifier đều từ chối token yếu dù token đó khớp env.
`--evidence-out` ghi artifact JSON audit-safe để lưu kèm runbook evidence:
public endpoints, trạng thái ready/missing và missing check keys; không ghi ops
token, giá trị secret, tên env đã cấu hình, metadata accepted env names hoặc
runtime detail dài. Artifact có `redaction.mode: "audit-safe"` và
`omittedFields` để người review biết các trường nhạy cảm bị bỏ có chủ đích.
`npm run verify:evidence -- <path>` kiểm tra artifact đó có schema, redaction
metadata, readiness booleans, missing-check arrays và public endpoint URLs hợp lệ
cho trạng thái production-ready.
`npm run verify:evidence-report -- <path>` kiểm tra report markdown đã điền:
mọi phần live evidence phải có `Result: PASS`, quyết định cuối phải accepted,
và remaining risks phải là `None`.

Kết quả `allRequiredConfigured: true` nghĩa là các biến bắt buộc cho Convex
Auth/Google OAuth, R2 và Polar đã có trong Convex env. `allRequiredReady: true`
yêu cầu thêm runtime checks, hiện gồm việc frontend có `VITE_CONVEX_URL` là
HTTPS origin `https://<deployment>.convex.cloud`, frontend có `VITE_SITE_URL`
là public HTTPS origin cho share links và Polar return URLs, `JWT_PRIVATE_KEY` /
`JWKS` có đúng hình dạng Convex Auth key material, Google OAuth credentials có
hình dạng production-safe, R2 credential/endpoint/bucket có hình dạng
production-safe, Polar organization/webhook credentials có hình dạng
production-safe, Polar Pro/Business product IDs là hai product riêng biệt, đã
được sync vào Convex Polar component, và Google callback/Polar webhook URL
derive được từ `CONVEX_SITE_URL`.
`CONVEX_SITE_URL` phải là Convex HTTP Actions origin dạng
`https://<deployment>.convex.site`, còn `SITE_URL` phải là HTTPS public app
origin trong production. Hai biến này không được kèm path, query, hash, port
hoặc credentials; `SITE_URL` cũng không được là localhost, private/link-local/
CGNAT IP, raw IPv4/IPv6 literal, IPv6 ULA/link-local hoặc IPv4-mapped private
address.
Endpoint Google callback và Polar webhook chỉ được derive khi `CONVEX_SITE_URL`
pass shape này. `verify:production` cũng so khớp frontend
`VITE_SITE_URL` với backend `SITE_URL`, để share links và Polar return URLs luôn
dùng cùng public origin, và so khớp deployment label giữa
`VITE_CONVEX_URL=https://<deployment>.convex.cloud` với
`CONVEX_SITE_URL=https://<deployment>.convex.site`.
Runtime checks cũng yêu cầu `POLAR_SERVER` là `production`, đồng thời tắt paid
fallback override, legacy username/PIN account auth và legacy owner bridge trong
production. `LI_XI_OPS_ADMIN_TOKEN` / `LIXI_OPS_ADMIN_TOKEN`,
`LI_XI_BILLING_ADMIN_TOKEN` / `LIXI_BILLING_ADMIN_TOKEN`, và
`LI_XI_MIGRATION_TOKEN` / `LIXI_MIGRATION_TOKEN` phải được gỡ khỏi production
sau khi verify, sync Polar products, hoặc backfill hoàn tất; các token này chỉ
dành cho cửa sổ vận hành ngắn.
Output admin chỉ trả tên biến, endpoint public, trạng thái configured/ready và
thông tin thiếu, không trả giá trị secret hoặc product ID. Host-facing output
trong Campaign Studio không trả tên env hoặc runtime detail đầy đủ; nó chỉ dùng
label cấu hình, trạng thái ready/missing và endpoint setup public.
Runbook [docs/production-verification-runbook.md](docs/production-verification-runbook.md)
ghi lại bằng chứng cần thu ở staging/production trước khi đóng checklist SaaS.

Campaign Studio dùng product catalog này qua query đã xác thực
`billing:getConfiguredProducts` để hiển thị nút nâng cấp Pro/Business, đổi gói
cho subscription Polar hiện tại, và mở customer portal. Nếu product chưa được
sync, nút nâng cấp sẽ bị vô hiệu hóa thay vì mở checkout sai cấu hình.
Backend chỉ export các Polar APIs mà app đang dùng; checkout và đổi gói đều
server-validate product ID theo `POLAR_PRO_PRODUCT_ID` / `POLAR_BUSINESS_PRODUCT_ID`
và yêu cầu product đó đã có trong catalog Polar đã sync vào Convex trước khi gọi
Polar, nên product khác hoặc product chưa sync trong cùng Polar organization
không thể được mua qua app API. Hai product ID này phải được cấu hình đủ, khác
nhau, và được sync ngay tại runtime của checkout/đổi gói, không chỉ ở readiness report. Đổi gói cũng resolve
billing identity từ Convex Auth, yêu cầu có subscription Polar hiện hữu ở trạng
thái `active`/`trialing`/`past_due`, và từ chối đổi sang chính product hiện tại
trước khi gọi Polar. Checkout backend từ chối tài khoản đã có subscription Polar
`active`/`trialing`/`past_due`, buộc họ đi qua đổi gói hoặc customer portal thay
vì tạo checkout subscription mới; Campaign Studio cũng route các trạng thái
subscription có thể đổi gói này qua `billing:changeCurrentSubscription` thay vì
mở checkout mới, kể cả khi entitlement đang fallback vì payment past due.
Customer portal backend cũng yêu cầu tìm thấy subscription Polar hiện hữu. Backend trim các
product ID từ Convex env trước khi dùng cho Polar client, product sync, checkout,
đổi gói và entitlement mapping. Checkout chỉ nhận `productIds`, `origin`, `successUrl` và
`locale` đã validate dạng ngắn như `vi` hoặc `en-US`; metadata, trial hoặc
subscription override không được nhận từ client. Billing redirect URL cũng bị reject nếu có
explicit default port như `:443`, không chỉ custom port.
Checkout `origin` phải là HTTPS public origin sạch, không phải localhost,
private/link-local/CGNAT IP, IPv6 ULA/link-local hoặc IPv4-mapped private address
và không kèm port; `successUrl` và customer portal `returnUrl` phải là
HTTPS public URL cùng origin với `SITE_URL` và không kèm port/credentials trước
khi được gửi sang Polar. Product sync yêu cầu `LI_XI_BILLING_ADMIN_TOKEN` /
`LIXI_BILLING_ADMIN_TOKEN` để tránh mở thao tác quản trị billing ra public API,
nhưng token này phải được gỡ khỏi production env sau khi sync xong.
Direct cancel không export thành Convex action riêng; host hủy subscription qua
customer portal của Polar.

Entitlement ưu tiên subscription active/trialing từ Polar, nhưng paid tier chỉ
được map khi `productId` trùng `POLAR_PRO_PRODUCT_ID` hoặc
`POLAR_BUSINESS_PRODUCT_ID`; backend không tin metadata hoặc tên product để cấp
quyền Pro/Business. Hai biến product ID này phải trỏ tới hai Polar product riêng;
nếu cấu hình trùng nhau, entitlement không grant paid tier cho match mơ hồ. Nếu
chưa có subscription hoặc chưa map được product, hệ thống dùng fallback tier
`Free`. Query plan-state host-facing yêu cầu Convex Auth và không mở qua legacy
owner bridge. Có thể đổi fallback tier cho môi trường dev/staging, nhưng paid fallback
chỉ có hiệu lực khi bật override rõ ràng và production readiness sẽ báo lỗi nếu
override này còn bật:

```bash
npx convex env set LI_XI_DEFAULT_PLAN pro
npx convex env set LI_XI_ENABLE_PAID_PLAN_FALLBACK true
```

## Quy tắc nghiệp vụ chính

- PIN luôn 6 chữ số.
- Google OAuth là account login mặc định; PIN host vẫn là lớp xác nhận thao tác tạo lượt rút.
- Auth API chỉ expose current user đang đăng nhập; không có public query tra profile bằng arbitrary user id.
- Host setup và cấu hình ngân sách yêu cầu Convex Auth, không mở qua legacy owner bridge. Host PIN có thể được thiết lập cùng lúc lưu ngân sách hoặc lưu riêng nếu ngân sách đã bị khóa bởi lịch sử rút.
- Legacy username/PIN account auth và legacy `ownerId` bridge mặc định bị tắt, chỉ dùng như migration/account-linking bridge khi bật env riêng; backend legacy login/register yêu cầu bật cả account-auth flag và owner-bridge flag. Host UI không còn hiển thị form legacy.
- Production readiness fail nếu legacy username/PIN account auth hoặc legacy `ownerId` bridge còn bật; trạng thái production-ready yêu cầu owner identity đến từ Convex Auth.
- Production readiness fail nếu `LI_XI_MIGRATION_TOKEN` hoặc `LIXI_MIGRATION_TOKEN` còn cấu hình; migration token chỉ bật tạm khi chạy backfill rồi phải gỡ.
- Backend ưu tiên owner từ Convex Auth; các API host-facing không nhận `ownerId` từ client, còn migration maintenance dùng authenticated owner hoặc migration token thay vì unauthenticated `ownerId` bridge.
- Frontend localStorage bridge chỉ còn là cache legacy cũ để dọn dẹp; Google OAuth identity lấy từ Convex Auth live state, stale legacy cache bị xóa/ignored, và OAuth completion materialize host profile trước khi điều hướng host chưa setup vào `/setup`, host đã setup vào Campaign Studio `/campaigns`.
- Campaign Studio là bề mặt điều phối host sau setup: các default redirect đưa host về đây, setup navigation quay về đây, và header Campaign Studio có CTA `Trạm rút` để host chủ động mở `/draw` sau khi cấu hình campaign.
- Các route host-only (`/`, `/setup`, `/draw`, `/campaigns`, `/leaderboard`) có TanStack `beforeLoad` guard để chặn truy cập browser khi không có Convex Auth token. Trên SSR guard chỉ defer vì Convex Auth token nằm ở browser storage; component phải skip Convex query cho đến khi `useOwnerSession` xác thực live xong và vẫn redirect về `/auth` nếu không có owner hợp lệ.
- Host profile lưu display name, slug public global-unique, onboarding state và default campaign tách khỏi bảng user auth; API đọc/ghi host profile yêu cầu Convex Auth và không mở qua legacy owner bridge, còn repair dữ liệu legacy nằm trong migration commands. Automatic slug kể cả fallback theo owner id đều phải kiểm tra `by_slug`, còn explicit slug save sẽ báo lỗi nếu slug không hợp lệ hoặc đã thuộc host khác.
- Host profile lookup fail-closed nếu một owner có nhiều profile row; sửa bằng `migrations:repairDuplicateHostProfiles` trước khi cho host tiếp tục vận hành.
- Default campaign trong host profile chỉ được trỏ tới campaign active/draft thuộc owner; campaign đã archive không thể được lưu làm default. Dữ liệu cũ có default campaign archived/missing/foreign có thể sửa bằng `migrations:repairHostProfileDefaultCampaign`.
- Campaign slug là unique trong từng host; campaign mặc định cũng dùng helper tạo slug unique thay vì reuse slug cố định, và mọi fallback theo owner id đều phải kiểm tra `by_owner_slug` trước khi trả về.
- Plan limit ưu tiên Polar subscription có product ID đã cấu hình, sau đó mới fallback theo `LI_XI_DEFAULT_PLAN`; `billingConfigured` trong plan state chỉ true khi có Polar organization token và Pro/Business product IDs đầy đủ, khác nhau.
- Fallback Pro/Business chỉ có hiệu lực khi `LI_XI_ENABLE_PAID_PLAN_FALLBACK=true`; production readiness fail nếu override dev/staging này còn bật, để paid tier production luôn đến từ Polar.
- Chỉ lượt `Share link` mới mint `publicCode`; link public dùng token hex 24 ký tự sinh từ 12 byte random, được kiểm tra lại sau khi insert để không trả về link mới nếu token làm public claim trở nên mơ hồ, chỉ resolve pending rows qua index `publicCode + status` và chỉ hợp lệ khi có đúng một lượt link pending, dùng một lượt và hết hiệu lực sau khi redeem/cancel.
- Link public mới có hạn 7 ngày; sau hạn, guest claim không resolve, quota open-session và khóa ngân sách không tính link đó nữa. Open-session quota đọc các bucket pending theo `ownerId + status + deliveryMode` trước khi lọc expiry, thay vì scan toàn bộ pending session của host. Expiry timestamp không hợp lệ hoặc vượt quá TTL 7 ngày từ `createdAt` hợp lệ đều fail-closed thay vì giữ link mở; host cũng không thể hủy các link đã hết hạn/hỏng expiry như một lượt pending hợp lệ. `migrations:cleanupExpiredPublicLinks` là maintenance path có `dryRun` để chuyển các pending public link đã hết hạn/hỏng expiry sang `cancelled` mà vẫn giữ audit fields; cron `cleanup expired public claim links` chạy hourly qua index global `status + deliveryMode + createdAt` để cleanup không chỉ phụ thuộc thao tác thủ công. Các row legacy có `publicCode` nhưng chưa có `deliveryMode` được xử lý như link-mode, và migration backfill gán expiry dựa trên `createdAt` hợp lệ hoặc báo `skippedInvalidPublicCodeExpiry` nếu timestamp hỏng.
- Nút mở link share trên host mở route public `/claim/<publicCode>`; link-mode không đi qua màn hình rút trực tiếp tại trạm.
- Link share và Polar checkout/customer portal return URL trên frontend được dựng từ `VITE_SITE_URL` khi có cấu hình, fallback về browser origin chỉ phục vụ local dev/smoke.
- Host draw screen đọc pending station/link qua bucket `ownerId + status + deliveryMode`, rồi hiển thị các link public đang chờ cùng thời điểm hết hạn để copy, mở lại hoặc hủy sau khi refresh.
- Redeem bằng link chỉ dùng `publicCode` và chỉ trả kết quả trúng thưởng, không lộ internal session id hoặc ngân sách còn lại; redeem/cancel lượt trực tiếp phải đi qua Convex Auth owner session.
- Public claim API chỉ trả copy/theme/media công khai và các loại giải cho animation, không trả internal session/campaign id.
- Public claim read trả trạng thái đóng nếu scoped budget bị thiếu, đã hết tiền, hoặc không còn prize unit khả dụng và payable theo ngân sách còn lại, để guest không vào animation cho link không thể chi trả.
- Public claim chỉ dùng campaign fallback khi campaign đó thuộc đúng owner của session; legacy/malformed reference không được lộ campaign của host khác.
- Campaign Studio cho phép chỉnh claim headline, subtitle, CTA, thông điệp chờ và snapshot copy đó vào session/redemption.
- Chỉ campaign `active` mới được tạo lượt rút trực tiếp hoặc link share; campaign `draft` có thể cấu hình trước trong Studio nhưng chưa được phát thưởng.
- Campaign workspace query fail-closed nếu client truyền `selectedCampaignId` không thuộc active/draft campaigns của owner, thay vì fallback sang active campaign và recent assets khác.
- Active campaign resolver ưu tiên `defaultCampaignId` trong host profile khi campaign đó còn active thuộc owner; nếu không, backend chọn active campaign mới cập nhật gần nhất, để dữ liệu legacy có nhiều active không phụ thuộc vào thứ tự index.
- Nếu host đã có draft campaign nhưng chưa có campaign `active`, backend yêu cầu kích hoạt campaign thay vì tự tạo thêm campaign mặc định mới.
- Không thể archive, chuyển về draft, hoặc thay bằng campaign active khác khi campaign hiện tại còn lượt rút station hoặc public link đang chờ; host phải redeem hoặc hủy các lượt pending trước. Các kiểm tra pending theo campaign dùng index `campaignId + ownerId + status + deliveryMode` trước khi xét expiry/open-state.
- Hero asset upload chỉ nhận JPG, PNG, WebP, GIF hoặc AVIF tối đa 8 MB; backend yêu cầu khai báo campaign + metadata và tạo row `reserved` trước khi mint signed upload URL. Upload URL fail-closed nếu thiếu `R2_BUCKET`, row reservation lưu bucket đã cấu hình, R2 upload callback từ chối bucket không khớp, metadata sync/attach cũng yêu cầu bucket của asset khớp cấu hình hiện tại. R2 upload callback chỉ chấp nhận asset ở lifecycle `reserved` hoặc `uploaded`, và reject duplicate owner/key rows như dữ liệu mơ hồ; metadata sync chỉ chấp nhận `reserved`, `uploaded` hoặc `attached`; attach chỉ chuyển tiếp asset `reserved` hoặc `uploaded` có `campaignId` khớp đúng campaign đã khai báo, giữ idempotent cho asset `attached` hợp lệ cùng campaign, và không hồi sinh asset `rejected` hoặc row legacy thiếu/hỏng lifecycle. Lưu campaign cũng chỉ chấp nhận hero asset renderable thuộc chính campaign đó; ảnh gần đây trong Campaign Studio chỉ cho chọn ảnh của campaign đang chỉnh. Asset quota chỉ tính `reserved`, `uploaded`, `attached` qua index `ownerId + status`; upload bị `rejected` hoặc row legacy hỏng lifecycle không khóa quota ảnh vĩnh viễn. Nếu R2 chưa trả metadata ngay sau upload, Campaign Studio giữ key đã upload để host thử gắn lại mà không phải chọn file lại.
- `migrations:cleanupStaleReservedAssets` có thể dry-run rồi reject các reservation upload R2 cũ còn `reserved`, để upload bị bỏ dở không giữ quota asset vĩnh viễn. Cron `cleanup stale campaign asset reservations` chạy hourly qua index global `status + createdAt` để cleanup reservation cũ không chỉ phụ thuộc thao tác thủ công. Các asset bị backend reject do duplicate key, sai bucket, metadata không hợp lệ, attach validation fail, hoặc reservation quá hạn đều được stamp `r2ObjectDeleteScheduledAt` / `r2ObjectDeleteReason` và schedule xóa object khỏi R2.
- Signed URL đọc asset yêu cầu Convex Auth owner session, campaign id thuộc owner, key có đúng một asset thuộc owner qua index `key + ownerId`, và asset đó phải thuộc đúng campaign được yêu cầu; internal helper mint URL cũng bắt buộc nhận campaign id và tự xác minh campaign thuộc owner, nên Campaign Studio/public claim/station hero không có đường render owner-wide hoặc foreign-campaign. Public query `assets:getAssetUrl` chỉ là wrapper owner/campaign quanh helper đó, nên backend chỉ có một callsite mint R2 signed URL trong `convex/assets.ts`. R2 upload callback và metadata sync cũng chỉ mutate rows thuộc owner hiện tại; cả hai callback reject toàn bộ row trùng key trong cùng owner và gỡ hero đang trỏ vào các row đó thay vì promote dữ liệu legacy mơ hồ. Public claim, station hero và danh sách ảnh gần đây trong Campaign Studio chỉ nhận URL từ asset renderable thuộc đúng owner và đúng campaign context. Campaign Studio recent assets được đọc theo `campaignId + ownerId + status + createdAt`, không lấy owner-wide asset history rồi lọc ở client. Asset renderable phải có `status: "attached"`, bucket khớp `R2_BUCKET`, metadata R2 đã sync, `validatedAt`, content type đúng policy và size hợp lệ; asset `rejected`, raw `uploaded`, bucket lệch cấu hình, hoặc row legacy thiếu validation không mint signed URL.
- Lượt trực tiếp tại trạm chỉ có 1 pending session; link share là pending session riêng và có thể mở nhiều lượt theo giới hạn plan.
- Tổng lượt station/link đang chờ trong một campaign không được vượt quá số prize units còn lại mà ngân sách hiện tại có thể chi trả theo cộng dồn; public claim preview, reward pool của station pending session, và redeem đều dùng cùng bộ lọc giữ đủ capacity cho các lượt pending khác. Link hết hạn, lượt đã hủy, hoặc đã redeem không còn giữ chỗ.
- Public claim chỉ thấy các loại giải còn khả dụng và còn chi trả được theo ngân sách hiện tại cho animation, không thấy số lượng tồn kho chính xác.
- Draw session và redemption snapshot host/campaign context để lịch sử trao thưởng không phụ thuộc vào campaign bị chỉnh sửa sau đó.
- Public claim và màn hình guest của lượt rút trực tiếp coi snapshot campaign của session là nguồn dữ liệu authoritative; nếu lúc tạo session chưa có claim copy/hero thì không fallback sang copy/hero mới được thêm vào campaign sau đó. Mutable campaign fallback chỉ còn dành cho legacy session chưa có snapshot.
- Màn hình guest của lượt rút trực tiếp cũng dùng reward pool capacity-preserving theo chính pending session, không đọc nhầm campaign active mới nếu host đổi chiến dịch trước khi khách bốc.
- Mỗi tên người rút chỉ được nhận 1 lượt rút thành công trong cùng chiến dịch; cùng một host có thể chạy chiến dịch khác cho cùng người tham gia.
- Participant uniqueness cho redemption và pending session dùng index `campaignId + ownerId + guestNameNormalized`, nên dữ liệu import hỏng từ owner khác không ảnh hưởng duplicate check.
- Ngân sách dựa trên tồn kho số lượng tờ (`amount x quantity`), mỗi lượt rút trừ đúng 1 tờ bằng random integer từ Web Crypto trên backend.
- Ngân sách mới được gắn theo campaign đang active; setup là host operation dùng Convex Auth và sẽ kích hoạt campaign draft hiện có trước khi dùng làm budget scope. Khi session có `campaignId`, backend bắt buộc dùng budget/items của campaign đó; dữ liệu owner-wide cũ chỉ còn là fallback migration cho row legacy không có `campaignId`. Legacy budget và budget-item fallback cũng đọc qua index `ownerId + campaignId(undefined)` thay vì scan toàn bộ dữ liệu của host rồi lọc trong app.
- Budget lookup dùng helper scope chung theo `ownerId + campaignId` và fail-closed nếu có nhiều budget row cùng scope, để setup/redeem không chọn ngẫu nhiên ngân sách từ dữ liệu import lỗi.
- Các lock cấu hình budget legacy owner-wide cũng đọc pending session qua bucket `ownerId + status + deliveryMode` trước khi lọc expiry, thay vì scan toàn bộ pending session của host.
- Các lượt đọc tồn kho theo campaign dùng index `campaignId + ownerId` trước khi xét active/amount, kể cả setup, station state, redeem và public claim preview.
- Sau khi có lượt rút hoặc lượt pending trong campaign, cấu hình và đồng bộ ngân sách bị khóa để giữ toàn vẹn dữ liệu lịch sử; kiểm tra redemption history dùng index `campaignId + ownerId`, còn pending sessions của campaign dùng bucket `campaignId + ownerId + status + deliveryMode` trước khi quyết định khóa.
- Entitlements hiện được enforce ở campaign count, asset upload, tổng số mệnh giá ngân sách trên toàn tài khoản,
  lượt rút đang mở, và tổng redemption volume; redemption usage đọc từ Convex Aggregate thay vì collect toàn bộ lịch sử trao thưởng.
- Campaign analytics dùng Aggregate cho redemption count/amount và Sharded Counter cho
  session/redemption events. Analytics reporting queries yêu cầu Convex Auth và không mở qua legacy owner bridge. Counter events được đánh dấu trong `analyticsCounterEvents`
  theo session/redemption key để live writes và backfill không cộng trùng; nếu một owner backfill
  gặp row có `campaignId` trỏ tới campaign không thuộc owner thì chỉ sửa owner aggregate/counter,
  không ghi campaign counter hoặc campaign Aggregate cho campaign lạ. Nếu một owner backfill
  đã ghi event cho legacy redemption khi chưa có `campaignId`, campaign backfill có thể nâng cấp
  marker đó sang campaign scope đúng một lần và chỉ cộng thêm campaign counter. Owner backfill sửa cả
  owner Aggregate/counter và Aggregate/counter của campaign thuộc owner; campaign backfill sửa campaign
  Aggregate totals và campaign Sharded Counter events bằng campaign+owner indexes cho row đã scoped, chỉ scan owner history để vá legacy redemption chưa có `campaignId`. Route `/leaderboard` có bộ lọc tất cả/từng campaign và dùng cả view theo owner
  lẫn view theo campaign đã kiểm tra ownership; các API leaderboard/history yêu cầu Convex Auth và không mở qua legacy owner bridge; campaign reads dùng index `campaignId + ownerId`
  trước khi áp dụng giới hạn kết quả để row import hỏng không làm thiếu bảng xếp hạng. Analytics backfill là write operation nên chỉ chạy
  bằng authenticated owner hoặc `LI_XI_MIGRATION_TOKEN` / `LIXI_MIGRATION_TOKEN` kèm `ownerId`; không dựa vào legacy owner bridge.
