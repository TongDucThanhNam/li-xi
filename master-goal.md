# master-goal.md

> File này được tạo tự động bởi create-goal skill.
> Agent thực thi: đọc toàn bộ file này trước khi làm bất kỳ thứ gì.

---

## Objective

Migrate codebase từ current li xi/draw-specific implementation sang marketing game campaign platform, trong đó li xi envelope draw là game template đầu tiên, campaign có thể chọn/configure game template, public participant flow dùng play-first language, dashboard/reporting có campaign + game metrics, và các route `/draw` / `/claim/<publicCode>` vẫn hoạt động như compatibility surfaces.

---

## Context

- **Lý do**: Product direction đã đổi. Ứng dụng không phải "SaaS prize-draw" hoặc chỉ rút lì xì; nó là platform cho brand/agency/campaign operator chạy game tri ân khách hàng như lì xì, vòng quay may mắn, rút thăm, scratch card, quiz, slot-style reveal, memory match.
- **Ưu tiên**: correctness > speed.
- **Người thực hiện**: AI Agent (không có human review từng bước).
- **Ngày tạo**: 2026-06-20.
- **Current known baseline**: `node scripts/verify-saas-contracts.mjs` hiện fail ở vài contract runtime/baseline cũ. Agent phải xử lý hoặc chứng minh false-positive trước khi claim complete.

---

## Current State

