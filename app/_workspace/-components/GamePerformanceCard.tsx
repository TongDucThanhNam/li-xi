"use client";

import { Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { conversionRate, formatPercent } from "@/lib/campaignMetrics";

const viNumberFormat = new Intl.NumberFormat("vi-VN");

const sectionActionLinkClass =
	"inline-flex items-center gap-1 rounded-sm text-sm font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * Per-game performance side card (§11.6.1): the editor's "Hiệu quả" widget
 * as one shared component, also used by the operate pages. Owns the
 * campaign breakdown query and renders nothing while it loads.
 */
export function GamePerformanceCard({ campaignGameId, campaignId, className }: {
	campaignGameId: string;
	campaignId: string;
	className?: string;
}) {
	const breakdown = useQuery(api.analytics.getCampaignGameBreakdown, {
		campaignId: campaignId as Id<"campaigns">,
	});
	if (breakdown === undefined) {
		return null;
	}
	const breakdownRow = breakdown.rows.find((row) => row.campaignGameId === campaignGameId);
	return (
		<Widget className={className}>
			<Widget.Header>
				<Widget.Title>Hiệu quả</Widget.Title>
				<Link
					className={sectionActionLinkClass}
					search={{ campaign: campaignId, view: "games" }}
					to="/analytics"
				>
					Xem phân tích
					<ArrowRight aria-hidden="true" size={14} />
				</Link>
			</Widget.Header>
			<Widget.Content>
				{breakdownRow === undefined || (breakdownRow.opens === 0 && breakdownRow.starts === 0) ? (
					<p className="text-sm text-muted">Chưa có lượt chơi.</p>
				) : (
					<dl className="admin-kv">
						<div>
							<dt>Lượt mở</dt>
							<dd>{viNumberFormat.format(breakdownRow.opens)}</dd>
						</div>
						<div>
							<dt>Bắt đầu chơi</dt>
							<dd>{viNumberFormat.format(breakdownRow.starts)}</dd>
						</div>
						<div>
							<dt>Hoàn tất</dt>
							<dd>{viNumberFormat.format(breakdownRow.completions)}</dd>
						</div>
						<div>
							<dt>Nhận thưởng</dt>
							<dd>{viNumberFormat.format(breakdownRow.claims)}</dd>
						</div>
						<div>
							<dt>Chuyển đổi</dt>
							<dd>{formatPercent(conversionRate(breakdownRow))}</dd>
						</div>
					</dl>
				)}
			</Widget.Content>
		</Widget>
	);
}
