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
		<div className="relative rounded-3xl border border-[rgba(212,175,55,0.46)] bg-linear-to-br from-[rgba(18,2,2,0.95)] to-[rgba(56,1,1,0.9)] p-8! shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-sm">
			{/* Inner Border */}
			<div className="absolute inset-[4px] rounded-[20px] border border-[rgba(212,175,55,0.15)] pointer-events-none" />

			<h2 className="font-playfair text-[clamp(24px,2.7vw,34px)] leading-[1.12] tracking-[0.01em] text-transparent bg-[linear-gradient(180deg,#fff8dc,#d4af37)] bg-clip-text drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] mb-5">
				Ngân sách hiện tại
			</h2>
			<div className="grid gap-3 relative z-10">
				{items.map((item) => (
					<div
						key={item.amount}
						className="flex items-center justify-between gap-4 rounded-xl border border-[rgba(212,175,55,0.2)] bg-[rgba(0,0,0,0.4)] px-5 py-4 transition-all hover:bg-[rgba(212,175,55,0.05)] hover:border-[rgba(212,175,55,0.4)] group"
					>
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-3">
								<strong className="text-xl font-cinzel text-gold-shine drop-shadow-sm group-hover:text-gold-shine transition-colors">
									{formatCurrency(item.amount)}
								</strong>
								<span
									className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
										item.rarity === "legend"
											? "border-[rgba(255,215,0,0.6)] bg-[rgba(255,215,0,0.1)] text-[#ffd700]"
											: "border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.7)]"
									}`}
								>
									{item.rarity}
								</span>
							</div>
						</div>

						<div className="text-right">
							<div className="text-[16px] font-bold text-[rgba(255,248,220,0.9)]">
								<span className="text-gold-shine">
									{item.remainingQuantity}
								</span>
								<span className="text-[rgba(255,255,255,0.3)] mx-1">/</span>
								<span className="text-[rgba(255,255,255,0.5)]">
									{item.totalQuantity}
								</span>
							</div>
							<div className="text-[10px] uppercase tracking-widest text-[rgba(255,241,203,0.4)] mt-0.5">
								khả dụng
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
