/**
 * Deterministic reconciliation rules for restored completed sessions.
 * Extracted as pure logic so delayed recovery arrivals can be unit-tested
 * without a DOM, while the actual stages consume these helpers.
 */

export type RecoveredOutcomeLike = {
	label: string;
	segmentKey: string | null;
} | null | undefined;

export type RecoveredClaimLike = {
	secretCode: string | null;
	label: string;
} | null | undefined;

export function recoveredOutcomeKey(outcome: RecoveredOutcomeLike): string {
	if (!outcome) {
		return "";
	}
	return `${outcome.segmentKey ?? ""}::${outcome.label}`;
}

/**
 * Adopt a recovered outcome only when nothing has been played locally in
 * this session and the same recovery has not already been applied. A local
 * play attempt (even while its animation is still running) always wins over
 * a reactive recovery update so the running spin/reveal finishes naturally.
 */
export function shouldAdoptRecoveredOutcome(args: {
	localOutcome: RecoveredOutcomeLike;
	incoming: RecoveredOutcomeLike;
	appliedKey: string;
	localPlayAttempted?: boolean;
}): boolean {
	if (!args.incoming) {
		return false;
	}
	if (args.localPlayAttempted) {
		return false;
	}
	if (args.localOutcome) {
		return false;
	}
	const incomingKey = recoveredOutcomeKey(args.incoming);
	return incomingKey !== "" && incomingKey !== args.appliedKey;
}

/**
 * Adopt a recovered claim only for the locally-known outcome, and never
 * overwrite a newer local claim (e.g. from a live claim action).
 */
export function shouldAdoptRecoveredClaim(args: {
	localOutcome: RecoveredOutcomeLike;
	localClaim: RecoveredClaimLike;
	incomingClaim: RecoveredClaimLike;
}): boolean {
	if (!args.incomingClaim) {
		return false;
	}
	if (!args.localOutcome) {
		return false;
	}
	if (args.localClaim) {
		return false;
	}
	return true;
}
