import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
	countGameSessionsExact,
	playSessionsByGame,
	rewardedOutcomesByOwner,
} from "./analytics";
import { isValidMigrationToken, migrationTokenEnvNames } from "./migrationToken";

/**
 * Bounded, server-owned accounting backfill for the generic play foundation.
 *
 * Progress for game buckets lives in server-side marker rows
 * (analyticsCounterEvents with the reserved "play-backfill:" eventKey prefix,
 * source "backfill"): the opaque paginate cursor rides in `channelLabel`, and
 * a `...:done` marker records that a bucket was fully drained. The owner
 * reward traversal instead persists its position (phase + opaque paginate
 * cursor) in the owner's accountingStates row, atomically with its aggregate
 * inserts. Clients relay cursors but can never stamp readiness:
 *
 * - sequencing is validated against the server-owned position: a traversal
 *   cannot START at a later cursor (it must begin at the very first row), and
 *   a mismatching cursor is rejected instead of silently processed;
 * - `finalize` is honored only on the invocation where the backend reports
 *   the traversal done; a finalize on any partial page is rejected;
 * - readiness stamps only when every required bucket/phase is drained.
 *
 * Every insert deduplicates, so replaying or reordering requests is
 * idempotent. Coverage: the game-scoped (campaignGameId, status) index
 * excludes sibling games; rows only move active → completed, so with the
 * documented active-then-completed order every row is scanned exactly in
 * whichever bucket it resides at that moment (and the completion path
 * re-inserts a completing session into the aggregate atomically), with dedupe
 * absorbing re-encounters. The owner reward traversal walks the
 * by_owner_rewardType index in four fixed phases (cash, voucher, physical,
 * points); engagement (`none`) outcomes live in no phase, so they can never
 * extend or restart it. Admissions for the game are gated while un-ready,
 * so no new sessions appear mid-traversal; rewarded allocation is gated while
 * owner reward accounting is un-ready, so no rewarded outcome appears
 * mid-traversal either (engagement completions are `none` — a type that no
 * rewarded traversal covers — and ride safely without aggregation).
 *
 * Boundedness: each invocation reads at most `limit` (≤ MAX_PAGE_LIMIT)
 * bucket rows per page it processes; the reward traversal enforces an exact
 * per-invocation budget of `limit` outcome rows total across chained phases
 * (empty phases chain with O(1) probes and consume no row budget) plus its
 * progress markers and log-bounded aggregate component operations (component
 * work grows with tree depth) — there is no whole-history collect anywhere in
 * this module, so every transaction stays inside Convex per-transaction read
 * limits even at the declared 200,000-session cap.
 */

const MAX_PAGE_LIMIT = 25;
const DEFAULT_PAGE_LIMIT = 25;

function normalizePageLimit(limit: number | undefined): number | null {
	if (limit === undefined) {
		return DEFAULT_PAGE_LIMIT;
	}
	if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_PAGE_LIMIT) {
		return null;
	}
	return limit;
}

const statusProgressKey = (scope: string, status: string) =>
	`play-backfill:${scope}:${status}`;

const statusDoneKey = (scope: string, status: string) =>
	`play-backfill:${scope}:${status}:done`;

async function readMarker(
	ctx: MutationCtx,
	eventKey: string,
): Promise<Doc<"analyticsCounterEvents"> | null> {
	const marker = await ctx.db
		.query("analyticsCounterEvents")
		.withIndex("by_eventKey", (q) => q.eq("eventKey", eventKey))
		.unique();
	return marker ?? null;
}

async function writeCursorMarker(
	ctx: MutationCtx,
	args: {
		progressKey: string;
		ownerId: Id<"users">;
		campaignId?: Id<"campaigns">;
		cursor: string;
		previous: Doc<"analyticsCounterEvents"> | null;
	},
) {
	if (args.previous) {
		await ctx.db.patch(args.previous._id, { channelLabel: args.cursor });
	} else {
		// Ops marker row, written directly without touching any counter so
		// real metrics stay untouched. channelLabel carries the opaque
		// paginate cursor; the reserved eventKey prefix keeps it out of
		// funnel metrics.
		await ctx.db.insert("analyticsCounterEvents", {
			eventKey: args.progressKey,
			ownerId: args.ownerId,
			campaignId: args.campaignId,
			channelLabel: args.cursor,
			metric: "session_created",
			source: "backfill",
			createdAt: Date.now(),
		});
	}
}

