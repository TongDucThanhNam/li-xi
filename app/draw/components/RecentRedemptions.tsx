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
		<div className="relative rounded-3xl border border-[rgba(212,175,55,0.46)] bg-linear-to-br from-[rgba(18,2,2,0.95)] to-[rgba(56,1,1,0.9)] p-8! shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-sm h-full flex flex-col">
			{/* Inner Border */}
			<div className="absolute inset-[4px] rounded-[20px] border border-[rgba(212,175,55,0.15)] pointer-events-none" />

			<h2 className="font-playfair text-[clamp(24px,2.7vw,34px)] leading-[1.12] tracking-[0.01em] text-transparent bg-[linear-gradient(180deg,#fff8dc,#d4af37)] bg-clip-text drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] mb-5 shrink-0">
				Lịch sử rút mới nhất
			</h2>
			<div className="grid gap-3 relative z-10 overflow-y-auto flex-1 content-start pr-1 custom-scrollbar">
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 border border-dashed border-[rgba(212,175,55,0.2)] rounded-xl bg-[rgba(0,0,0,0.2)]">
						<p className="font-vn text-[15px] italic text-[rgba(255,241,203,0.5)]">
							Chưa có lượt rút nào
						</p>
					</div>
				) : (
					items.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between gap-4 rounded-xl border border-[rgba(212,175,55,0.2)] bg-[rgba(0,0,0,0.4)] px-5 py-3.5 transition-all hover:bg-[rgba(212,175,55,0.08)] hover:border-[rgba(212,175,55,0.4)] hover:-translate-x-1 group"
						>
							<div className="flex flex-col gap-1.5">
								<span className="font-playfair text-[16px] font-bold text-gold-shine group-hover:text-gold-shine transition-colors">
									{item.guestNameDisplay}
								</span>
								<span
									className={`w-fit rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
										item.rarity === "legend"
											? "border-[rgba(255,215,0,0.6)] bg-[rgba(255,215,0,0.1)] text-[#ffd700]"
											: "border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.7)]"
									}`}
								>
									{item.rarity}
								</span>
							</div>
							<div className="text-right flex flex-col items-end gap-1">
								<span className="block text-[18px] font-cinzel font-bold text-gold-shine drop-shadow-sm">
									{formatCurrency(item.amount)}
								</span>
								<span className="text-[10px] uppercase tracking-wider text-[rgba(255,241,203,0.4)] font-mono">
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
