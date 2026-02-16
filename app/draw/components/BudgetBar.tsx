import { formatCurrency } from "../hostUtils";

type BudgetBarProps = {
	totalBudget: number;
	remainingBudget: number;
	availableUnits: number;
};

export default function BudgetBar({
	totalBudget,
	remainingBudget,
	availableUnits,
}: BudgetBarProps) {
	const percent = Math.max(
		0,
		Math.min(100, (remainingBudget / totalBudget) * 100),
	);

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
			{/* Stat Card 1: Total Budget */}
			<div className="relative overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.3)] bg-[rgba(0,0,0,0.6)] p-6! shadow-xl backdrop-blur-sm group hover:border-[rgba(212,175,55,0.5)] transition-all">
				<div className="absolute top-0 right-0 p-4 opacity-10">
					<svg
						width="60"
						height="60"
						viewBox="0 0 24 24"
						fill="currentColor"
						className="text-gold-shine"
						aria-hidden="true"
					>
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.15-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.33 0 2.26-.87 2.26-1.94 0-1.51-1.58-2.05-3.03-2.55-1.76-.61-3.21-1.74-3.21-3.77 0-1.73 1.31-3.04 2.97-3.4V3h2.67v1.93c1.38.3 2.48 1.12 2.67 2.68h-1.96c-.25-1-.96-1.63-2.06-1.63-1.15 0-2.07.82-2.07 1.93 0 1.25 1.53 1.83 2.92 2.3 1.99.69 3.32 1.77 3.32 3.82.01 1.93-1.4 3.33-3.15 3.66z" />
					</svg>
				</div>
				<div className="relative z-10 flex flex-col gap-2">
					<span className="font-vn text-[12px] font-bold uppercase tracking-[0.2em] text-[rgba(255,241,203,0.6)]">
						Tổng ngân sách
					</span>
					<span className="font-cinzel text-[24px] font-bold leading-none text-gold-shine drop-shadow-md">
						{formatCurrency(totalBudget)}
					</span>
				</div>
				<div className="mt-4 h-1 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
					<div className="h-full bg-linear-to-r from-[rgba(179,20,20,0.8)] to-gold-shine w-full opacity-50" />
				</div>
			</div>

			{/* Stat Card 2: Remaining */}
			<div className="relative overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.3)] bg-[rgba(0,0,0,0.6)] p-6! shadow-xl backdrop-blur-sm group hover:border-[rgba(212,175,55,0.5)] transition-all">
				<div className="absolute top-0 right-0 p-4 opacity-10">
					<svg
						width="60"
						height="60"
						viewBox="0 0 24 24"
						fill="currentColor"
						className="text-gold-shine"
						aria-hidden="true"
					>
						<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
					</svg>
				</div>
				<div className="relative z-10 flex flex-col gap-2">
					<span className="font-vn text-[12px] font-bold uppercase tracking-[0.2em] text-[rgba(255,241,203,0.6)]">
						Còn lại
					</span>
					<span className="font-cinzel text-[24px] font-bold leading-none text-gold-shine drop-shadow-md">
						{formatCurrency(remainingBudget)}
					</span>
				</div>
				<div className="mt-4 h-1 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
					<div
						className="h-full bg-linear-to-r from-[rgba(179,20,20,0.8)] via-gold-shine to-gold-base transition-all duration-1000 ease-out"
						style={{ width: `${percent}%` }}
					/>
				</div>
			</div>

			{/* Stat Card 3: Available Units */}
			<div className="relative overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.3)] bg-[rgba(0,0,0,0.6)] p-6! shadow-xl backdrop-blur-sm group hover:border-[rgba(212,175,55,0.5)] transition-all">
				<div className="absolute top-0 right-0 p-4 opacity-10">
					<svg
						width="56"
						height="56"
						viewBox="0 0 24 24"
						fill="currentColor"
						className="text-gold-shine"
						aria-hidden="true"
					>
						<path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1.2-1.65L12 6.74l-1.2.39 2.4 3.3 2.4-3.3-1.2-1.65 1.2 1.65 2.38 3.28L17 10.83 14.92 8H20v6z" />
					</svg>
				</div>
				<div className="relative z-10 flex flex-col gap-2">
					<span className="font-vn text-[12px] font-bold uppercase tracking-[0.2em] text-[rgba(255,241,203,0.6)]">
						Khả dụng
					</span>
					<div className="flex items-baseline gap-2">
						<span className="font-cinzel text-[24px] font-bold leading-none text-gold-shine drop-shadow-md">
							{availableUnits}
						</span>
						<span className="text-[11px] uppercase text-[rgba(255,241,203,0.4)] tracking-widest">
							phong bao
						</span>
					</div>
				</div>
				<div className="mt-4 h-1 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
					<div className="h-full bg-linear-to-r from-gold-base to-gold-shine w-full opacity-80" />
				</div>
			</div>
		</div>
	);
}
