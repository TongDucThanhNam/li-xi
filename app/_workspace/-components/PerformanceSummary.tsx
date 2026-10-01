import { FunnelBars } from "@/app/_workspace/-components/FunnelBars";
import { conversionRate, formatPercent, type FunnelCounts } from "@/lib/campaignMetrics";

const viNumberFormat = new Intl.NumberFormat("vi-VN");

/**
 * Performance card body (§11.5.1): the conversion KPI on the left and the
 * funnel steps as bars next to it from 48rem. Extracted verbatim from the
 * campaign overview so both it and the analytics funnel card share one DOM.
 */
export function PerformanceSummary({
	funnelLabel,
	metrics,
}: {
	funnelLabel: string;
	metrics: FunnelCounts;
}) {
	return (
		<div className="admin-perf">
			<div className="admin-perf__kpi">
				<p className="text-4xl font-semibold tracking-tight tabular-nums text-foreground">
					{formatPercent(conversionRate(metrics))}
				</p>
				<p className="text-sm font-medium text-foreground">Tỉ lệ chuyển đổi</p>
				<p className="text-xs leading-4 text-muted">
					{viNumberFormat.format(metrics.claims)} nhận thưởng /{" "}
					{viNumberFormat.format(metrics.opens)} lượt mở
				</p>
			</div>
			<FunnelBars
				label={funnelLabel}
				steps={[
					{ label: "Lượt mở", value: metrics.opens },
					{ label: "Bắt đầu chơi", value: metrics.starts },
					{ label: "Hoàn tất", value: metrics.completions },
					{ label: "Nhận thưởng", value: metrics.claims },
				]}
			/>
		</div>
	);
}