async function writeDoneMarker(
	ctx: MutationCtx,
	args: {
		doneKey: string;
		ownerId: Id<"users">;
		campaignId?: Id<"campaigns">;
		rows: number;
	},
) {
	if (!(await readMarker(ctx, args.doneKey))) {
		await ctx.db.insert("analyticsCounterEvents", {
			eventKey: args.doneKey,
			ownerId: args.ownerId,
			campaignId: args.campaignId,
			metric: "session_created",
			source: "backfill",
			createdAt: args.rows,
		});
	}
}

/**
 * Backfills ONE bounded page of play sessions for one (game, status) bucket
 * into the exact per-game admission aggregate, persisting the paginate cursor
 * server-side. `finalize: true` is honored only when THIS page exhausts the
 * bucket AND the sibling status bucket is already drained (its done marker
 * exists, or the sibling bucket is verifiably empty); only then does
 * accountingVersion stamp to 1. Premature or out-of-sequence finalize
 * requests are rejected; replays are idempotent.
 */
export const backfillGameAccountingPage = internalMutation({
	args: {
		campaignGameId: v.string(),
		status: v.optional(v.union(v.literal("active"), v.literal("completed"))),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
		finalize: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const campaignGameId = ctx.db.normalizeId("campaignGames", args.campaignGameId);
		if (!campaignGameId) {
			throw new Error("Không tìm thấy trò chơi");
		}
		const campaignGame = await ctx.db.get(campaignGameId);
		if (!campaignGame) {
			throw new Error("Không tìm thấy trò chơi");
		}
		const authUserId = await getAuthUserId(ctx);
		if (!authUserId || authUserId !== campaignGame.ownerId) {
			throw new Error(
				"Chỉ chủ trò chơi (đăng nhập) mới có thể chạy backfill số liệu cho trò chơi này",
			);
		}

		if ((campaignGame.accountingVersion ?? 0) >= 1) {
			return {
				campaignGameId,
				alreadyReady: true,
				complete: true,
				scanned: 0,
				continueCursor: null,
				accountingVersion: 1,
			};
		}

		const limit = normalizePageLimit(args.limit);
		if (limit === null) {
			throw new Error(`limit phải là số nguyên từ 1 đến ${MAX_PAGE_LIMIT}`);
		}
		const status = args.status ?? "active";
		const progressKey = statusProgressKey(campaignGameId, status);
		const doneKey = statusDoneKey(campaignGameId, status);
		const siblingDoneKey = statusDoneKey(campaignGameId, status === "active" ? "completed" : "active");

		const marker = await readMarker(ctx, progressKey);
		// Sequencing: the traversal must begin at the first row. A later
		// cursor without persisted progress would silently skip history.
		if (!marker && args.cursor !== undefined) {
			throw new Error(
				"Backfill chưa được bắt đầu; trang đầu tiên phải chạy không kèm cursor",
			);
		}
		// A relayed cursor must match the server-owned one.
		if (
			args.cursor !== undefined &&
			marker?.channelLabel !== undefined &&
			args.cursor !== marker.channelLabel
		) {
			throw new Error("Cursor không khớp tiến trình backfill đã lưu");
		}
		const cursor = marker?.channelLabel ?? args.cursor ?? null;

		const page = await ctx.db
			.query("playSessions")
			.withIndex("by_campaignGame_status", (q) =>
				q.eq("campaignGameId", campaignGameId).eq("status", status),
			)
			.paginate({ numItems: limit, cursor });

		// O(log n) aggregate counts: backfilled = genuinely new rows this page.
		const countBefore = await countGameSessionsExact(ctx, campaignGameId);
		for (const session of page.page) {
			await playSessionsByGame.insertIfDoesNotExist(ctx, session);
			// Carry the session's rewarded outcome into the owner reward
			// aggregate so a fully backfilled game also proves its outcomes
			// counted toward owner reward accounting.
			const outcome = await ctx.db
				.query("rewardOutcomes")
				.withIndex("by_playSession", (q) => q.eq("playSessionId", session._id))
				.unique();
			if (outcome && outcome.rewardType !== "none") {
				await rewardedOutcomesByOwner.insertIfDoesNotExist(ctx, outcome);
			}
		}
		const countAfter = await countGameSessionsExact(ctx, campaignGameId);

		const complete = page.isDone;
		let accountingVersion = campaignGame.accountingVersion ?? 0;

		if (complete) {
			await writeDoneMarker(ctx, {
				doneKey,
				ownerId: campaignGame.ownerId,
				campaignId: campaignGame.campaignId,
				rows: page.page.length,
			});
			// Readiness requires BOTH status buckets drained. The sibling must
			// either carry a done marker or be verifiably empty (O(1) probe) —
			// a finalize over one bucket while the other still holds uncounted
			// rows is rejected instead of opening over-cap admission.
			const siblingStatus = status === "active" ? "completed" : "active";
			const siblingRows = await ctx.db
				.query("playSessions")
				.withIndex("by_campaignGame_status", (q) =>
					q.eq("campaignGameId", campaignGameId).eq("status", siblingStatus),
				)
				.take(1);
			const siblingDrained =
				siblingRows.length === 0 ||
				Boolean(await readMarker(ctx, siblingDoneKey));
			if (siblingDrained && accountingVersion < 1) {
				await ctx.db.patch(campaignGameId, {
					accountingVersion: 1,
					updatedAt: Date.now(),
				});
				accountingVersion = 1;
			}
		} else {
			await writeCursorMarker(ctx, {
				progressKey,
				ownerId: campaignGame.ownerId,
				campaignId: campaignGame.campaignId,
				cursor: page.continueCursor,
				previous: marker,
			});
		}

		return {
			campaignGameId,
			alreadyReady: false,
			complete,
			scanned: page.page.length,
			backfilled: countAfter - countBefore,
			continueCursor: page.continueCursor,
			accountingVersion,
		};
	},
});

