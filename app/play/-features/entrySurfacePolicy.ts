/**
 * Deterministic parent-navigation policy for the public share entry. This is
 * the actual branch decision consumed by PublicShareEntryFeature — extracted
 * as pure logic so every ordered participant transition (active-session
 * mounting, Finish precedence, saved-reward viewing, closed entries) can be
 * unit-tested without a DOM.
 */

/** Structural outcome/claim shapes shared by raw queries and cached responses. */
export type OutcomeLike = {
	kind?: string;
	rewardType?: string;
	canClaim?: boolean;
} | null | undefined;
export type ClaimLike = { secretCode?: string | null } | null | undefined;
export type OutcomePayloadLike = { outcome: OutcomeLike } | null | undefined;
export type ClaimPayloadLike = { claim: ClaimLike } | null | undefined;

/**
 * A claimed (or otherwise unclaimable) reward outcome needs its immutable
 * claim detail rendered; engagement/no-reward and still-claimable outcomes
 * do not.
 */
export function needsClaimDetail(outcome: OutcomeLike): boolean {
	return Boolean(outcome && outcome.canClaim === false && outcome.rewardType !== "none");
}

export type DerivedRecoveryState<O extends OutcomeLike, C extends ClaimLike> = {
	/** A raw or retained successful result exists for this capability. */
	hasOutcome: boolean;
	/** Result payload for stage props (raw first, retained during lag). */
	payload: { outcome: O } | null;
	/** Claim payload for stage props (raw first, retained during lag). */
	claimPayload: { claim: C } | null;
	needsClaimDetail: boolean;
	claimLoaded: boolean;
};

/**
 * Reconcile RAW reactive query data with RETAINED successful action
 * responses for one capability. A cached response is authoritative evidence
 * of this client's completed server action, so it fills raw query gaps
 * (delayed delivery, closure during lag) without ever being assigned to a
 * different capability.
 */
export function deriveCapabilityRecovery<
	O extends OutcomeLike,
	C extends ClaimLike,
>(args: {
	capability: { sessionId: string } | null;
	rawOutcome: { outcome: O } | null | undefined;
	rawClaim: { claim: C } | null | undefined;
	actionResults: ReadonlyMap<string, O>;
	claimResults: ReadonlyMap<string, C>;
}): DerivedRecoveryState<O, C> {
	const retainedOutcome = args.capability
		? (args.actionResults.get(args.capability.sessionId) ?? null)
		: null;
	const retainedClaim = args.capability
		? (args.claimResults.get(args.capability.sessionId) ?? null)
		: null;
	const outcome = args.rawOutcome?.outcome ?? retainedOutcome;
	return {
		hasOutcome: Boolean(outcome),
		payload: args.rawOutcome?.outcome
			? args.rawOutcome
			: retainedOutcome
				? { outcome: retainedOutcome }
				: null,
		claimPayload: args.rawClaim ?? (retainedClaim ? { claim: retainedClaim } : null),
		needsClaimDetail: needsClaimDetail(outcome) && !retainedClaim,
		claimLoaded: args.rawClaim !== undefined || Boolean(retainedClaim),
	};
}

export type SurfaceInputs = {
	normalizedShareCode: string | null;
	sessionReady: boolean;
	collected: boolean;
	session: { sessionId: string } | null;
	viewing: { sessionId: string } | null;
	/** Reactive outcome query for the stored session has delivered. */
	recoveredLoaded: boolean;
	hasRecoveredOutcome: boolean;
	/** Admission snapshot query for the stored session has delivered. */
	snapshotLoaded: boolean;
	/** Both viewed queries (outcome + snapshot) have delivered. */
	viewingLoaded: boolean;
	hasViewingOutcome: boolean;
	/** A claimed viewed reward still needs its immutable claim detail. */
	viewingNeedsDetail: boolean;
	viewingClaimLoaded: boolean;
	/** The stored session's recovered outcome is a claimed reward. */
	recoveredNeedsClaimDetail: boolean;
	recoveredClaimLoaded: boolean;
	entryLoaded: boolean;
	entryState: "open" | "invalid" | "revoked" | "closed" | undefined;
};

export type EntrySurface =
	| "invalid-link"
	| "viewing-loading"
	| "viewing-result"
	| "viewing-unavailable"
	| "complete"
	| "recovery-loading"
	| "recovery-claim-loading"
	| "recovered-result"
	| "entry-loading"
	| "closed-entry"
	| "open-entry";

/**
 * Branch precedence (verified against the reproduced regressions):
 * invalid link → viewed saved award (loading, result, unavailable) → the
 * participant's explicit Finish → session recovery (pending, then result) →
 * entry loading → closed entries → open entry. A recovered result must never
 * override an explicit completed/exit state, and an unavailable viewed
 * capability must never fall through into active-session operations.
 */
export type RawEntryState = {
	normalizedShareCode: string | null;
	sessionReady: boolean;
	collected: boolean;
	session: { sessionId: string } | null;
	viewing: { sessionId: string } | null;
	recovered: OutcomePayloadLike;
	recoveredClaim: ClaimPayloadLike;
	sessionSnapshot: unknown;
	viewingOutcome: OutcomePayloadLike;
	viewingClaim: ClaimPayloadLike;
	viewingSnapshot: unknown;
	actionResults: ReadonlyMap<string, OutcomeLike>;
	claimResults: ReadonlyMap<string, ClaimLike>;
	entryLoaded: boolean;
	entryState: "open" | "invalid" | "revoked" | "closed" | undefined;
};

