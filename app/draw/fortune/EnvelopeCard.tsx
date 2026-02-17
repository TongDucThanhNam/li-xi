import { RARITY_LABELS, type Rarity } from "@/lib/lixiPolicy";
import { formatCurrency } from "../hostUtils";
import type { CardState } from "./types";

function ticketRarityClass(rarity: Rarity | null) {
	if (!rarity) {
		return "";
	}
	if (rarity === "legend") {
		return "text-[#8a6e1e] border-2 border-gold-base bg-linear-to-br from-[#fffde7] to-[#fff8e1]";
	}
	if (rarity === "rare") {
		return "text-red-vivid border border-[#ef9a9a] bg-linear-to-b from-white to-[#ffebee]";
	}
	return "text-[#555] border border-[#ddd] bg-white";
}

export function EnvelopeCard({
	card,
	index,
	isReady,
	onClick,
}: {
	card: CardState;
	index: number;
	isReady: boolean;
	onClick: () => void;
}) {
	return (
		<div
			className={`group relative w-32 sm:w-36 md:w-40 lg:w-44 aspect-[0.72] preserve-3d cursor-pointer transition-[opacity,transform] duration-600 ease-elastic ${
				card.isIn
					? "opacity-100 translate-y-0"
					: "opacity-0 translate-y-[100px]"
			} ${
				card.isMissed
					? "grayscale brightness-[0.3] pointer-events-none scale-[0.96] transition-all duration-700"
					: ""
			}`}
			onClick={onClick}
			role="button"
			tabIndex={isReady && !card.isOpened && !card.isMissed ? 0 : -1}
			aria-label={`Phong bao số ${index + 1}`}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			style={{ transformStyle: "preserve-3d" }}
		>
			<div
				className="w-full h-full relative preserve-3d transition-transform duration-400 ease-smooth card-inner"
				style={{ transformStyle: "preserve-3d" }}
			>
				{/* Lining */}
				<div className="absolute inset-0 rounded-md -translate-z-px bg-liner-dark shadow-[0_10px_30px_rgba(0,0,0,0.5)] bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.2)_0,rgba(0,0,0,0.2)_1px,transparent_1px,transparent_4px)]" />

				{/* Ticket inside */}
				<div
					className={`layerTicket absolute w-[80%] h-[75%] left-[10%] bottom-2 rounded-[4px_4px_2px_2px] flex flex-col items-center justify-center overflow-hidden shadow-[0_2px_5px_rgba(0,0,0,0.2)] transition-[transform,filter,box-shadow] duration-1200 ease-elastic bg-white text-[#333] ${
						card.isOpened
							? "shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
							: ""
					} ${ticketRarityClass(
						card.prize?.rarity ?? null,
					)}`}
					style={{
						transform: card.isOpened
							? "translate3d(0,-112%,1px) scale(1.08)"
							: "translate3d(0,0,0)",
						zIndex: card.isOpened ? 30 : 0,
					}}
				>
					<div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,#000_0,#000_1px,transparent_0,transparent_10px)]" />
					<span className="text-[0.55rem] sm:text-[0.65rem] tracking-[1.6px] uppercase mb-1 z-2 opacity-60">
						LUCKY MONEY
					</span>
					<span className="font-cinzel text-[0.95rem] sm:text-[1.15rem] font-black z-2">
						{card.isOpened && card.prize
							? formatCurrency(card.prize.amount)
							: "???"}
					</span>
					{card.isOpened && card.prize ? (
						<span
							className={`mt-1 text-[0.5rem] sm:text-[0.55rem] tracking-[1.2px] uppercase font-bold z-2 px-2 py-0.5 rounded-full ${
								card.prize.rarity === "legend"
									? "bg-gold-base/20 text-[#8a6e1e]"
									: card.prize.rarity === "rare"
										? "bg-red-vivid/10 text-red-vivid"
										: "bg-black/5 text-[#888]"
							}`}
						>
							{RARITY_LABELS[card.prize.rarity]}
						</span>
					) : null}
				</div>

				{/* Body / pocket */}
				<div className="absolute inset-0 z-10 filter-[url(#paperRoughness)] bg-linear-to-br from-red-vivid to-red-deep [clip-path:polygon(0_0,50%_12%,100%_0,100%_100%,0%_100%)] translate-z-px rounded-md shadow-[inset_0_10px_20px_rgba(0,0,0,0.3)] transition-opacity duration-500 after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_120%,rgba(0,0,0,0.3)_0%,transparent_70%)] after:mix-blend-multiply">
					<div className="absolute inset-0 pointer-events-none z-50 opacity-40 bg-linear-to-br from-transparent via-white/20 to-white/10 mix-blend-overlay" />
				</div>

				{/* Flap */}
				<div
					className="layerFlapWrapper absolute top-0 left-0 w-full h-[45%] origin-top preserve-3d transition-[transform,opacity] duration-1000 ease-elastic"
					style={{
						transformStyle: "preserve-3d",
						transform: card.isOpened
							? "translate3d(0,0,0) rotateX(180deg)"
							: "translate3d(0,0,2px)",
						zIndex: card.isOpened ? 5 : 20,
					}}
				>
					<div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,50%_85%)] rounded-[4px_4px_0_0] backface-hidden bg-linear-to-b from-[#d32f2f] to-red-vivid filter-[url(#paperRoughness)]">
						<div className="absolute inset-0 pointer-events-none z-50 opacity-40 bg-linear-to-br from-transparent via-white/20 to-white/10 mix-blend-overlay" />
					</div>
					<div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,50%_85%)] rounded-[4px_4px_0_0] backface-hidden bg-[#4a0505] rotate-y-180 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0,transparent_2px)]" />
					<div className="absolute bottom-[15%] left-1/2 w-9 h-9 sm:w-11 sm:h-11 -translate-x-1/2 translate-y-1/2 translate-z-px rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-gold-shine),var(--color-gold-shine),#8a6e1e)] text-red-deep font-cinzel text-[1.1rem] sm:text-[1.4rem] flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_0_0_2px_rgba(255,215,0,0.8)]">
						福
					</div>
				</div>
			</div>

			{/* Card number */}
			<span className="absolute -bottom-5 sm:-bottom-6 left-1/2 -translate-x-1/2 text-[0.7rem] sm:text-[0.8rem] tracking-[2px] text-gold-base/40 font-cinzel tabular-nums select-none">
				{String(index + 1).padStart(2, "0")}
			</span>
		</div>
	);
}
