import type { Rarity } from "@/lib/lixiPolicy";
import { formatCurrency } from "../hostUtils";

type ResultSummaryProps = {
	guestNameDisplay: string;
	amount: number;
	rarity: Rarity;
};

export default function ResultSummary({
	guestNameDisplay,
	amount,
	rarity,
}: ResultSummaryProps) {
	return (
		<div className="flex overflow-hidden rounded-[20px] border border-[rgba(212,175,55,0.48)] bg-linear-to-br from-[rgba(24,3,3,0.95)] to-[rgba(64,0,0,0.9)] p-8 text-center shadow-[inset_0_0_0_1px_rgba(255,248,220,0.08),0_14px_30px_rgba(5,0,0,0.48)]">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(179,20,20,0.4),transparent_70%)] opacity-30" />
			<div className="relative z-10 grid gap-[12px]">
				<p className="m-0 font-vn text-[15px] font-medium tracking-[0.03em] text-[rgba(255,241,203,0.72)]">
					{guestNameDisplay} vừa nhận được
				</p>
				<h2 className="m-0 font-cinzel text-[clamp(32px,4vw,52px)] font-black leading-none text-gold-shine drop-shadow-[0_10px_24px_rgba(5,0,0,0.6)]">
					{formatCurrency(amount)}
				</h2>
				<div className="mx-auto block w-fit rounded-full border border-[rgba(212,175,55,0.32)] bg-[rgba(179,20,20,0.28)] px-[14px] py-[4px] font-cinzel text-[14px] font-bold uppercase tracking-[0.12em] text-gold-shine shadow-[0_4px_12px_rgba(5,0,0,0.32)]">
					{rarity}
				</div>
			</div>
		</div>
	);
}
