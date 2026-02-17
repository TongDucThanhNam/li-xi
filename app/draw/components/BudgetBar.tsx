import type { ReactNode } from "react";
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
		<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
			<StatCard
				label="Tổng ngân sách"
				value={formatCurrency(totalBudget)}
				icon={<WalletIcon />}
				progress={100}
				color="gold"
			/>

			<StatCard
				label="Còn lại"
				value={formatCurrency(remainingBudget)}
				icon={<CoinsIcon />}
				progress={percent}
				color="red"
			/>

			<StatCard
				label="Khả dụng"
				value={availableUnits.toString()}
				unit="phong bao"
				icon={<PackageIcon />}
				progress={100}
				color="gold"
			/>
		</div>
	);
}

function StatCard({
	label,
	value,
	unit,
	icon,
	progress,
	color,
}: {
	label: string;
	value: string;
	unit?: string;
	icon: ReactNode;
	progress: number;
	color: "gold" | "red";
}) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-gold-base/30 bg-linear-to-br from-[#120101] to-[#3e0000] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition-all duration-500 hover:border-gold-base/60">
			{/* Texture Overlay */}
			<div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
			
			{/* Inner Border */}
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			{/* Background Decorative Icon */}
			<div className="absolute -right-4 -bottom-4 text-gold-base opacity-[0.02] transition-all duration-700 group-hover:scale-125 group-hover:opacity-[0.05]">
				{icon}
			</div>

			<div className="relative z-10 flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="text-gold-base/60">
							{icon}
						</div>
						<span className="font-vn text-[9px] font-black uppercase tracking-[0.2em] text-gold-shine/40">
							{label}
						</span>
					</div>
				</div>

				<div className="flex items-baseline gap-1.5">
					<span className="font-cinzel text-xl font-bold tracking-tight text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] lg:text-2xl">
						{value}
					</span>
					{unit && (
						<span className="font-playfair text-[10px] font-bold italic text-gold-shine/20">
							{unit}
						</span>
					)}
				</div>

				{/* Liquid Progress Bar */}
				<div className="relative h-1 w-full rounded-full bg-black-ink/80 shadow-inner">
					<div
						className={[
							"relative h-full rounded-full transition-all duration-1000 ease-smooth",
							color === "gold"
								? "bg-linear-to-r from-gold-base via-gold-shine to-gold-base shadow-[0_0_10px_rgba(212,175,55,0.2)]"
								: "bg-linear-to-r from-red-vivid via-[#ff4d4d] to-gold-base shadow-[0_0_10px_rgba(179,20,20,0.2)]",
						].join(" ")}
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

function WalletIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
	);
}

function CoinsIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/><path d="M15 18h3.5"/></svg>
	);
}

function PackageIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
	);
}