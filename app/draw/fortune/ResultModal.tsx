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
	const isLegend = prize?.rarity === "legend";
	const isRare = prize?.rarity === "rare";

	return (
		<div
			className={`fixed inset-0 z-1000 flex flex-col items-center justify-center transition-[opacity,visibility] duration-500 ${
				prize
					? "opacity-100 visible pointer-events-auto"
					: "opacity-0 invisible pointer-events-none"
			}`}
			role="dialog"
			aria-modal="true"
			aria-label="Kết quả rút phong bao"
			style={{ background: "rgba(0,0,0,0.96)" }}
		>
			{/* Rarity-aware background glow */}
			<div
				className={`absolute inset-0 -z-10 transition-opacity duration-700 ${
					prize ? rarityModalGlow(prize.rarity) : ""
				}`}
			/>

			{/* Particles for legendary */}
			{isLegend && (
				<>
					<div className="absolute inset-0 pointer-events-none">
						<div className="absolute top-[20%] left-[10%] w-2 h-2 bg-gold-base rounded-full animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.8)]" style={{ animationDelay: "0s" }} />
						<div className="absolute top-[30%] right-[15%] w-1.5 h-1.5 bg-gold-shine rounded-full animate-pulse shadow-[0_0_8px_rgba(255,248,220,0.6)]" style={{ animationDelay: "0.2s" }} />
						<div className="absolute bottom-[25%] left-[20%] w-2.5 h-2.5 bg-gold-base rounded-full animate-pulse shadow-[0_0_12px_rgba(212,175,55,0.7)]" style={{ animationDelay: "0.4s" }} />
						<div className="absolute top-[50%] right-[8%] w-1 h-1 bg-gold-shine rounded-full animate-pulse shadow-[0_0_6px_rgba(255,248,220,0.5)]" style={{ animationDelay: "0.6s" }} />
						<div className="absolute bottom-[40%] right-[25%] w-1.5 h-1.5 bg-gold-base rounded-full animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.6)]" style={{ animationDelay: "0.8s" }} />
					</div>
					{/* Radial burst rings */}
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-gold-base/20 animate-[regret-aura_3s_ease-in-out_infinite]" />
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-gold-base/10 animate-[regret-aura_3s_ease-in-out_infinite]" style={{ animationDelay: "0.5s" }} />
				</>
			)}

			<div className="flex flex-col items-center relative z-10 animate-modal-enter">
				{/* Rarity badge */}
				{prize && (
					<div className={`mb-4 px-4 py-1 rounded-full border font-vn text-[10px] font-bold uppercase tracking-[0.2em] ${
						isLegend
							? "border-gold-base/60 bg-gold-base/20 text-gold-base shadow-[0_0_20px_rgba(212,175,55,0.3)] animate-glow-pulse"
							: isRare
								? "border-red-vivid/60 bg-red-vivid/20 text-red-vivid shadow-[0_0_15px_rgba(179,20,20,0.3)]"
								: "border-gold-base/30 bg-gold-base/10 text-gold-base/60"
					}`}>
						{isLegend ? "★ Huyền thoại ★" : isRare ? "RARE" : prize.rarity}
					</div>
				)}

				<p className="m-0 text-xs sm:text-sm tracking-[3px] sm:tracking-[4px] uppercase text-white/50 font-playfair">
					Bạn nhận được
				</p>

				<OrnamentDivider className="my-3 sm:my-4" />

				<h2 className={`mt-1 mb-2 font-cinzel text-[clamp(38px,5vw,72px)] leading-tight bg-clip-text text-transparent drop-shadow-${
					isLegend
						? "[0_0_50px_rgba(212,175,55,0.6)] bg-linear-to-b from-gold-shine via-gold-base to-gold-base animate-legend-glow"
						: isRare
							? "[0_0_30px_rgba(179,20,20,0.5)] bg-linear-to-b from-gold-shine to-red-vivid"
							: "[0_0_30px_rgba(212,175,55,0.3)] bg-linear-to-b from-gold-shine to-gold-base"
				}`}>
					{prize ? formatCurrency(prize.amount) : "0đ"}
				</h2>

				{guestName ? (
					<p className="mt-1 text-white/40 text-xs sm:text-sm font-playfair">
						cho <span className={`font-bold ${isLegend ? "text-gold-base" : "text-gold-shine/70"}`}>{guestName}</span>
					</p>
				) : null}

				<button
					type="button"
					className={`mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border font-cinzel text-sm sm:text-base tracking-[2px] uppercase cursor-pointer shadow-lg transition-all duration-300 relative overflow-hidden group ${
						isLegend
							? "border-gold-base/60 bg-gold-base/20 text-gold-base hover:bg-gold-base/30 hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] hover:-translate-y-0.5 hover:border-gold-base/80"
							: isRare
								? "border-red-vivid/60 bg-red-vivid/20 text-red-vivid hover:bg-red-vivid/30 hover:shadow-[0_0_25px_rgba(179,20,20,0.4)] hover:-translate-y-0.5 hover:border-red-vivid/80"
								: "border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base hover:bg-[rgba(60,0,0,0.65)] hover:border-gold-base/60 hover:-translate-y-0.5"
					}`}
					onClick={onCollect}
				>
					{/* Button shine effect */}
					<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_1s_ease-in-out_infinite]" />
					<span className="relative z-10">Nhận lì xì</span>
				</button>

				{/* Confetti particles for legendary */}
				{isLegend && (
					<div className="absolute -bottom-20 left-0 right-0 h-40 pointer-events-none overflow-hidden">
						{Array.from({ length: 20 }).map((_, i) => (
							<div
								key={`confetti-${i}-${Date.now()}`}
								className="absolute animate-[sparkle_2s_ease-in-out_infinite]"
								style={{
									left: `${Math.random() * 100}%`,
									animationDelay: `${Math.random() * 2}s`,
									animationDuration: `${1.5 + Math.random()}s`,
								}}
							>
								<div
									className={`w-1 h-1 rounded-full ${
										i % 3 === 0 ? "bg-gold-base" : i % 2 === 0 ? "bg-gold-shine" : "bg-white"
									}`}
									style={{ boxShadow: "0 0 6px currentColor" }}
								/>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
