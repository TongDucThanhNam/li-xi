import { describe, expect, test } from "vitest";
import { conversionRate, formatPercent, groupRowsByCampaign, sumFunnelRows } from "./campaignMetrics";

describe("sumFunnelRows", () => {
	test("an empty list sums to zeros", () => {
		expect(sumFunnelRows([])).toEqual({
			opens: 0,
			starts: 0,
			completions: 0,
			rewardOutcomes: 0,
			claims: 0,
		});
	});

	test("rows sum field by field", () => {
		expect(
			sumFunnelRows([
				{ opens: 26, starts: 26, completions: 22, rewardOutcomes: 22, claims: 20 },
				{ opens: 52, starts: 40, completions: 36, rewardOutcomes: 36, claims: 34 },
				{ opens: 0, starts: 0, completions: 0, rewardOutcomes: 0, claims: 0 },
			]),
		).toEqual({
			opens: 78,
			starts: 66,
			completions: 58,
			rewardOutcomes: 58,
			claims: 54,
		});
	});
});

describe("conversionRate", () => {
	test("zero opens convert to null", () => {
		expect(conversionRate({ opens: 0, claims: 0 })).toBeNull();
	});

	test("claims / opens", () => {
		expect(conversionRate({ opens: 120, claims: 78 })).toBeCloseTo(0.65);
	});
});

describe("formatPercent", () => {
	test("null renders an em dash", () => {
		expect(formatPercent(null)).toBe("—");
	});

	test("vi-VN percent with 0 decimals", () => {
		expect(formatPercent(0.65)).toBe("65%");
		expect(formatPercent(0.5)).toBe("50%");
		expect(formatPercent(0)).toBe("0%");
	});
});

describe("groupRowsByCampaign", () => {
	test("groups rows by campaignId and preserves row order", () => {
		const rows = [
			{ campaignId: "a", opens: 1 },
			{ campaignId: "b", opens: 2 },
			{ campaignId: "a", opens: 3 },
		];
		const groups = groupRowsByCampaign(rows);
		expect(groups.size).toBe(2);
		expect(groups.get("a")).toEqual([
			{ campaignId: "a", opens: 1 },
			{ campaignId: "a", opens: 3 },
		]);
		expect(groups.get("b")).toEqual([{ campaignId: "b", opens: 2 }]);
	});

	test("an empty list yields an empty map", () => {
		expect(groupRowsByCampaign([]).size).toBe(0);
	});
});
