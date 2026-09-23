import { describe, expect, test } from "vitest";
import {
	buildSurfaceInputs,
	collectSavedRewardRows,
	deriveCapabilityRecovery,
	isNextPlayEligible,
	resolvePublicEntrySurface,
	type SurfaceInputs,
} from "./entrySurfacePolicy";

const baseInputs: SurfaceInputs = {
	collected: false,
	entryLoaded: true,
	entryState: "open",
	hasRecoveredOutcome: false,
	hasViewingOutcome: false,
	normalizedShareCode: "abcdefghjkmnpqrstuvwxy",
	recoveredClaimLoaded: true,
	recoveredLoaded: true,
	recoveredNeedsClaimDetail: false,
	session: null,
	sessionReady: true,
	snapshotLoaded: true,
	viewing: null,
	viewingClaimLoaded: false,
	viewingLoaded: true,
	viewingNeedsDetail: false,
};

const session = { sessionId: "session-1" };
const viewing = { sessionId: "saved-1" };

describe("public entry surface resolution", () => {
	test("a fresh open entry renders the hero surface", () => {
		expect(resolvePublicEntrySurface(baseInputs)).toBe("open-entry");
	});

	test("an admitted active session stays on the open-entry surface that mounts its real stage", () => {
		// The regression: a started/restored playable session was dropped back
		// onto the hero because the open-entry branch passed session=null.
		// The surface must stay open-entry so the branch that forwards the
		// capability and frozen snapshot renders.
		expect(
			resolvePublicEntrySurface({ ...baseInputs, session }),
		).toBe("open-entry");
	});

	test("an unresolved session outcome or snapshot waits in recovery-loading", () => {
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				recoveredLoaded: false,
				session,
			}),
		).toBe("recovery-loading");
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				session,
				snapshotLoaded: false,
			}),
		).toBe("recovery-loading");
	});

	test("a completed stored session recovers its result, including after closure", () => {
		const closedInputs = {
			...baseInputs,
			entryState: "revoked" as const,
			hasRecoveredOutcome: true,
			session,
		};
		expect(resolvePublicEntrySurface(closedInputs)).toBe("recovered-result");
	});

	test("an explicit Finish wins over a late reactive recovery", () => {
		// The regression: the recovered-result branch overrode the completion
		// surface once the reactive outcome caught up after Hoàn tất.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				collected: true,
				hasRecoveredOutcome: true,
				session,
			}),
		).toBe("complete");
		// Finish before the reactive query delivered stays complete too.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				collected: true,
				recoveredLoaded: false,
				session,
			}),
		).toBe("complete");
	});

	test("a claimed stored result waits visibly for its private claim detail", () => {
		// Scenario 518: the result is known but the code/instructions query is
		// still in flight — wait with a visible loading state, then render.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasRecoveredOutcome: true,
				recoveredClaimLoaded: false,
				recoveredNeedsClaimDetail: true,
				session,
			}),
		).toBe("recovery-claim-loading");
		// A fresh local claim response keeps the result immediately usable.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasRecoveredOutcome: true,
				recoveredClaimLoaded: false,
				recoveredNeedsClaimDetail: true,
				session,
			}).valueOf(),
		).toBe("recovery-claim-loading");
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasRecoveredOutcome: true,
				recoveredClaimLoaded: true,
				recoveredNeedsClaimDetail: true,
				session,
			}),
		).toBe("recovered-result");
		// Unclaimed rewards and no-reward results need no detail wait.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasRecoveredOutcome: true,
				recoveredNeedsClaimDetail: false,
				session,
			}),
		).toBe("recovered-result");
	});

	test("a viewed saved award waits for result, snapshot and claimed detail", () => {
		expect(
			resolvePublicEntrySurface({ ...baseInputs, viewing, viewingLoaded: false }),
		).toBe("viewing-loading");
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				viewing,
				viewingNeedsDetail: true,
			}),
		).toBe("viewing-loading");
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				viewing,
				viewingClaimLoaded: true,
				viewingNeedsDetail: true,
			}),
		).toBe("viewing-unavailable");
		// A claim detail alone is not a result: without the outcome the
		// capability stays unavailable rather than half-rendered.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasViewingOutcome: true,
				viewing,
				viewingNeedsDetail: true,
			}),
		).toBe("viewing-loading");
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasViewingOutcome: true,
				viewing,
				viewingClaimLoaded: true,
				viewingNeedsDetail: true,
			}),
		).toBe("viewing-result");
	});

	test("a viewed reward without claimed-detail need renders as soon as outcome and snapshot land", () => {
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				hasViewingOutcome: true,
				viewing,
			}),
		).toBe("viewing-result");
	});

	test("an invalid or unavailable viewed capability fails closed with a return path", () => {
		// The viewed capability resolved but holds no recoverable result: the
		// surface is the explicit unavailable shell, never the open entry.
		expect(resolvePublicEntrySurface({ ...baseInputs, viewing })).toBe(
			"viewing-unavailable",
		);
		// Viewing precedes the explicit Finish, so no null-viewed result can
		// fall through into active-session operations either.
		expect(
			resolvePublicEntrySurface({
				...baseInputs,
				collected: true,
				session,
				viewing,
			}),
		).toBe("viewing-unavailable");
	});

	test("closed or revoked entries still block new plays while recovery state resolves", () => {
		expect(
			resolvePublicEntrySurface({ ...baseInputs, entryState: "closed" }),
		).toBe("closed-entry");
		// An entry that has not delivered yet keeps the loading surface.
		expect(
			resolvePublicEntrySurface({ ...baseInputs, entryLoaded: false }),
		).toBe("entry-loading");
		expect(
			resolvePublicEntrySurface({ ...baseInputs, sessionReady: false }),
		).toBe("entry-loading");
	});

	test("an invalid share code renders the invalid-link surface before everything else", () => {
		expect(
			resolvePublicEntrySurface({ ...baseInputs, normalizedShareCode: null }),
		).toBe("invalid-link");
	});
});

