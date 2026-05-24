import { formatCurrency } from "../hostUtils";
import type { Rarity } from "@/lib/lixiPolicy";
import { PackageOpen } from "lucide-react";

type InventoryItem = {
	amount: number;
	rarity: Rarity;
	totalQuantity: number;
	remainingQuantity: number;
};

type InventoryListProps = {
	items: InventoryItem[];
};

export default function InventoryList({ items }: InventoryListProps) {
	const lowStockThreshold = 3;

	return (
		<div className="group relative overflow-hidden rounded-2xl border border-gold-base/40 bg-linear-to-br from-[#1a0a0a] to-[#4a0a0a] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-500 hover:border-gold-base/70 hover:shadow-[0_15px_40px_rgba(212,175,55,0.2)] h-full flex flex-col">
			{/* Texture Overlay */}
			<div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />

			{/* Inner Border Requirement */}
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			{/* Header with count badge */}
			<div className="relative z-10 flex items-center justify-between mb-4 shrink-0">
				<h2 className="font-playfair text-[20px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
					Giải thưởng còn lại
				</h2>
				<div className="rounded-full bg-gold-base/10 px-3 py-1 border border-gold-base/20">
					<span className="text-xs font-cinzel text-gold-base">{items.length}</span>
				</div>
			</div>

			<div className="grid gap-2 relative z-10 overflow-y-auto flex-1 content-start pr-1 custom-scrollbar">
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 border border-dashed border-gold-base/15 rounded-xl bg-black-ink/20">
						<PackageOpen
							aria-label="Chưa có giải thưởng"
							className="mb-3 text-gold-base/20"
							size={40}
							strokeWidth={1.5}
						/>
						<p className="font-vn text-[12px] italic text-gold-shine/30">
							Chưa có giải thưởng
						</p>
					</div>
				) : (
					items.map((item, idx) => {
						const isLowStock = item.remainingQuantity <= lowStockThreshold && item.remainingQuantity > 0;
						const isEmpty = item.remainingQuantity === 0;
						const staggerDelay = idx * 30;

						return (
					<div
						key={item.amount}
						className={`flex items-center justify-between gap-3 rounded-lg border bg-[rgba(10,0,0,0.4)] px-4 py-2.5 transition-all duration-300 ${
							isEmpty
								? "border-gold-base/10 opacity-40 grayscale"
								: isLowStock
									? "border-red-vivid/40 hover:bg-red-vivid/10 hover:border-red-vivid/60 hover:shadow-[0_4px_12px_rgba(179,20,20,0.15)]"
									: "border-gold-base/20 hover:bg-gold-base/10 hover:border-gold-base/50 hover:-translate-y-0.5 hover:shadow-lg"
						} group/item animate-fade-in-up`}
						style={{ animationDelay: `${staggerDelay}ms` }}
					>
								<div className="flex flex-col">
									<div className="flex items-center gap-2">
										<strong className={`text-base font-cinzel transition-colors ${
											isEmpty ? "text-white/30" : isLowStock ? "text-red-vivid/90" : "text-gold-shine group-hover/item:text-white"
										}`}>
											{formatCurrency(item.amount)}
										</strong>
										<RarityBadge rarity={item.rarity} />
										{isLowStock && !isEmpty && (
											<div className="flex items-center gap-1 text-[9px] text-red-vivid/70 font-vn uppercase tracking-wider">
												<span className="relative flex h-1.5 w-1.5">
													<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-vivid opacity-75" />
													<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-vivid" />
												</span>
												Sắp hết
											</div>
										)}
									</div>
								</div>

								<div className="text-right">
									<div className={`text-sm font-bold flex items-center justify-end gap-1 ${
										isEmpty ? "text-white/20" : isLowStock ? "text-red-vivid" : "text-gold-shine"
									}`}>
										{isEmpty ? (
											<span className="text-[10px] italic font-vn">Hết</span>
										) : (
											<>
												<span>{item.remainingQuantity}</span>
												<span className="text-white/20 mx-1 font-light">/</span>
												<span className="text-white/40">{item.totalQuantity}</span>
											</>
										)}
									</div>
									{!isEmpty && (
										<div className="h-1 w-16 mt-1 rounded-full bg-black-ink/60 overflow-hidden">
											<div
												className={`h-full rounded-full transition-all duration-500 ${
													isLowStock ? "bg-red-vivid animate-pulse" : "bg-gold-base/50"
												}`}
												style={{ width: `${(item.remainingQuantity / item.totalQuantity) * 100}%` }}
											/>
										</div>
									)}
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}

function RarityBadge({ rarity }: { rarity: Rarity }) {
	const isLegend = rarity === "legend";
	return (
		<span
			className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-sm ${
				isLegend
					? "border-gold-base/60 bg-gold-base/10 text-gold-base shadow-gold-base/20"
					: "border-white/20 bg-white/5 text-white/60"
			}`}
		>
			{rarity}
		</span>
	);
}
