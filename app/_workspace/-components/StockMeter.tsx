import { ProgressBar } from "@heroui/react";
import type { ReactNode } from "react";
import type { InventoryRewardType } from "@/lib/rewardInventoryForm";

/** Remaining-share tone (§11.4.3): danger at or below 10%, warning at or
 * below 25%, otherwise success. */
export function stockTone(percent: number): "danger" | "success" | "warning" {
	return percent <= 10 ? "danger" : percent <= 25 ? "warning" : "success";
}

/** Reward type label map (§11.6.1): shared with the operate pages, which
 * name each stock row's type next to its meter. */
export const rewardTypeLabels: Record<InventoryRewardType, string> = {
	cash: "Tiền mặt",
	voucher: "Voucher / mã quà",
	physical: "Quà tặng",
	points: "Điểm",
};

/**
 * Remaining-stock bar (§11.4.3): the count next to the bar, tone follows the
 * remaining share. Moved out of RewardInventoryPanel so the operate pages
 * reuse the same markup.
 */
export function StockMeter({
	ariaLabel,
	remaining,
	total,
}: {
	ariaLabel: string;
	remaining: number;
	total: number;
}) {
	const percent = total > 0 ? (remaining / total) * 100 : 0;
	const tone = stockTone(percent);
	return (
		<div className="admin-stock">
			<span className="admin-stock__label">
				Còn lại{" "}
				<span className="admin-stock__value">
					{remaining.toLocaleString("vi-VN")}/{total.toLocaleString("vi-VN")}
				</span>
			</span>
			<ProgressBar aria-label={ariaLabel} color={tone} size="sm" value={percent}>
				<ProgressBar.Track>
					<ProgressBar.Fill />
				</ProgressBar.Track>
			</ProgressBar>
		</div>
	);
}

/**
 * Budget meter (§11.4.4): the remaining-over-total bar with the spent note.
 * `remaining`/`total`/`note` are nodes so callers keep their own formatters;
 * the bar tone follows `stockTone(percent)`.
 */
export function BudgetMeter({
	label,
	note,
	percent,
	progressLabel,
	remaining,
	total,
}: {
	label: ReactNode;
	note?: ReactNode;
	percent: number;
	progressLabel: string;
	remaining: ReactNode;
	total: ReactNode;
}) {
	return (
		<div className="admin-budget">
			<p className="admin-budget__label">{label}</p>
			<p className="admin-budget__figures">
				<span className="admin-budget__value">{remaining}</span>
				{/* Same text-node split ("/" then " ") as the inline markup this
				    replaced, so the serialized DOM is unchanged. */}
				<span className="admin-budget__total">{"/"}{" "}{total}</span>
			</p>
			<ProgressBar aria-label={progressLabel} color={stockTone(percent)} size="md" value={percent}>
				<ProgressBar.Track>
					<ProgressBar.Fill />
				</ProgressBar.Track>
			</ProgressBar>
			{note ? <p className="admin-budget__note">{note}</p> : null}
		</div>
	);
}
