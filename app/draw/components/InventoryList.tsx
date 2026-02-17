import { formatCurrency } from "../hostUtils";
import type { Rarity } from "@/lib/lixiPolicy";

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
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-gold-base/30 bg-linear-to-br from-[#120101] to-[#3e0000] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-500 hover:border-gold-base/50 h-full flex flex-col">
			{/* Texture Overlay */}
			<div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
			
			{/* Inner Border Requirement */}
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			<h2 className="relative z-10 font-playfair text-[20px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] mb-4 shrink-0">
				Giải thưởng còn lại
			</h2>

			<div className="grid gap-2 relative z-10 overflow-y-auto flex-1 content-start pr-1 custom-scrollbar">
				{items.map((item) => (
					<div
						key={item.amount}
						className="flex items-center justify-between gap-3 rounded-lg border border-gold-base/10 bg-black-ink/40 px-4 py-2.5 transition-all hover:bg-gold-base/5 hover:border-gold-base/30 group/item"
					>
						<div className="flex flex-col">
							<div className="flex items-center gap-2">
								<strong className="text-base font-cinzel text-gold-shine transition-colors group-hover/item:text-white">
									{formatCurrency(item.amount)}
								</strong>
								<RarityBadge rarity={item.rarity} />
							</div>
						</div>

						<div className="text-right">
							<div className="text-sm font-bold">
								<span className="text-gold-shine">
									{item.remainingQuantity}
								</span>
								<span className="text-white/20 mx-1 font-light">/</span>
								<span className="text-white/40">
									{item.totalQuantity}
								</span>
							</div>
						</div>
					</div>
				))}
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
