import { formatCurrency } from "../hostUtils";
import { OrnamentDivider } from "./OrnamentDivider";
import type { Prize } from "./types";
import type { Rarity } from "@/lib/lixiPolicy";

function rarityModalGlow(rarity: Rarity) {
	if (rarity === "legend") {
		return "bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.2)_0%,rgba(179,20,20,0.08)_40%,transparent_70%)]";
	}
	if (rarity === "rare") {
		return "bg-[radial-gradient(circle_at_50%_40%,rgba(179,20,20,0.2)_0%,transparent_60%)]";
	}
	return "bg-[radial-gradient(circle_at_50%_50%,rgba(179,20,20,0.1),transparent_70%)]";
}

export function ResultModal({
	prize,
	guestName,
	onCollect,
}: {
	prize: Prize | null;
	guestName?: string;
	onCollect: () => void;
}) {
	return (
		<div
			className={`fixed inset-0 z-1000 flex flex-col items-center justify-center transition-[opacity,visibility] duration-500 bg-black/[0.96] ${
				prize
					? "opacity-100 visible pointer-events-auto"
					: "opacity-0 invisible pointer-events-none"
			}`}
			role="dialog"
			aria-modal="true"
			aria-label="Kết quả rút phong bao"
		>
			{/* Rarity-aware background glow */}
			<div
				className={`absolute inset-0 -z-10 transition-opacity duration-700 ${
					prize ? rarityModalGlow(prize.rarity) : ""
				}`}
			/>

			<div className="flex flex-col items-center">
				<p className="m-0 text-xs sm:text-sm tracking-[3px] sm:tracking-[4px] uppercase text-white/50 font-playfair">
					Bạn nhận được
				</p>

				<OrnamentDivider className="my-3 sm:my-4" />

				<h2 className="mt-1 mb-2 font-cinzel text-[clamp(38px,5vw,72px)] leading-tight bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(212,175,55,0.3)]">
					{prize ? formatCurrency(prize.amount) : "0đ"}
				</h2>

				{guestName ? (
					<p className="mt-1 text-white/40 text-xs sm:text-sm font-playfair">
						cho <span className="text-gold-shine/70">{guestName}</span>
					</p>
				) : null}

				<button
					type="button"
					className="mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base font-cinzel text-sm sm:text-base tracking-[2px] uppercase cursor-pointer shadow-[0_0_20px_rgba(0,0,0,0.45)] transition-opacity duration-200 relative"
					onClick={onCollect}
				>
					<span className="relative z-10">Nhận lì xì</span>
				</button>
			</div>
		</div>
	);
}
