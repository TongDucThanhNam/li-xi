import { OrnamentDivider } from "./OrnamentDivider";

export function HeroSection({
	guestName,
	statusMessage,
	canBegin,
	showHero,
	onStart,
}: {
	guestName?: string;
	statusMessage?: string;
	canBegin: boolean;
	showHero: boolean;
	onStart: () => void;
}) {
	return (
		<div
			className={`text-center relative z-30 transition-[opacity,transform] duration-800 ease-smooth flex flex-col items-center ${
				showHero
					? "animate-fade-in-up"
					: "opacity-0 -translate-y-5 pointer-events-none absolute inset-0"
			}`}
		>
			<h1 className="m-0 font-cinzel text-[clamp(36px,5.2vw,72px)] leading-[1.05] bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]">
				Lunar Fortune
			</h1>

			<OrnamentDivider className="mt-3 sm:mt-4" />

			<p className="mt-2 sm:mt-3 text-white/50 tracking-[3px] sm:tracking-[4px] uppercase text-xs sm:text-sm font-playfair">
				Premium Gacha Experience
			</p>

			<button
				type="button"
				className="mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base font-cinzel text-sm sm:text-base tracking-[2px] uppercase cursor-pointer shadow-[0_0_20px_rgba(0,0,0,0.45)] transition-opacity duration-200 disabled:opacity-40 disabled:cursor-not-allowed relative"
				disabled={!canBegin}
				onClick={onStart}
			>
				<span className="relative z-10">Summon Luck</span>
			</button>

			{statusMessage ? (
				<p className="mt-5 text-[0.85rem] sm:text-[0.95rem] text-gold-shine/60 max-w-sm leading-relaxed">
					{statusMessage}
				</p>
			) : null}
		</div>
	);
}