const REWARD_PHASES = ["cash", "voucher", "physical", "points"] as const;
type RewardPhase = (typeof REWARD_PHASES)[number];

/**
 * Backfills ONE bounded page of an owner's rewarded generic outcomes into the
 * owner reward aggregate, walking the by_owner_rewardType index in four fixed
 * server-owned phases (cash → voucher → physical → points). Engagement
 * (`none`) outcomes live in no phase, so ongoing engagement traffic can never
 * extend or restart the traversal. The position (phase + opaque paginate
 * cursor) persists in the owner's accountingStates row inside the same
 * transaction as the aggregate inserts, so every applied page advances the
 * saved position atomically. Each invocation applies at most `limit` outcome
 * rows total: drained phases chain within that row budget, and empty phases
 * chain with O(1) probes without consuming it. When the budget is spent at a
 * phase boundary, the next phase persists and the caller resumes exactly
 * there. rewardedOutcomesVersion stamps to 1 only after every phase is
 * proven drained.
 *
 * Sequencing: a caller may relay the saved cursor but cannot select a later
 * phase or start at an unproven position — a cursor without persisted
 * progress, or mismatching the saved one, is rejected. `finalize: true` is
 * honored only on the invocation that actually completes the traversal.
 * `dryRun: true` previews a page read-only: no state creation, no aggregate
 * inserts, no progress advance, no stamp — including on final pages.
 */
