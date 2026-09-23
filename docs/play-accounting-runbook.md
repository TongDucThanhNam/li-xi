# Play accounting initialization runbook (maintenance operations)

Scope: one-time, additive initialization of the generic play accounting. Two
independent readiness systems, each with its own bounded, server-owned
traversal in `convex/playMaintenance.ts`:

1. **Per-game admission accounting** — `playSessionsByGame` Aggregate (namespace
   `game-sessions:<campaignGameId>`), gated by `campaignGames.accountingVersion`.
   Traversal: `backfillGameAccountingPage`.
2. **Owner reward quota accounting** — `rewardedOutcomesByOwner` Aggregate
   (namespace `rewarded:<ownerId>`), gated by
   `accountingStates.rewardedOutcomesVersion`. Traversal:
   `backfillRewardAccountingPage` over the fixed reward-type phases
   (`cash → voucher → physical → points`) of the `by_owner_rewardType` index.

Both aggregates live in the `@convex-dev/aggregate` component and use prefixed
namespaces that never collide with the legacy `redemptionsByOwnerAmount`
namespace (raw owner id).

## Game traversal: `backfillGameAccountingPage`

Args: `{campaignGameId, status?, limit?, cursor?, finalize?}` — page size is
bounded by `MAX_PAGE_LIMIT = 25` (`DEFAULT_PAGE_LIMIT = 25`). The status bucket
defaults to `active`; drain `active` first, then `completed`.

Server-owned progress lives in ops marker rows (`analyticsCounterEvents`,
eventKey prefix `play-backfill:`, source `backfill`; the opaque paginate cursor
rides in `channelLabel`, and a `...:done` marker records a drained bucket).
Every invocation:

1. reads the saved `(game, status)` cursor,
2. paginates the next bounded page from the `by_campaignGame_status` index,
3. dedup-inserts each session into the per-game aggregate (`countBefore` /
   `countAfter` come from the exact aggregate count, not row scans) and carries
   the session's rewarded outcome (when it exists and is not `none`) into the
   owner reward aggregate,
4. on a partial page persists the new cursor; on the final page writes the
   bucket `:done` marker, and stamps `accountingVersion = 1` only when the
   sibling status bucket is also drained (its marker exists or it is verifiably
   empty with an O(1) probe).

Sequencing is enforced against the server-owned cursor: the first invocation
must run without a cursor (a later cursor without persisted progress is
rejected), a relayed cursor must match the saved one, and replays are
idempotent (dedupe + `alreadyReady: true` short-circuit).

## Owner reward traversal: `backfillRewardAccountingPage`

Args: `{ownerId?, limit?, cursor?, finalize?, dryRun?, migrationToken?}` —
same 25-page budget. Runs with the owner identity, or unauthenticated with
`ownerId` plus a valid migration token.

The traversal walks the `by_owner_rewardType` index in the fixed phase order
`cash → voucher → physical → points`. Engagement (`none`) outcomes live in no
phase, so ongoing engagement traffic can never extend or restart the
traversal. Progress (phase + opaque paginate cursor) persists in the owner's
`accountingStates` row (`rewardedPhase`, `rewardedPhaseCursor`) inside the same
transaction as the aggregate inserts — every applied page advances the saved
position atomically. Each invocation applies at most `limit` outcome rows
total: drained phases chain within that exact row budget (pages shrink so the
total never exceeds it), and empty phases chain with O(1) probes without
consuming it. When the budget is spent at a phase boundary, the next phase is
persisted (with any stale cursor cleared) and the caller resumes exactly
there. `rewardedOutcomesVersion` stamps to 1 only after every phase is proven
drained. The traversal loop is bounded by the phase index itself, so a resume
at a later phase never queries past the last real reward type.

