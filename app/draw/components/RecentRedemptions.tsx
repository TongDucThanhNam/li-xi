import { formatCurrency } from "../hostUtils";
import type { Rarity } from "@/lib/lixiPolicy";
import { Clock3 } from "lucide-react";

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

function formatTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "Vừa xong";
	if (diffMins < 60) return `${diffMins} phút trước`;
	if (diffHours < 24) return `${diffHours} giờ trước`;
	if (diffDays === 1) return "Hôm qua";
	return `${diffDays} ngày trước`;
}

export default function RecentRedemptions({ items }: RecentRedemptionsProps) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-gold-base/40 bg-linear-to-br from-[#1a0a0a] to-[#4a0a0a] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-500 hover:border-gold-base/70 hover:shadow-[0_15px_40px_rgba(212,175,55,0.2)] flex flex-col h-full">
			{/* Texture Overlay */}
			<div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />

			{/* Inner Border Requirement */}
			<div className="pointer-events-none absolute inset-[3px] rounded-[13px] border border-gold-base/10" />

			{/* Header with count badge */}
			<div className="relative z-10 flex items-center justify-between mb-4 shrink-0">
				<h2 className="font-playfair text-[20px] leading-tight tracking-[0.01em] text-transparent bg-linear-to-b from-gold-shine via-gold-shine to-gold-base bg-clip-text drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
					Lịch sử mới nhất
				</h2>
				<div className="rounded-full bg-gold-base/10 px-3 py-1 border border-gold-base/20">
					<span className="text-xs font-cinzel text-gold-base">{items.length}</span>
				</div>
			</div>

			<div className="grid gap-2 relative z-10 overflow-y-auto flex-1 content-start pr-1 custom-scrollbar">
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 border border-dashed border-gold-base/15 rounded-xl bg-black-ink/20">
						<Clock3
							aria-label="Chưa có lịch sử"
							className="mb-3 text-gold-base/20"
							size={40}
							strokeWidth={1.5}
						/>
						<p className="font-vn text-[12px] italic text-gold-shine/30">
							Chưa có lượt rút nào
						</p>
						<p className="font-vn text-[10px] text-gold-shine/20 mt-1">
							Tạo phiên đầu tiên để bắt đầu
						</p>
					</div>
				) : (
					items.map((item, idx) => {
						const isLegend = item.rarity === "legend";
						const isRare = item.rarity === "rare";
						const staggerDelay = idx * 40;

						return (
					<div
						key={item.id}
						className={`flex items-center justify-between gap-3 rounded-lg border bg-[rgba(10,0,0,0.4)] px-4 py-2.5 transition-all duration-300 ${
							isLegend
								? "border-gold-base/50 hover:bg-gold-base/15 hover:border-gold-base/80 hover:shadow-[0_0_30px_rgba(212,175,55,0.25)]"
								: isRare
									? "border-red-vivid/40 hover:bg-red-vivid/10 hover:border-red-vivid/60 hover:shadow-[0_4px_12px_rgba(179,20,20,0.2)]"
									: "border-gold-base/20 hover:bg-gold-base/10 hover:border-gold-base/50 hover:-translate-y-0.5 hover:shadow-lg"
						} group/item animate-fade-in-up`}
						style={{ animationDelay: `${staggerDelay}ms` }}
					>
								<div className="flex flex-col gap-1">
									<span className="font-playfair text-[15px] font-bold transition-colors group-hover/item:text-white text-gold-shine/80">
										{item.guestNameDisplay}
									</span>
									<RarityBadge rarity={item.rarity} />
								</div>
								<div className="text-right flex flex-col items-end gap-0.5">
									<span className={`block text-base font-cinzel font-bold ${
										isLegend ? "text-gold-base animate-glow-pulse" : "text-gold-shine"
									}`}>
										{formatCurrency(item.amount)}
									</span>
									<span className="text-[9px] font-bold uppercase tracking-widest text-gold-shine/20 font-mono">
										{formatTimeAgo(item.redeemedAt)}
									</span>
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
