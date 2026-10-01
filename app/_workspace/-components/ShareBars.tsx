import { formatPercent } from "@/lib/campaignMetrics";

const viNumberFormat = new Intl.NumberFormat("vi-VN");

export type ShareBarRow = {
	key: string;
	name: string;
	meta?: string | null;
	value: number;
	rate: number | null;
};

/**
 * Ranked share bars (§11.5.1): a soft bar behind each row shows its size
 * relative to the largest row, like a top-pages list in a web analytics
 * tool. Rows render in the order given; callers sort them.
 */
export function ShareBars({
	label,
	rateLabel,
	rows,
	valueLabel,
}: {
	label: string;
	rateLabel: string;
	rows: ShareBarRow[];
	valueLabel: string;
}) {
	const max = rows.reduce((largest, row) => Math.max(largest, row.value), 0);
	return (
		<div className="admin-share">
			<div aria-hidden="true" className="admin-share__head">
				<span />
				<span>{valueLabel}</span>
				<span>{rateLabel}</span>
			</div>
			<ol aria-label={label} className="admin-share__list">
				{rows.map((row) => {
					const width =
						row.value === 0 || max === 0 ? 0 : Math.max(2, (row.value / max) * 100);
					return (
						<li className="admin-share__row" key={row.key}>
							<span aria-hidden="true" className="admin-share__bar" style={{ width: `${width}%` }} />
							<span className="admin-share__name">
								<span className="admin-share__title">{row.name}</span>
								{row.meta ? <span className="admin-share__meta">{row.meta}</span> : null}
							</span>
							<span className="admin-share__value">
								{viNumberFormat.format(row.value)}
								<span className="sr-only"> {valueLabel.toLowerCase()}</span>
							</span>
							<span className="admin-share__rate">
								{formatPercent(row.rate)}
								<span className="sr-only"> {rateLabel.toLowerCase()}</span>
							</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

/** Inline rate bar for table cells (§11.5.1): a 12px track with the
 * percent right of it; null renders an empty track and "—". */
export function RateBar({ rate }: { rate: number | null }) {
	return (
		<span className="admin-rate">
			<span aria-hidden="true" className="admin-rate__track">
				<span
					className="admin-rate__fill"
					style={{ width: `${Math.round(Math.min(1, rate ?? 0) * 100)}%` }}
				/>
			</span>
			<span className="admin-rate__value">{formatPercent(rate)}</span>
		</span>
	);
}