/**
 * Build the resolver inputs from the component's raw query/state values —
 * the exact call site contract — reconciling raw-versus-retained knowledge
 * before any branch decision is made.
 */
export function buildSurfaceInputs(raw: RawEntryState): SurfaceInputs {
	const sessionRecovery = deriveCapabilityRecovery({
		actionResults: raw.actionResults,
		capability: raw.session,
		claimResults: raw.claimResults,
		rawClaim: raw.recoveredClaim,
		rawOutcome: raw.recovered,
	});
	const viewingRecovery = deriveCapabilityRecovery({
		actionResults: raw.actionResults,
		capability: raw.viewing,
		claimResults: raw.claimResults,
		rawClaim: raw.viewingClaim,
		rawOutcome: raw.viewingOutcome,
	});
	return {
		collected: raw.collected,
		entryLoaded: raw.entryLoaded,
		entryState: raw.entryState,
		hasRecoveredOutcome: sessionRecovery.hasOutcome,
		hasViewingOutcome: viewingRecovery.hasOutcome,
		normalizedShareCode: raw.normalizedShareCode,
		recoveredClaimLoaded: sessionRecovery.claimLoaded,
		recoveredLoaded: raw.recovered !== undefined,
		recoveredNeedsClaimDetail: sessionRecovery.needsClaimDetail,
		session: raw.session,
		sessionReady: raw.sessionReady,
		snapshotLoaded: raw.sessionSnapshot !== undefined,
		viewing: raw.viewing,
		viewingClaimLoaded: viewingRecovery.claimLoaded,
		viewingLoaded: raw.viewingOutcome !== undefined && raw.viewingSnapshot !== undefined,
		viewingNeedsDetail: viewingRecovery.needsClaimDetail,
	};
}

export function resolvePublicEntrySurface(inputs: SurfaceInputs): EntrySurface {
	if (!inputs.normalizedShareCode) {
		return "invalid-link";
	}
	if (inputs.viewing) {
		if (
			!inputs.viewingLoaded ||
			(inputs.viewingNeedsDetail && !inputs.viewingClaimLoaded)
		) {
			return "viewing-loading";
		}
		return inputs.hasViewingOutcome ? "viewing-result" : "viewing-unavailable";
	}
	if (inputs.collected) {
		return "complete";
	}
	if (inputs.session && (!inputs.recoveredLoaded || !inputs.snapshotLoaded)) {
		return "recovery-loading";
	}
	if (
		inputs.session &&
		inputs.hasRecoveredOutcome &&
		inputs.recoveredNeedsClaimDetail &&
		!inputs.recoveredClaimLoaded
	) {
		// The result is known but its private code/instructions are still in
		// flight: wait visibly instead of implying no code exists.
		return "recovery-claim-loading";
	}
	if (inputs.session && inputs.hasRecoveredOutcome) {
		return "recovered-result";
	}
	if (!inputs.entryLoaded || !inputs.sessionReady) {
		return "entry-loading";
	}
	if (inputs.entryState !== "open") {
		return "closed-entry";
	}
	return "open-entry";
}

/** Minimal open-entry facts the eligibility predicate needs. */
export type NextPlayEntryLike = {
	state: string;
	game: { selfServe: boolean };
	availability: { soldOut: boolean };
	viewer: { canPlay?: boolean } | null;
};

/**
 * Coherent next-play eligibility, shared by every completion/recovery
 * surface: self-serve links only, capacity remaining, and the viewer still
 * permitted (per-participant limit not exhausted).
 */
export function isNextPlayEligible(entry: NextPlayEntryLike | null): boolean {
	return Boolean(
		entry &&
			entry.state === "open" &&
			entry.game.selfServe &&
			!entry.availability.soldOut &&
			entry.viewer?.canPlay === true,
	);
}

export type SavedSummaryLike = {
	status: string;
	claimed?: boolean;
	outcome?: { kind: string; label: string; secretCode?: string | null } | null;
};

export type SavedRewardRow = {
	sessionId: string;
	sessionToken: string;
	label: string;
	claimed: boolean;
	secretCode: string | null;
};

/**
 * Collect the renderable saved-reward rows for one bounded chunk: only
 * completed sessions with an actual reward outcome. None-only, invalid or
 * still-active capabilities never produce rows (and therefore never a reward
 * heading). `summaries` aligns by index with `entries`.
 */
export function collectSavedRewardRows(
	entries: Array<{ sessionId: string; sessionToken: string }>,
	summaries: SavedSummaryLike[] | null,
): SavedRewardRow[] {
	if (!summaries) {
		return [];
	}
	const rows: SavedRewardRow[] = [];
	entries.forEach((entry, index) => {
		const summary = summaries[index];
		if (
			!summary ||
			summary.status !== "completed" ||
			!summary.outcome ||
			summary.outcome.kind !== "reward"
		) {
			return;
		}
		rows.push({
			claimed: summary.claimed === true,
			label: summary.outcome.label,
			secretCode: summary.claimed === true ? (summary.outcome.secretCode ?? null) : null,
			sessionId: entry.sessionId,
			sessionToken: entry.sessionToken,
		});
	});
	return rows;
}