| Item | Giá trị |
|------|---------|
| Framework / Runtime | TanStack Start + Vite + Nitro |
| Language | TypeScript, React 19 |
| Package manager | npm; `bun.lock` cũng tồn tại nhưng `package.json` scripts dùng npm |
| Dependencies chính | Convex, Convex Auth, Convex Aggregate/Sharded Counter/R2/Polar components, HeroUI Pro/OSS, TanStack Router/Start, Tailwind v4, Vitest |
| Routes | 7 route files: `/`, `/auth`, `/setup`, `/campaigns`, `/draw`, `/claim/$publicCode`, `/leaderboard` |
| Entry point | `app/__root.tsx`, `router.tsx`, `routeTree.gen.ts` |
| Config files | `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `convex/convex.config.ts` |
| Source scale | [ước lượng] 42 files under `app`, 35 under `convex`, 16 under `lib`, 22 under `scripts` |
| Test setup | Vitest + many Node contract scripts + route smoke script |
| Installed dependencies | `node_modules` absent in current workspace; install may be required before npm scripts beyond plain Node scripts |

### Current Domain Shape

- `convex/schema.ts` has `campaigns`, `campaignAssets`, `ownerBudgets`, `budgetItems`, `drawSessions`, `redemptions`, and `analyticsCounterEvents`.
- No generic `gameTemplates`, `campaignGames`, `playSessions`, `rewardOutcomes`, `rewardClaims`, or `publicPlayLinks` tables exist yet.
- `campaigns.theme` is currently `"lunar" | "brand"`, not a true game-template selector.
- `drawSessions` currently store `campaignId`, `publicCode`, `publicCodeExpiresAt`, `deliveryMode`, snapshots, `envelopeIndex`, status, and redemption link.
- `redemptions` currently store reward amount/rarity, `drawSessionId`, public code/delivery mode, snapshots, `envelopeIndex`, and budget item.
- Analytics currently track `session_created` and `redemption_created` using Aggregate/Sharded Counter, mostly over `drawSessions`/`redemptions`.

### Current Frontend Shape

- `app/draw/templates/registry.ts` is draw-specific and only maps `"li-xi"` and `"brand"`.
- Both current draw templates use the same `FortuneStage` and `app/styles/draw.css`.
- `/draw` is host station/share-link control and station guest screen.
- `/claim/$publicCode` is public compatibility route for link-mode participant flow.
- `Campaign Studio` still edits claim/draw copy: `claimHeadline`, `claimSubtitle`, `claimCtaLabel`, `claimCollectLabel`, `claimWaitingMessage`, and `theme`.
- Admin UI should follow `docs/admin-design-system.md`; guest game UI for li xi follows `design_system.md`.

### Known Baseline Failures To Address

Current command:

```bash
node scripts/verify-saas-contracts.mjs
```

Current failures observed:

- billing checkout and customer portal URLs must be validated against a clean `SITE_URL` origin.
- public claim links must have expiry metadata used by claim lookup, quotas, budget locks, and fail-closed migration.
- public claim campaign fallback section parsing/assertion is failing around `guestNameDisplay`.
- campaign attach, recent asset lists, draw hero rendering, and Campaign Studio retry UX must use R2-validated centralized asset ownership helpers.
- station guest mode must render only active owned campaign pending sessions, using session campaign snapshots and session-scoped reward pool instead of mutable `activeCampaign`.
- analytics contract parser reports missing section end after `export const backfillCampaignAnalytics`.

Agent must not ignore these. Either fix the underlying implementation, or update the contract only when the contract is provably stale and the replacement assertion is stricter.

---

## Target State

| Item | Giá trị |
|------|---------|
| Product model | Marketing game campaign platform |
| First game template | Li xi envelope draw / Lunar Fortune |
| Future game templates | Lucky wheel, raffle draw, scratch card, quiz, slot-style reveal, memory match, other branded mini-games |
| Campaign configuration | Campaign can select and configure a game template through Campaign Studio |
| Game registry | Generic `gameTemplates` registry with per-template id, label, route/stage component, CSS URL, fonts, config schema/editor, preview renderer, reward/result UI, analytics labels |
| Backend model | Additive generic concepts around existing tables: campaign game config, play-session/reward wrappers, public play-link naming. Do not destructively rename data first. |
| Public flow | Play-first UI/copy. `/claim/<publicCode>` remains compatibility route until a new public play route is introduced and verified. |
| Dashboard | Campaign + game dashboard with opens, starts, completions, reward outcomes, claims, conversion, channel/share performance, and template-specific metrics |
| Thứ KHÔNG thay đổi | TanStack Start runtime, Convex Auth Google OAuth path, host PIN guard, existing li xi guest experience quality, `/draw` and `/claim/<publicCode>` compatibility behavior, R2/Polar readiness boundaries |

---

## Constraints

> Đây là phần quan trọng nhất. Agent PHẢI tuân theo.

- [ ] KHÔNG bulk rename `drawSessions`/`redemptions`/`/draw`/`/claim` without compatibility wrappers, migration plan, and tests.
- [ ] KHÔNG phá current li xi envelope draw flow. It remains the first production game template.
- [ ] KHÔNG remove `/draw` or `/claim/<publicCode>`; they are compatibility surfaces.
- [ ] KHÔNG flatten guest game UI into admin/HeroUI styling. Admin uses HeroUI; guest templates own their visual systems.
- [ ] KHÔNG introduce new admin palettes/styles conflicting with `docs/admin-design-system.md`.
- [ ] KHÔNG expand legacy username/PIN account auth; keep Google OAuth/Convex Auth direction.
- [ ] KHÔNG trust client-supplied owner ids. Use Convex-side authorization helpers.
- [ ] KHÔNG upgrade unrelated dependencies or change package manager.
- [ ] KHÔNG make destructive Convex schema/data changes before compatibility tests and migration/backfill are defined.
- [ ] GIỮ `VITE_` public env boundary; do not add `NEXT_PUBLIC_` fallbacks.
- [ ] GIỮ billing/R2/Polar readiness and production evidence flows intact unless the task explicitly updates their contract.
- [ ] Nếu baseline contract failure is unrelated to game-platform migration, still resolve it or document why it blocks completion; do not claim done with red contract suite.
- [ ] Nếu gặp conflict giữa current implementation and `docs/product-direction.md`, prefer product direction and add compatibility wrappers instead of deleting legacy surfaces.

---

## Success Criteria

> Mỗi tiêu chí phải có authoritative evidence. Completion requires proof, not memory.

### Required Evidence per Criterion

| # | Tiêu chí | Verification Command | Expected Output / Signal |
|---|----------|---------------------|--------------------------|
| 1 | Static platform contract suite passes, including updated game-platform assertions | `node scripts/verify-saas-contracts.mjs` | Exit 0 and output `Platform contract checks passed` |
| 2 | Workflow policy still passes with platform wording | `node scripts/test-saas-workflow-policy.mjs` | Exit 0 and output `Platform workflow policy checks passed` |
| 3 | TypeScript remains valid | `npm run typecheck` | Exit 0 |
| 4 | Lint remains valid | `npm run lint` | Exit 0 |
| 5 | Contract suite remains valid through npm entrypoint | `npm run test:contracts` | Exit 0 |
| 6 | Route smoke still covers host/public compatibility routes | `npm run test:smoke` | Exit 0; smoke includes `/draw`, `/claim/abcdefabcdefabcdefabcdef`, `/claim/not-a-code`, `/campaigns`, `/leaderboard` |
| 7 | Generic game-template registry exists and li xi is registered as first template | `rg -n "gameTemplates|GameTemplate|li-xi|cssHref|analyticsLabels|config" app convex lib docs scripts` | Evidence shows generic registry, not only `drawTemplates` |
| 8 | Campaign Studio can select/configure a game template without treating `brand` as fake template | `rg -n "gameTemplate|campaignGame|templateId|Campaign Game|Game Template" app convex docs scripts` | Evidence shows Campaign Studio and backend schema/API carry campaign-game config |
| 9 | Public participant language is play-first while `/claim/<publicCode>` remains compatible | `rg -n "public play|play link|/claim/<publicCode>|compatibility" README.md docs app scripts` | Evidence shows play-first copy/docs plus preserved compatibility route |
| 10 | Dashboard/reporting exposes campaign + game metrics beyond redemption leaderboard | `rg -n "opens|starts|completions|reward outcomes|conversion|game metrics|gameTemplate" app convex docs scripts` | Evidence in analytics/dashboard code and docs |
| 11 | No accidental reintroduction of old product positioning | `rg -n "SaaS prize-draw|prize-draw platform|default campaign skin|one-off Tet" AGENTS.md README.md docs app scripts` | Only acceptable matches are explicit negative/compatibility notes, not product descriptions |
| 12 | Git diff is clean of whitespace errors | `git diff --check` | Exit 0 |

### Reference Artifacts

- `AGENTS.md` — repo-level agent instructions and product direction.
- `docs/product-direction.md` — source of truth for campaign/game/play-session/reward terminology.
- `goal.md` — current product alignment notes and high-priority gaps.
- `README.md` — user-facing project overview and operational docs.
- `docs/saas-standardization.md` — historical filename but active platform standardization notes.
- `docs/admin-design-system.md` — admin/workspace UI constraints.
- `design_system.md` — Lunar Fortune/li-xi game-template design constraints.
- `convex/schema.ts` — authoritative persisted data model.
- `app/draw/templates/registry.ts` and `app/draw/templates/types.ts` — current draw-template boundary to replace/wrap.
- `scripts/verify-saas-contracts.mjs` — static contract source; filename is legacy.

### Completion Condition

Agent kết thúc khi và chỉ khi:

- [ ] Tất cả verification commands above pass with expected output.
- [ ] Current li xi station flow and public `/claim/<publicCode>` compatibility route remain covered by smoke/contract tests.
- [ ] Generic game-template/campaign-game concepts exist in code, not only in docs.
- [ ] Campaign Studio can select/configure at least the li xi template through the new generic path.
- [ ] Public copy and docs use play-first language while preserving legacy route compatibility.
- [ ] Dashboard/analytics have a concrete path for campaign + game metrics beyond only redemptions.
- [ ] No unresolved baseline contract failures remain.

---

## Execution Plan

> Thực hiện theo thứ tự. Báo cáo sau mỗi bước trước khi tiếp tục.

1. **Baseline Audit And Repair**
   - Inspect current worktree before editing.
   - Re-run `node scripts/verify-saas-contracts.mjs`.
   - Fix or strictly replace the current contract failures listed above.
   - Do not start game-platform migration while baseline contracts are red unless the fix is directly part of the migration.

2. **Define Generic Game Template Boundary**
   - Introduce a generic game-template registry separate from draw-specific names.
   - Minimum registry metadata: `id`, `name`, `description`, `stage component`, `cssHref`, `fonts`, `config schema/defaults`, `config editor metadata`, `preview renderer`, `reward/result UI metadata`, `analyticsLabels`.
   - Register `li-xi` as the first template.
   - Keep current `FortuneStage` and `draw.css` under the li xi template boundary.
   - Make `brand` a campaign/style variant only if needed, not a separate fake game template.

3. **Add Campaign Game Configuration**
   - Add additive schema/API support for campaign-game configuration.
   - Prefer `campaignGames` or explicit `campaign.gameTemplateId` plus game config, depending on minimal safe Convex migration.
   - Preserve existing `campaigns.theme` during migration, but do not let new features depend on it as the platform-level game selector.
   - Add migration/default behavior so existing campaigns resolve to `li-xi`.
   - Update Campaign Studio types, form state, save/load APIs, and preview to use game-template config.

4. **Wrap Current Draw Session As Play Session**
   - Add frontend/backend wrapper language and helper types so current `drawSessions` are treated as li xi `PlaySession`.
   - Keep actual table names until a data migration is explicitly implemented.
   - Ensure `createSession`, `getStationState`, `getPublicSession`, `redeem`, and `redeemPublicSession` preserve behavior while exposing play-first naming at route/UI boundaries where safe.
   - Keep host PIN as operational guard.

5. **Public Play Link Compatibility**
   - Rename user-facing copy from claim-first to play-first in Campaign Studio, host share-link panel, public loading/closed states, README/docs, and contract assertions.
   - Keep `/claim/<publicCode>` route and current public-code policy.
   - Optionally add a new `/play/$publicCode` route only if it aliases the same behavior and smoke/contract coverage proves both old and new routes.

6. **Dashboard And Analytics Expansion**
   - Extend analytics model toward game-funnel metrics: opens, starts, completions, reward outcomes, claims, conversion, channel/share performance, and template-specific events.
   - Preserve existing Aggregate/Sharded Counter logic for redemptions.
   - Add idempotent event keys for new metrics.
   - Update Campaign Studio/dashboard/leaderboard views to show campaign + game metrics without losing existing history.

7. **Test And Contract Updates**
   - Add or update contract tests for:
     - game-template registry shape,
     - li xi default migration,
     - Campaign Studio game selection/config save/load,
     - public play-link copy and compatibility route,
     - dashboard game metrics,
     - no product wording regression.
   - Keep existing production readiness, billing, R2, Polar, auth, and route smoke checks intact.

8. **Documentation Alignment**
   - Update `README.md`, `docs/product-direction.md`, `docs/saas-standardization.md`, `docs/admin-design-system.md`, and `design_system.md` only as needed to match implemented code.
   - If new game-template UI or CSS pattern is added, document it before finalizing.
   - Do not leave docs claiming capabilities that code does not implement.

9. **Full Verification**
   - Run all Success Criteria commands.
   - If `node_modules` is missing, run `npm install` first; do not change dependencies unless required by the implementation and documented.
   - Report each criterion with command output signal.

---

## Out of Scope

- Full marketplace/template builder UX for arbitrary third-party game templates.
- Destructive renaming of Convex tables from `drawSessions`/`redemptions` to generic names without a separate migration plan.
- Removing `/draw` or `/claim/<publicCode>`.
- Adding real payment plan changes beyond keeping Polar integration working.
- Replacing Convex Auth, R2, Polar, TanStack Start, or HeroUI.
- Optimizing performance unrelated to game-platform migration.
- Building every future game template now. The required implementation is generic enough to add them later, with `li-xi` as the first concrete template.

---

## References

- `AGENTS.md`
- `docs/product-direction.md`
- `goal.md`
- `README.md`
- `docs/saas-standardization.md`
- `docs/admin-design-system.md`
- `design_system.md`
- `app/draw/templates/types.ts`
- `app/draw/templates/registry.ts`
- `app/draw.tsx`
- `app/claim/$publicCode.tsx`
- `app/campaigns.tsx`
- `app/-campaigns/types.ts`
- `convex/schema.ts`
- `convex/draw.ts`
- `convex/campaigns.ts`
- `convex/analytics.ts`
- `convex/leaderboard.ts`
- `scripts/verify-saas-contracts.mjs`
- `scripts/test-saas-workflow-policy.mjs`

---

## Agent Instructions

### Execution

1. Đọc toàn bộ file này trước khi làm bất kỳ thứ gì.
2. Inspect current worktree/file/output thật sự; previous chat context is only a hint.
3. Tuân theo Constraints tuyệt đối.
4. Thực hiện Execution Plan theo thứ tự, từng bước một.
5. Sau mỗi bước: báo cáo ngắn gọn kết quả trước khi tiếp tục.
6. Nếu phát hiện conflict giữa Constraints và Execution Plan: ưu tiên Constraints.
7. Nếu gặp thứ gì không có trong `master-goal.md` and it materially changes scope: dừng và hỏi.
8. Khi xong: verify toàn bộ Success Criteria và báo cáo từng item.

### Anti-bias Instructions

**Chống Scope Shrink**

- KHÔNG redefine "done" thành chỉ đổi docs/copy.
- KHÔNG dừng sau khi tạo registry nếu Campaign Studio/backend/session/dashboard chưa đi qua generic path.
- KHÔNG coi `brand` theme là game-template support. It is currently only a variant of li xi visuals.

**Chống Uncertainty Stop**

- Uncertain evidence = not achieved.
- Nếu không chắc route, schema, analytics, hoặc contract đã migrate chưa, inspect file and run commands.
- Chỉ dừng khi evidence proves completion.

**Chống Memory Trust**

- KHÔNG assume baseline is green. Run the commands.
- KHÔNG assume a file changed because docs say so. Inspect current files.
- KHÔNG claim `/claim` compatibility is preserved without smoke/contract evidence.
