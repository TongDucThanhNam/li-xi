import { OrnamentDivider } from "./OrnamentDivider";

export function HeroSection({
	guestName,
	campaignTitle,
	campaignSubtitle,
	ctaLabel,
	waitingMessage,
	statusMessage,
	canBegin,
	showHero,
	onStart,
}: {
	guestName?: string;
	campaignTitle?: string;
	campaignSubtitle?: string;
	ctaLabel?: string;
	waitingMessage?: string;
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
			{/* Decorative lantern icon */}
			<div className="mb-6 relative">
				<div className="absolute inset-0 bg-gold-base/20 blur-2xl rounded-full animate-pulse-slow" />
				<svg className="w-12 h-12 text-gold-base relative" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Lunar Fortune icon">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
				</svg>
			</div>

			<h1 className="m-0 font-cinzel text-[clamp(36px,5.2vw,72px)] leading-[1.05] bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]">
				{campaignTitle || "Lunar Fortune"}
			</h1>

			<OrnamentDivider className="mt-3 sm:mt-4" />

			<p className="mt-2 sm:mt-3 text-white/50 tracking-[3px] sm:tracking-[4px] uppercase text-xs sm:text-sm font-playfair">
				{campaignSubtitle || "Premium Gacha Experience"}
			</p>

			{guestName ? (
				<p className="mt-4 font-playfair text-lg italic text-gold-shine/70">
					{guestName}
				</p>
			) : null}

			<button
				type="button"
				className={`mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border font-cinzel text-sm sm:text-base tracking-[2px] uppercase cursor-pointer shadow-lg transition-all duration-300 relative overflow-hidden group ${
					canBegin
						? "border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base hover:bg-[rgba(60,0,0,0.65)] hover:border-gold-base/60 hover:shadow-[0_0_30px_rgba(212,175,55,0.2)] hover:-translate-y-0.5"
						: "border-gold-base/20 bg-black-ink/40 text-gold-base/30 cursor-not-allowed"
				}`}
				disabled={!canBegin}
				onClick={onStart}
			>
				{/* Button shine effect */}
				<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_1.5s_ease-in-out_infinite] transition-transform" />
				<span className="relative z-10">
						{canBegin ? ctaLabel || "Thử vận may" : (
							<>
								<span className="inline-block animate-pulse mr-1">•••</span>
								{waitingMessage || "Đang chuẩn bị"}
							</>
						)}
				</span>
			</button>

			{statusMessage ? (
				<div className="mt-5 flex items-center gap-2 max-w-sm">
					<div className="flex-shrink-0">
						<svg className="w-4 h-4 text-gold-shine/50 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
							<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
						</svg>
					</div>
					<p className="text-[0.85rem] sm:text-[0.95rem] text-gold-shine/60 leading-relaxed">
						{statusMessage}
					</p>
				</div>
			) : null}

			{/* Floating particles */}
			<div className="absolute inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden="true">
				<div className="absolute top-[20%] left-[10%] w-1 h-1 bg-gold-base/30 rounded-full animate-float-slow" style={{ animationDelay: "0s" }} />
				<div className="absolute top-[40%] right-[15%] w-1.5 h-1.5 bg-gold-shine/20 rounded-full animate-float-medium" style={{ animationDelay: "1s" }} />
				<div className="absolute bottom-[30%] left-[20%] w-1 h-1 bg-gold-base/25 rounded-full animate-float-slow" style={{ animationDelay: "2s" }} />
				<div className="absolute top-[60%] right-[25%] w-1.5 h-1.5 bg-gold-shine/15 rounded-full animate-float-medium" style={{ animationDelay: "0.5s" }} />
			</div>
		</div>
	);
}
