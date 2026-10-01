/**
 * Funnel math shared by the campaign index cards, the overview dashboard and
 * the analytics views (workspace UX redesign §11.1, R2/R5).
 */

export type FunnelCounts = {
	opens: number;
	starts: number;
	completions: number;
	rewardOutcomes: number;
	claims: number;
};

export function sumFunnelRows(rows: FunnelCounts[]): FunnelCounts {
	const total: FunnelCounts = { opens: 0, starts: 0, completions: 0, rewardOutcomes: 0, claims: 0 };
	for (const row of rows) {
		total.opens += row.opens;
		total.starts += row.starts;
		total.completions += row.completions;
		total.rewardOutcomes += row.rewardOutcomes;
		total.claims += row.claims;
	}
	return total;
}

/** claims / opens, null when opens is 0 (same rule as convex funnelConversion). */
export function conversionRate(counts: { opens: number; claims: number }): number | null {
	if (counts.opens === 0) return null;
	return counts.claims / counts.opens;
}

/** vi-VN percent, 0 decimals ("65%"); "—" for null. */
export function formatPercent(rate: number | null): string {
	if (rate === null) return "—";
	return new Intl.NumberFormat("vi-VN", {
		maximumFractionDigits: 0,
		style: "percent",
	}).format(rate);
}

export function groupRowsByCampaign<T extends { campaignId: string }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const group = groups.get(row.campaignId);
		if (group) {
			group.push(row);
		} else {
			groups.set(row.campaignId, [row]);
		}
	}
	return groups;
}
