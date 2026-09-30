# Product Direction: Marketing Game Campaign Platform

Campaign Game Studio is a platform for brands, agencies, and campaign operators to run customer appreciation campaigns through interactive games. The current li xi envelope draw is the first shipped game template, not the product boundary.

## Domain Model

- **Campaign**: a marketing activation owned by a host or brand workspace. It carries brand identity, assets, distribution settings, reward configuration, billing scope, and analytics.
- **Game Template**: a reusable playable experience such as li xi envelope draw, lucky wheel, raffle draw, scratch card, quiz, slot-style reveal, memory match, or other branded mini-games.
- **Campaign Game**: a configured instance of a game template inside a campaign, including game rules, copy, styling, assets, reward strategy, and analytics labels.
- **Play Session**: one participant's interaction with a campaign game. Current `drawSessions` are the li xi implementation of this concept.
- **Reward Outcome / Reward Claim**: the result produced by a play session when the game grants a reward. Current `redemptions` are the li xi implementation of this concept.
- **Share Link / Public Play Link**: a public entry point for participants. Current `/claim/<publicCode>` links are a draw-era implementation and should move toward play-first language.
- **Dashboard**: campaign and game performance reporting: opens, starts, completions, conversion, reward outcomes, claims, channel/share performance, and game-specific metrics.

## Product Rules

- Do not describe the product as a prize-draw SaaS. Prize draw is one game mechanic among many.
- Do not let li xi envelope terminology leak into new generic platform features.
- New platform work should use game-oriented language unless it is intentionally touching the current li xi/draw implementation.
- Every new game template must be able to own:
  - participant-facing stage component,
  - CSS/theme layer,
  - fonts and media requirements,
  - configuration editor and preview,
  - game rules and validation,
  - reward strategy,
  - analytics events and dashboard labels.
- Guest experience quality is part of the product. Admin standardization should not flatten individual game identity.

## Current Implementation Boundary

The repository still contains draw-era names such as `drawSessions`, `redemptions`, `/draw`, `/claim/<publicCode>`, `envelopeIndex`, and `budgetItems`. Treat those as the current li xi template implementation and migration surface; they remain the only way the legacy budget-based draw flow works.

The first generic layer now exists: `gameTemplates` defines the li xi template metadata, `campaignGames` stores the configured campaign-game instance, and `convex/playSessions.ts` wraps current draw sessions with play-session identity. When expanding the platform, keep using additive generic models such as `gameTemplates`, `campaignGames`, `playSessions`, `rewardOutcomes`, `rewardClaims`, and `publicPlayLinks`, then migrate or wrap existing draw data behind those concepts.

Stage 1 of the platform rollout additionally implements the self-serve play foundation on those generic models: `participants`, generic `playSessions`, `rewardInventory` (cash, voucher, physical, points), `rewardOutcomes`/`rewardClaims` with a distinct claim transition, reusable `publicPlayLinks` served at `/p/$shareCode`, a second registered game template (lucky wheel with its own design tokens in `docs/design-lucky-wheel.md`), and backend-enforced per-game play limits via unguessable session capabilities plus persisted start keys. Game configuration is a tagged union (`templateId` discriminant) with an independent `rewardSource` choice (legacy budget vs self-serve inventory), a per-game reward pool tag, and two no-reward options: a chance-based weight in rewarded mode, and a guaranteed `rewardMode: "engagement"` that never allocates inventory or consumes quota. Rewarded plays — legacy and generic — consume one shared account reward quota at the award transition; no-reward completions are play limits, not quota. Admitted sessions freeze their rules in a snapshot at admission, so owner edits never change an in-flight participant's rules. Capacity and reward accounting use exact aggregates with an explicit initialization/backfill gate (see `docs/play-accounting-runbook.md`). Claim details come from immutable award snapshots, so inventory edits never rewrite an awarded voucher. Multiple campaigns and campaign games can run independently; the preferred/default campaign pointer only steers legacy draw-era surfaces. Station mode now ships for lucky wheel and scratch card (self-serve station sessions under the signed-in host, alongside the legacy li-xi host-PIN station). Campaign reporting is live: `/analytics` reports the campaign/game/channel/share-link funnel (opens, starts, completions, reward outcomes, claims, conversion) and the claims fulfilment queue backs the operator hand-off.

