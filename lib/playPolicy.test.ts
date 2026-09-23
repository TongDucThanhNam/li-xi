import { describe, expect, test } from "vitest";
import {
	generateShareCode,
	NO_REWARD_OPTION_KEY,
	normalizeShareCode,
	rewardOutcomeLabel,
	selectWeightedOption,
	secureRandomInt,
	sanitizeProvidedName,
	totalSelectionWeight,
} from "./playPolicy";

describe("share code policy", () => {
	test("generated share codes normalize round-trip and reject malformed input", () => {
		const shareCode = generateShareCode();
		expect(shareCode).toHaveLength(22);
		expect(normalizeShareCode(shareCode)).toBe(shareCode);
		expect(normalizeShareCode(`  ${shareCode.toUpperCase()} `)).toBe(shareCode);
		expect(normalizeShareCode("not-a-code")).toBeNull();
		expect(normalizeShareCode("a".repeat(21))).toBeNull();
		expect(normalizeShareCode("aaaaa.aaaa.aaaa.aaaa.aaa")).toBeNull();
	});
});

describe("provided participant details", () => {
	test("display names are sanitized and capped, never required", () => {
		expect(sanitizeProvidedName(undefined)).toBeUndefined();
		expect(sanitizeProvidedName("   ")).toBeUndefined();
		expect(sanitizeProvidedName("  Nguyễn   Văn  A  ")).toBe("Nguyễn Văn A");
		expect(sanitizeProvidedName("x".repeat(80))).toHaveLength(48);
	});
});

describe("weighted reward selection", () => {
	const options = [
		{ key: "cash-50k", weight: 2 },
		{ key: "voucher-a", weight: 1 },
	];

	test("total weight includes the configured no-reward entry", () => {
		expect(totalSelectionWeight(options, 1)).toBe(4);
		expect(totalSelectionWeight([], 3)).toBe(3);
		expect(() => totalSelectionWeight([{ key: "x", weight: -1 }], 1)).toThrow();
	});

	test("bounds are respected and no-reward key wins its slice", () => {
		expect(selectWeightedOption(options, 1, 0)?.key).toBe("cash-50k");
		expect(selectWeightedOption(options, 1, 1)?.key).toBe("cash-50k");
		expect(selectWeightedOption(options, 1, 2)?.key).toBe("voucher-a");
		expect(selectWeightedOption(options, 1, 3)?.key).toBe(NO_REWARD_OPTION_KEY);
		expect(() => selectWeightedOption(options, 1, 4)).toThrow();
		expect(() => selectWeightedOption(options, 1, -1)).toThrow();
	});

	test("empty pools with zero no-reward weight have no selectable option", () => {
		expect(selectWeightedOption([], 0, 0)).toBeNull();
	});
});

describe("secure randomness", () => {
	test("secureRandomInt stays in range", () => {
		for (let index = 0; index < 64; index += 1) {
			const value = secureRandomInt(5);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(5);
			expect(Number.isInteger(value)).toBe(true);
		}
		expect(() => secureRandomInt(0)).toThrow();
	});
});

describe("reward outcome labels", () => {
	test("cash and points append their value; other types use the name", () => {
		expect(
			rewardOutcomeLabel({ rewardType: "cash", name: "Tiền mặt", amount: 50000 }),
		).toBe("Tiền mặt 50000");
		expect(
			rewardOutcomeLabel({
				rewardType: "cash",
				name: "Tiền mặt",
				amount: 50000,
				formatCurrency: (value) => `${value.toLocaleString("vi-VN")}đ`,
			}),
		).toBe("Tiền mặt 50.000đ");
		expect(rewardOutcomeLabel({ rewardType: "points", name: "Điểm", amount: 10 })).toBe(
			"Điểm (10 điểm)",
		);
		expect(rewardOutcomeLabel({ rewardType: "voucher", name: "Voucher trà sữa" })).toBe(
			"Voucher trà sữa",
		);
		expect(rewardOutcomeLabel({ rewardType: "physical", name: "" })).toBe("Quà tặng");
	});
});
