import { describe, expect, test } from "vitest";
import {
	recoveredOutcomeKey,
	shouldAdoptRecoveredClaim,
	shouldAdoptRecoveredOutcome,
} from "./recoveryPolicy";

describe("recovered session reconciliation", () => {
	const rewardOutcome = {
		kind: "reward" as const,
		rewardType: "voucher" as const,
		label: "Voucher 100k",
		amount: null,
		canClaim: true,
		segmentKey: "item-1",
	};
	const noRewardOutcome = {
		kind: "no-reward" as const,
		rewardType: "none" as const,
		label: "Cảm ơn bạn đã đồng hành!",
		amount: null,
		canClaim: false,
		segmentKey: "__no-reward__",
	};

	test("outcome keys are stable per segment/label pair", () => {
		expect(recoveredOutcomeKey(rewardOutcome)).toBe("item-1::Voucher 100k");
		expect(recoveredOutcomeKey(noRewardOutcome)).toBe("__no-reward__::Cảm ơn bạn đã đồng hành!");
		expect(recoveredOutcomeKey(null)).toBe("");
	});

	test("delayed recovery adopts when nothing was played locally", () => {
		expect(
			shouldAdoptRecoveredOutcome({
				localOutcome: null,
				incoming: rewardOutcome,
				appliedKey: "",
			}),
		).toBe(true);
	});

	test("recovery never overwrites a locally played outcome", () => {
		expect(
			shouldAdoptRecoveredOutcome({
				localOutcome: noRewardOutcome,
				incoming: rewardOutcome,
				appliedKey: "",
			}),
		).toBe(false);
	});

	test("a reactive recovery never interrupts an in-progress local play", () => {
		expect(
			shouldAdoptRecoveredOutcome({
				localOutcome: null,
				incoming: rewardOutcome,
				appliedKey: "",
				localPlayAttempted: true,
			}),
		).toBe(false);
	});

	test("the same recovery payload is not re-applied twice", () => {
		const appliedKey = recoveredOutcomeKey(rewardOutcome);
		expect(
			shouldAdoptRecoveredOutcome({
				localOutcome: null,
				incoming: rewardOutcome,
				appliedKey,
			}),
		).toBe(false);
	});

	test("claims adopt only for a known outcome and never overwrite newer local claims", () => {
		const claim = { label: "Voucher 100k", secretCode: "CODE-1" };
		expect(
			shouldAdoptRecoveredClaim({
				localOutcome: rewardOutcome,
				localClaim: null,
				incomingClaim: claim,
			}),
		).toBe(true);
		expect(
			shouldAdoptRecoveredClaim({
				localOutcome: null,
				localClaim: null,
				incomingClaim: claim,
			}),
		).toBe(false);
		expect(
			shouldAdoptRecoveredClaim({
				localOutcome: rewardOutcome,
				localClaim: claim,
				incomingClaim: { label: "old", secretCode: "OLD" },
			}),
		).toBe(false);
	});
});