- **Sequencing**: a cursor without persisted progress ("Backfill chưa được bắt
  đầu") or mismatching the saved one is rejected. A caller cannot select a
  phase; the server owns the position and every response returns it.
- **`finalize`** is honored only on the invocation that actually completes the
  traversal; a finalize on any partial page is rejected.
- **`dryRun: true`** previews a page read-only — no state creation, no
  aggregate inserts, no progress advance, no stamp, including on final pages.
  A cursor returned by a dry run proves nothing was applied and is rejected on
  a later applied call.
- **Gating**: `ensureRewardAccountingReady` (convex/entitlements.ts) throws
  "Tài khoản cần khởi tạo số liệu thưởng
  (playMaintenance:backfillRewardAccountingPage)…" while an owner has actual
  rewarded outcomes but no stamp. Owner reward readiness derives ONLY from
  that actual reward history (four bounded `by_owner_rewardType` existence
  probes) and the independent `accountingStates` version — never from game
  configuration, mode or `accountingVersion`: an empty game holds no reward
  history and must not invent it. Fresh owners and engagement-only histories
  (any volume of `none` rows) auto-initialize without scanning outcomes. Game
  admission readiness (`campaignGames.accountingVersion`) is a separate gate.

## Boundedness

There is no whole-history collect anywhere in the maintenance module. Each
invocation reads at most `limit` (≤ 25) rows per page; the reward traversal
processes at most one page per phase — up to four pages in one call when
phases chain — with pages shrinking so the TOTAL applied outcome rows per
invocation stay within the `limit` row budget (empty phases chain with O(1)
probes and consume none). Aggregate component work (inserts, dedupe, counts)
grows with tree depth, so per-invocation cost is not constant in history size.
Populated behavior is proven behaviorally at scale with `transactionLimits:
true` fixtures — the durable owner case applies 10 new cash awards while
re-deduping 1500 aggregated vouchers at the 25-page budget, and the isolated
review probes insert genuinely new rows into BOTH populated trees — not from a
source-text claim; this proves behavior at the tested scale, not arbitrary
capacity. The business caps (`maxTotalSessions` default 20,000 / maximum
200,000) are unchanged by the page budget.

## Concurrency argument

- **Game traversal**: the `by_campaignGame_status` index plus the
  active-then-completed drain order means every row is scanned exactly in
  whichever bucket it resides at that moment; a historical session completing
  between pages moves to the completed bucket and is accounted there
  (durable test: "an active historical session completing between pages is
  still accounted"). Aggregate inserts deduplicate by document, so
  re-encounters cannot double count.
- **Frozen traversed set**: while `accountingVersion < 1` with history, the
  admission gate blocks new sessions for the game; completion-path inserts
  (playEngine) use `insertIfDoesNotExist`, so a session completing mid-backfill
  never conflicts with its backfill insert.
- **Reward traversal**: allocation is gated until the owner stamp, so no
  rewarded outcome can appear inside the unscanned window. Engagement
  completions (`none`) ride without aggregation and live outside every phase.
  Position persistence is transactional with the inserts, so a crashed page
  leaves the previous position authoritative and replays dedupe.
- **Post-stamp inserts**: admission inserts the session into the per-game
  aggregate and `allocateRewardOutcome` inserts the rewarded outcome into the
  owner aggregate atomically at award time, keeping counts exact.

## Operator procedure

The commands below are FUTURE AUTHORIZED OPERATIONAL EXAMPLES. They were NOT
executed in this task (no remote invocation, schema push, seed or codegen is
authorized here), and `npx convex run` selects a configured deployment and
WRITES remote data — it is not a test fixture.

Both mutations derive the caller from Convex Auth (`getAuthUserId`), so merely
signing into the deployment CLI does NOT supply the required owner identity.
Pass the owner identity explicitly via the verified `--identity` option
(installed `cli/lib/command.ts` defines it; `cli/lib/run.ts` passes it as the
admin auth identity), with a deployment placeholder/selection:

```bash
# 1. Per game with historical sessions, drain both status buckets (the game
#    owner's subject must equal campaignGames.ownerId):
npx convex run playMaintenance:backfillGameAccountingPage   --deployment '<deployment>'   --identity '{"subject":"<ownerId>"}'   '{"campaignGameId":"<id>","status":"active"}'
npx convex run playMaintenance:backfillGameAccountingPage   --deployment '<deployment>'   --identity '{"subject":"<ownerId>"}'   '{"campaignGameId":"<id>","status":"completed"}'
```

Owner reward maintenance additionally supports the migration-token path for
unauthenticated admin invocation (`ownerId` + `migrationToken`):

```bash
# 2. Per owner with rewarded history:
npx convex run playMaintenance:backfillRewardAccountingPage   --deployment '<deployment>'   --identity '{"subject":"<ownerId>"}' '{}'
```

Drive maintenance from the server's returned fields, not a fixed formula:

- Repeat a game-bucket call while `complete` is `false`; an empty bucket
  completes in one call. `accountingVersion` stamps to 1 only when BOTH
  buckets are drained — `complete` on one bucket is not game readiness.
- Repeat the owner traversal while `complete` is `false`, relaying
  `continueCursor` back as `cursor` each time. A returned `null` cursor is
  safely omitted (it is a phase boundary; the next call resumes at that
  phase's first row). Phase chains and empty pages make universal call-count
  formulas inaccurate — rely on `complete`/`stamped` and, for readiness,
  `getPlanState().rewardAccountingReady`.
- Previews: add `"dryRun":true` (read-only, never advances or stamps).
- Replaying any invocation is safe (dedupe + `alreadyReady` short-circuit).

## Verification after running

- `campaignGames.accountingVersion` is 1 for every legacy game with sessions.
- `accountingStates.rewardedOutcomesVersion` is 1 for every owner whose reward
  traversal completed.
- `getPlanState().usage.redemptions` = legacy redemption aggregate + rewarded
  generic aggregate (count and sum exact), with `rewardAccountingReady: true`.
- Admission enforces `maxTotalSessions` at any configured cap (1 → 200,000);
  sibling games never certify each other's history (durable test: "backfilling
  an empty game cannot certify sibling-game reward history").