## Brand identity and campaign-game asset slots (4d-3)

- **Campaign brand identity fields** (brand color, brand logo, audience/channel intent) are optional **workspace metadata**: they describe the campaign to operators, appear on the campaigns list/overview, and travel through `saveCampaign`. The **brand color is never injected into guest stages** — every template owns its own token contract (the li xi `brand` variant differs by campaign copy, brand name, hero asset and collect copy, "không bằng font hoặc màu mới"), so ad-hoc brand colors on guest surfaces would break each template's documented tokens. Guest theming via brand color stays a per-template, doc-first future decision.
- **The brand logo is workspace metadata only for now.** It may appear on guest entry heroes only if a template's design doc defines a brand-logo slot; no current template doc does (the li xi doc names only the hero asset), so the logo renders in the workspace (overview, campaigns list) and is deferred on guest surfaces.
- **Per-game asset slots** are template-declared image slots (`usage` kind + owning `campaignGameId` on `campaignAssets`), adopted doc-first: lucky wheel owns `game-wheel-hub`, quiz owns `game-quiz-backdrop`; scratch card's beneath image and slot-reveal's symbol images are documented deferrals in their design docs. Slot images are presentation-only: resolved live as renderable R2 URLs (never frozen into `rulesSnapshot`), cropped/fitted per the template doc, and falling back to the exact current visuals when absent.

## Guest copy and play windows (4d-2)

Guest-facing copy and scheduling are campaign-game scoped:
- **Guest copy** (`GamePublicCopy`) is the full 7-field set: headline, subtitle, start CTA, collect CTA, waiting message, thank-you message, and voucher claim instructions. Every template config editor edits the same shared section; empty values render the built-in defaults, and rows/snapshots written before a field existed read as absent and keep rendering unchanged. Legacy li xi campaigns keep their campaign-level `claim*` columns working: they are the li xi template's legacy projection of the same five original fields (synced through `toLegacyCampaignPresentation` on save); the two newer fields (thank-you message, claim instructions) exist only on the campaign-game `publicCopy` and fall back to the built-in defaults in every legacy surface.
- **Play windows** (`startsAt`/`endsAt`, both independently optional) live on the `campaignGames` row — per game instance, not the campaign — because each game in a campaign is an independent activation. Enforcement is server-side at every NEW-session admission: public link resolution (`resolveShareLink`), the shared admission core used by the public link and self-serve station (`admitGenericPlaySession`), and therefore station start. A closed window renders "Chưa đến giờ" (with the opening time in Asia/Ho_Chi_Minh) or "Đã kết thúc" on `/p`, the station waiting screen, and the operator console; the games list and distribution pages show advisory status chips. **In-flight exemption**: a session admitted inside the window may always finish after `endsAt` under its frozen rules snapshot — the mid-session guard stays a hard-lifecycle check, and the station's idempotent resume wins over the window. The legacy host-PIN li xi draw flow (`draw.createSession`) is intentionally not window-gated: the host creates each session in person, so host presence is the operational gate; the campaign-active guard still applies.

## Near-Term Migration Direction

1. Keep existing li xi draw flow working as the first game template.
2. Add the next non-li-xi template through the implemented registry, with per-template CSS, fonts, stage component, config schema, editor metadata, reward/result UI, and analytics labels.
3. Expand campaign-game configuration beyond the current li xi defaults once more templates exist.
4. Continue renaming participant-facing language from claim-first to play-first while preserving old routes as compatibility aliases.
5. Use campaign-game funnel metrics as the default analytics surface: opens, starts, completions, conversion, reward outcomes, claims, channel/share performance, and game-specific metrics.
6. Move backend naming and new business logic toward campaign/game/play-session/reward concepts.

## Decisions (won't-do)

- **Generic reward claims in the legacy leaderboard.** `convex/leaderboard.ts` stays a draw-era surface over legacy `redemptions` (guest, amount, rarity). Generic play sessions and `rewardClaims` are intentionally NOT merged into it: they have no comparable guest-ranking semantics, and generic campaign/game reporting already covers them in the analytics surfaces (game funnel, claims queue). Revisit only if a cross-template leaderboard becomes an actual product requirement, as a new generic surface — never by widening the legacy one.
