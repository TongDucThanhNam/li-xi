import { formatPercent } from "@/lib/campaignMetrics";

const viNumberFormat = new Intl.NumberFormat("vi-VN");

/**
 * Funnel step bars (§11.1/R5): each step shows its label, a bar whose fill
 * is relative to the first step, the absolute value and the step-over-step
 * rate. The number stays next to the bar; rates below 48rem sit after the
 * value, above it in the trailing column.
 */
export function FunnelBars({
	label,
	steps,
}: {
	label: string;
	steps: Array<{ label: string; value: number }>;
}) {
	const first = steps[0]?.value ?? 0;
	return (
		<ol aria-label={label} className="admin-funnel">
			{steps.map((step, index) => {
				const width =
					first === 0 || step.value === 0 ? 0 : Math.max(2, (step.value / first) * 100);
				const previous = index > 0 ? steps[index - 1] : undefined;
				const rate = previous && previous.value !== 0 ? step.value / previous.value : null;
				return (
					<li className="admin-funnel__step" key={step.label}>
						<span className="admin-funnel__label">{step.label}</span>
						<span aria-hidden="true" className="admin-funnel__track">
							<span className="admin-funnel__fill" style={{ width: `${width}%` }} />
						</span>
						<span className="admin-funnel__value">{viNumberFormat.format(step.value)}</span>
						<span className="admin-funnel__rate">
							{index === 0 || rate === null ? null : (
								<>
									{formatPercent(rate)}
									<span className="sr-only"> so với bước trước</span>
								</>
							)}
						</span>
					</li>
				);
			})}
		</ol>
	);
}
