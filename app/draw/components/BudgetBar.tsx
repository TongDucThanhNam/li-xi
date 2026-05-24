import { formatCurrency } from "../hostUtils";
import { Coins, PackageCheck, WalletCards, type LucideIcon } from "lucide-react";

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
				icon={WalletCards}
				progress={100}
				color="gold"
			/>

			<StatCard
				label="Còn lại"
				value={formatCurrency(remainingBudget)}
				icon={Coins}
				progress={percent}
				color="red"
			/>

			<StatCard
				label="Khả dụng"
				value={availableUnits.toString()}
				unit="phong bao"
				icon={PackageCheck}
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
	icon: Icon,
	progress,
	color,
}: {
	label: string;
	value: string;
	unit?: string;
	icon: LucideIcon;
	progress: number;
	color: "gold" | "red";
}) {
	const isLowBudget = progress < 20;
	const isCritical = progress < 10;

	return (
		<div className={`relative overflow-hidden rounded-2xl border bg-linear-to-br from-[#1a0a0a] to-[#4a0a0a] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition-colors hover:border-gold-base/65 ${
			isCritical && color === "red" ? "border-red-vivid/60 animate-pulse" : "border-gold-base/40"
		}`}>
			<div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			<div className={`absolute -right-3 -bottom-3 text-gold-base opacity-[0.035] ${
				isCritical ? "text-red-vivid" : ""
			}`}>
				<Icon aria-hidden="true" size={72} strokeWidth={1.5} />
			</div>

			{isCritical && color === "red" && (
				<div className="absolute inset-0 bg-red-vivid/5 blur-xl pointer-events-none" />
			)}

			<div className="relative z-10 flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className={`transition-colors ${isCritical ? "text-red-vivid" : "text-gold-base/60"}`}>
							<Icon aria-hidden="true" size={18} strokeWidth={2.2} />
						</div>
						<span className="font-vn text-[9px] font-black uppercase tracking-[0.2em] text-gold-shine/40">
							{label}
						</span>
						{isCritical && color === "red" && (
							<span className="ml-auto flex items-center gap-1 text-[8px] font-vn uppercase tracking-wider text-red-vivid">
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-vivid opacity-75" />
									<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-vivid" />
								</span>
								Cấp bách
							</span>
						)}
					</div>
				</div>

				<div className="flex items-baseline gap-1.5">
					<span className={`font-cinzel text-xl font-bold tracking-tight bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] lg:text-2xl ${
						isCritical && color === "red"
							? "text-transparent bg-linear-to-b from-red-vivid to-red-deep animate-pulse"
							: isLowBudget && color === "red"
								? "text-transparent bg-linear-to-b from-red-vivid/80 to-gold-base"
								: "text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base"
					}`}>
						{value}
					</span>
					{unit && (
						<span className="font-playfair text-[10px] font-bold italic text-gold-shine/20">
							{unit}
						</span>
					)}
				</div>

				<div className="relative h-1.5 w-full rounded-full bg-black-ink/80 shadow-inner overflow-hidden">
					<div
						className={`relative h-full rounded-full transition-[width] duration-700 ease-smooth ${
							isCritical && color === "red"
								? "bg-linear-to-r from-red-vivid via-red-vivid to-red-deep shadow-[0_0_15px_rgba(179,20,20,0.5)]"
								: isLowBudget && color === "red"
									? "bg-linear-to-r from-red-vivid via-red-vivid to-gold-base shadow-[0_0_10px_rgba(179,20,20,0.3)]"
									: color === "gold"
										? "bg-linear-to-r from-gold-base via-gold-shine to-gold-base shadow-[0_0_10px_rgba(212,175,55,0.2)]"
										: "bg-linear-to-r from-red-vivid via-red-vivid to-gold-base shadow-[0_0_10px_rgba(179,20,20,0.2)]"
						}`}
						style={{ width: `${progress}%` }}
					/>
				</div>

				{(isLowBudget || isCritical) && color === "red" && (
					<span className={`text-[10px] font-vn font-bold uppercase tracking-wider ${
						isCritical ? "text-red-vivid" : "text-red-vivid/70"
					}`}>
						Còn lại {Math.round(progress)}%
					</span>
				)}
			</div>
		</div>
	);
}