describe("next-play eligibility", () => {
	const entry = {
		availability: { soldOut: false },
		game: { selfServe: true },
		state: "open",
		viewer: { canPlay: true },
	};

	test("an eligible open entry allows next play", () => {
		expect(isNextPlayEligible(entry)).toBe(true);
	});
	test("non-self-serve, sold-out, closed and viewer-ineligible entries suppress it", () => {
		expect(
			isNextPlayEligible({ ...entry, game: { selfServe: false } }),
		).toBe(false);
		expect(
			isNextPlayEligible({
				...entry,
				availability: { soldOut: true },
			}),
		).toBe(false);
		expect(isNextPlayEligible({ ...entry, state: "revoked" })).toBe(false);
		expect(
			isNextPlayEligible({ ...entry, viewer: { canPlay: false } }),
		).toBe(false);
		expect(isNextPlayEligible({ ...entry, viewer: null })).toBe(false);
		expect(isNextPlayEligible(null)).toBe(false);
	});
});

describe("raw-versus-retained reconciliation at the component call site", () => {
	// These fixtures mirror the exact raw query shapes the parent component
	// receives (null while delivered-and-empty, undefined while loading) plus
	// its per-capability retained action/claim responses.
	const claimCache = new Map([["current", { instructions: "Hướng dẫn", secretCode: "CODE-525" }]]);
	const rawBase = {
		actionResults: new Map() as Map<string, { canClaim: boolean; kind: string; label: string; rewardType: string }>,
		claimResults: new Map(),
		collected: false,
		entryLoaded: true,
		entryState: "open" as const,
		normalizedShareCode: "abcdefghjkmnpqrstuvwxy",
		recovered: null,
		recoveredClaim: null,
		session: null,
		sessionReady: true,
		sessionSnapshot: { rules: { templateId: "lucky-wheel" } },
		viewing: null,
		viewingClaim: null,
		viewingOutcome: null,
		viewingSnapshot: { rules: { templateId: "lucky-wheel" } },
	};

	test("scenario 524: a retained result survives entry closure during reactive lag", () => {
		const raw = {
			...rawBase,
			actionResults: new Map([
				["current", { canClaim: true, kind: "reward", label: "Voucher", rewardType: "voucher" }],
			]),
			entryState: "revoked" as const,
			recovered: null,
			session: { sessionId: "current" },
		};
		const surface = resolvePublicEntrySurface(buildSurfaceInputs(raw));
		expect(surface).toBe("recovered-result");
		// The stage payload is the retained result; the entry is never re-opened
		// for a new admission by this path (openEntry stays separate).
		const recovery = deriveCapabilityRecovery({
			actionResults: raw.actionResults,
			capability: raw.session,
			claimResults: raw.claimResults,
			rawClaim: raw.recoveredClaim,
			rawOutcome: raw.recovered,
		});
		expect(recovery.payload).toEqual({
			outcome: { canClaim: true, kind: "reward", label: "Voucher", rewardType: "voucher" },
		});
	});

	test("scenario 525: a retained current claim keeps code and Finish after a saved-view detour", () => {
		const raw = {
			...rawBase,
			actionResults: new Map([
				["current", { canClaim: false, kind: "reward", label: "Voucher", rewardType: "voucher" }],
			]),
			claimResults: claimCache,
			entryState: "open" as const,
			recovered: null,
			recoveredClaim: undefined,
			session: { sessionId: "current" },
		};
		const inputs = buildSurfaceInputs(raw);
		expect(resolvePublicEntrySurface(inputs)).toBe("recovered-result");
		// The claim detail wait is satisfied by the retained response.
		expect(inputs.recoveredClaimLoaded).toBe(true);
		expect(inputs.recoveredNeedsClaimDetail).toBe(false);
		const recovery = deriveCapabilityRecovery({
			actionResults: raw.actionResults,
			capability: raw.session,
			claimResults: raw.claimResults,
			rawClaim: raw.recoveredClaim,
			rawOutcome: raw.recovered,
		});
		expect(recovery.claimPayload).toEqual({
			claim: { instructions: "Hướng dẫn", secretCode: "CODE-525" },
		});
	});

	test("raw delivered data still wins and loading snapshots still wait", () => {
		const raw = {
			...rawBase,
			actionResults: new Map([
				["current", { canClaim: true, kind: "no-reward", label: "Chưa có", rewardType: "none" }],
			]),
			recovered: {
				outcome: { canClaim: false, kind: "reward", label: "Trục thưởng", rewardType: "cash" },
			},
			// The claim query is still in flight (undefined), so the claimed
			// result waits visibly for its private detail.
			recoveredClaim: undefined,
			session: { sessionId: "current" },
		};
		const inputs = buildSurfaceInputs(raw);
		expect(resolvePublicEntrySurface(inputs)).toBe("recovery-claim-loading");
		// The reactive outcome outranks the retained one for the rendered label.
		const recovery = deriveCapabilityRecovery({
			actionResults: raw.actionResults,
			capability: raw.session,
			claimResults: raw.claimResults,
			rawClaim: raw.recoveredClaim,
			rawOutcome: raw.recovered,
		});
		expect(recovery.payload?.outcome.label).toBe("Trục thưởng");
		// Snapshot still pending: recovery wait precedes every result surface.
		expect(
			resolvePublicEntrySurface({
				...inputs,
				recoveredClaimLoaded: true,
				snapshotLoaded: false,
			}),
		).toBe("recovery-loading");
	});

	test("results are never assigned across capabilities", () => {
		const raw = {
			...rawBase,
			actionResults: new Map([
				["other-session", { canClaim: true, kind: "reward", label: "Không của tôi", rewardType: "voucher" }],
			]),
			recovered: null,
			session: { sessionId: "current" },
		};
		const inputs = buildSurfaceInputs(raw);
		expect(resolvePublicEntrySurface(inputs)).toBe("open-entry");
		expect(inputs.hasRecoveredOutcome).toBe(false);
	});
});