export const backfillRewardAccountingPage = internalMutation({
	args: {
		ownerId: v.optional(v.string()),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
		finalize: v.optional(v.boolean()),
		dryRun: v.optional(v.boolean()),
		migrationToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const authUserId = await getAuthUserId(ctx);
		let ownerId: Id<"users"> | null = authUserId;
		if (!ownerId) {
			if (!args.ownerId) {
				throw new Error(
					`Cần đăng nhập hoặc cung cấp ownerId kèm ${migrationTokenEnvNames.join(" / ")}`,
				);
			}
			if (!isValidMigrationToken(args.migrationToken)) {
				throw new Error(
					`Cần đăng nhập hoặc ${migrationTokenEnvNames.join(" / ")} để backfill số liệu thưởng`,
				);
			}
			const normalized = ctx.db.normalizeId("users", args.ownerId);
			if (!normalized) {
				throw new Error("Không tìm thấy host");
			}
			const owner = await ctx.db.get(normalized);
			if (!owner) {
				throw new Error("Không tìm thấy host");
			}
			ownerId = normalized;
		}
		const owner = await ctx.db.get(ownerId);
		if (!owner) {
			throw new Error("Không tìm thấy host");
		}

		const limit = normalizePageLimit(args.limit);
		if (limit === null) {
			throw new Error(`limit phải là số nguyên từ 1 đến ${MAX_PAGE_LIMIT}`);
		}
		const dryRun = args.dryRun ?? false;

		const state = await ctx.db
			.query("accountingStates")
			.withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
			.first();

		if ((state?.rewardedOutcomesVersion ?? 0) >= 1) {
			return {
				ownerId,
				alreadyReady: true,
				complete: true,
				stamped: false,
				scanned: 0,
				continueCursor: null,
				phase: null,
				dryRun,
			};
		}

		// Sequencing: the traversal must start at the first outcome of its
		// phase. A cursor without persisted progress would silently skip
		// history, and a relayed cursor must match the server-owned one.
		const savedPhase: RewardPhase = state?.rewardedPhase ?? "cash";
		const savedCursor = state?.rewardedPhaseCursor ?? null;
		if (args.cursor !== undefined) {
			if (!state || savedCursor === null) {
				throw new Error(
					"Backfill chưa được bắt đầu; trang đầu tiên phải chạy không kèm cursor",
				);
			}
			if (args.cursor !== savedCursor) {
				throw new Error("Cursor không khớp tiến trình backfill đã lưu");
			}
		}

		let phaseIndex = REWARD_PHASES.indexOf(savedPhase);
		let cursor: string | null = savedCursor;
		let scanned = 0;
		// Exact per-invocation row budget: chained drained phases share the
		// same `limit`, shrinking each page so the total stays within budget.
		let remaining = limit;

		const persistProgress = async (
			nextPhase: RewardPhase,
			nextCursor: string | null,
		) => {
			if (state) {
				// A phase boundary stores no cursor: patching undefined clears a
				// stale previous-phase cursor so it can never be replayed.
				await ctx.db.patch(state._id, {
					rewardedPhase: nextPhase,
					rewardedPhaseCursor: nextCursor ?? undefined,
					updatedAt: Date.now(),
				});
			} else {
				await ctx.db.insert("accountingStates", {
					ownerId,
					rewardedOutcomesVersion: 0,
					rewardedPhase: nextPhase,
					...(nextCursor ? { rewardedPhaseCursor: nextCursor } : {}),
					updatedAt: Date.now(),
				});
			}
		};

		// The loop is bounded by the phase index itself: a traversal resumed
		// at a later phase never queries past the last real reward type.
		while (phaseIndex < REWARD_PHASES.length) {
			const phase = REWARD_PHASES[phaseIndex];
			const page = await ctx.db
				.query("rewardOutcomes")
				.withIndex("by_owner_rewardType", (q) =>
					q.eq("ownerId", ownerId).eq("rewardType", phase),
				)
				.paginate({ numItems: remaining, cursor });
			scanned += page.page.length;
			remaining -= page.page.length;

			if (!dryRun) {
				// Applied pages always insert their rows, drained or not.
				for (const outcome of page.page) {
					await rewardedOutcomesByOwner.insertIfDoesNotExist(ctx, outcome);
				}
			}

			if (!page.isDone) {
				if (dryRun) {
					return {
						ownerId,
						alreadyReady: false,
						complete: false,
						stamped: false,
						scanned,
						continueCursor: page.continueCursor,
						phase,
						dryRun,
					};
				}
				if (args.finalize) {
					throw new Error(
						"finalize chỉ được dùng ở trang cuối của quá trình backfill thưởng",
					);
				}
				await persistProgress(phase, page.continueCursor);
				return {
					ownerId,
					alreadyReady: false,
					complete: false,
					stamped: false,
					scanned,
					continueCursor: page.continueCursor,
					phase,
					dryRun,
				};
			}

			// This phase drained on this page; move to the next one. Empty
			// phases chain here without consuming row budget; a spent budget
			// stops the chain at the phase boundary so the next invocation
			// resumes at the next phase's first row.
			phaseIndex += 1;
			cursor = null;
			if (remaining <= 0 && phaseIndex < REWARD_PHASES.length) {
				const nextPhase = REWARD_PHASES[phaseIndex];
				if (!dryRun) {
					if (args.finalize) {
						throw new Error(
							"finalize chỉ được dùng ở trang cuối của quá trình backfill thưởng",
						);
					}
					await persistProgress(nextPhase, null);
				}
				return {
					ownerId,
					alreadyReady: false,
					complete: false,
					stamped: false,
					scanned,
					continueCursor: null,
					phase: nextPhase,
					dryRun,
				};
			}
		}

		// Every phase is proven drained (each advance required an isDone page).
		let stamped = false;
		if (args.finalize && dryRun) {
			throw new Error("finalize không dùng cùng chế độ dryRun");
		}
		if (!dryRun) {
			if (state) {
				await ctx.db.patch(state._id, {
					rewardedOutcomesVersion: 1,
					updatedAt: Date.now(),
				});
			} else {
				await ctx.db.insert("accountingStates", {
					ownerId,
					rewardedOutcomesVersion: 1,
					updatedAt: Date.now(),
				});
			}
			stamped = true;
		}
		return {
			ownerId,
			alreadyReady: false,
			complete: true,
			stamped,
			scanned,
			continueCursor: null,
			phase: null,
			dryRun,
		};
	},
});
