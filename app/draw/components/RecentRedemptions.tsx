import { formatCurrency } from "../hostUtils";
import type { Rarity } from "@/lib/lixiPolicy";

type RedemptionItem = {
	id: string;
	guestNameDisplay: string;
	amount: number;
	rarity: Rarity;
	redeemedAt: number;
};

type RecentRedemptionsProps = {
	items: RedemptionItem[];
};

export default function RecentRedemptions({ items }: RecentRedemptionsProps) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-gold-base/30 bg-linear-to-br from-[#120101] to-[#3e0000] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-500 hover:border-gold-base/50 flex flex-col h-full">
			{/* Texture Overlay */}
			<div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
			
			{/* Inner Border Requirement */}
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			<h2 className="relative z-10 font-playfair text-[20px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] mb-4 shrink-0">
				Lịch sử mới nhất
			</h2>

			<div className="grid gap-2 relative z-10 overflow-y-auto flex-1 content-start pr-1 custom-scrollbar">
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-8 border border-dashed border-gold-base/15 rounded-xl bg-black-ink/20">
						<p className="font-vn text-[12px] italic text-gold-shine/30">
							Chưa có lượt rút nào
						</p>
					</div>
				) : (
					items.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between gap-3 rounded-lg border border-gold-base/10 bg-black-ink/40 px-4 py-2.5 transition-all hover:bg-gold-base/5 hover:border-gold-base/30 group/item"
						>
							<div className="flex flex-col gap-1">
								<span className="font-playfair text-[15px] font-bold text-gold-shine/80 group-hover/item:text-white transition-colors">
									{item.guestNameDisplay}
								</span>
								<RarityBadge rarity={item.rarity} />
							</div>
							<div className="text-right flex flex-col items-end gap-0.5">
								<span className="block text-base font-cinzel font-bold text-gold-shine">
									{formatCurrency(item.amount)}
								</span>
								<span className="text-[9px] font-bold uppercase tracking-widest text-gold-shine/20 font-mono">
									{new Date(item.redeemedAt).toLocaleTimeString("vi-VN", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}

function RarityBadge({ rarity }: { rarity: Rarity }) {
	const isLegend = rarity === "legend";
	return (
		<span
			className={`w-fit rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest shadow-sm ${
				isLegend
					? "border-gold-base/60 bg-gold-base/10 text-gold-base shadow-gold-base/20"
					: "border-white/20 bg-white/5 text-white/60"
			}`}
		>
			{rarity}
		</span>
	);
}