describe("saved reward row collection", () => {
	const entries = [
		{ sessionId: "s-1", sessionToken: "t-1" },
		{ sessionId: "s-2", sessionToken: "t-2" },
		{ sessionId: "s-3", sessionToken: "t-3" },
		{ sessionId: "s-4", sessionToken: "t-4" },
	];
	const reward = { kind: "reward", label: "Voucher quà", secretCode: "CODE-1" };
	const summaries = [
		{ claimed: true, outcome: reward, status: "completed" },
		{ claimed: false, outcome: { kind: "reward", label: "Voucher chờ" }, status: "completed" },
		{ status: "invalid" },
		{
			claimed: false,
			outcome: { kind: "no-reward", label: "Chưa có" },
			status: "completed",
		},
	];

	test("only completed sessions with actual rewards become rows", () => {
		const rows = collectSavedRewardRows(entries, summaries);
		expect(rows).toEqual([
			{
				claimed: true,
				label: "Voucher quà",
				secretCode: "CODE-1",
				sessionId: "s-1",
				sessionToken: "t-1",
			},
			{
				claimed: false,
				label: "Voucher chờ",
				secretCode: null,
				sessionId: "s-2",
				sessionToken: "t-2",
			},
		]);
	});

	test("loading and none-only history produce no rows, so no reward heading renders", () => {
		expect(collectSavedRewardRows(entries, null)).toEqual([]);
		const noneOnly = collectSavedRewardRows([entries[3]], [
			{
				claimed: false,
				outcome: { kind: "no-reward", label: "Chưa có" },
				status: "completed",
			},
		]);
		expect(noneOnly).toEqual([]);
	});

	test("rows keep their stored capability for reopening the exact award", () => {
		const rows = collectSavedRewardRows([entries[0]], [
			{ claimed: false, outcome: reward, status: "completed" },
		]);
		// Unclaimed rewards never invent a private code from catalog data.
		expect(rows[0].secretCode).toBeNull();
		expect(rows[0].sessionToken).toBe("t-1");
	});
});
