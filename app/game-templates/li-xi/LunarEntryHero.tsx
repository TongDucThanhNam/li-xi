"use client";

import { OrnamentDivider } from "@/app/draw/fortune/OrnamentDivider";
import type { GameEntryHeroProps } from "@/app/game-templates/types";

/**
 * Template-owned pre-session hero for the li xi generic entry: the Lunar
 * Fortune shell with one Start action; waiting copy stays a status line and
 * never replaces the CTA.
 */
export default function LunarEntryHero({
	canStart,
	blockedMessage,
	pending,
	statusMessage,
	copy,
	brandName,
	description,
	heroAssetUrl,
	onStart,
}: GameEntryHeroProps) {
	return (
		<main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(116,14,14,0.4),var(--color-black-ink))] p-6">
			<div aria-hidden="true" className="noise-overlay pointer-events-none fixed inset-0 z-10 opacity-5" />
			{heroAssetUrl ? (
				<div
					aria-hidden="true"
					className="absolute inset-0 z-0 bg-cover bg-center opacity-25 mix-blend-screen"
					style={{ backgroundImage: `url(${heroAssetUrl})` }}
				/>
			) : null}
			<section className="relative z-30 flex w-full max-w-xl flex-col items-center text-center">
				{brandName ? (
					<p className="m-0 font-playfair text-xs uppercase tracking-[3px] text-white/50 sm:tracking-[4px]">
						{brandName}
					</p>
				) : null}
				<h1 className="m-0 mt-3 font-cinzel text-[clamp(36px,5.2vw,72px)] leading-[1.05] bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]">
					{copy.title}
				</h1>
				<OrnamentDivider className="mt-3 sm:mt-4" />
				<p className="mt-2 max-w-md font-playfair text-sm leading-7 text-gold-shine/70 sm:mt-3">
					{copy.subtitle || description || "Mở phong bao để khám phá kết quả của bạn."}
				</p>
				<button
					className={`mt-8 rounded-full border px-8 py-3.5 font-cinzel text-sm uppercase tracking-[2px] shadow-lg transition-all duration-300 sm:mt-10 sm:px-10 sm:py-4 sm:text-base ${
						canStart
							? "border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base hover:-translate-y-0.5 hover:border-gold-base/60 hover:bg-[rgba(60,0,0,0.65)] hover:shadow-[0_0_30px_rgba(212,175,55,0.2)]"
							: "cursor-not-allowed border-gold-base/20 bg-black-ink/40 text-gold-base/30"
					}`}
					disabled={!canStart || pending}
					onClick={onStart}
					type="button"
				>
					{copy.ctaLabel}
				</button>
				{!canStart && blockedMessage ? (
					<p className="mt-5 max-w-sm font-vn text-[0.85rem] leading-relaxed text-gold-shine/60" role="status">
						{blockedMessage}
					</p>
				) : null}
				{statusMessage ? (
					<p className="mt-4 max-w-sm font-vn text-sm text-red-vivid" role="alert">
						{statusMessage}
					</p>
				) : null}
				{canStart && copy.waitingMessage?.trim() ? (
					<p className="mt-5 max-w-sm font-vn text-[0.85rem] leading-relaxed text-gold-shine/60" role="status">
						{copy.waitingMessage}
					</p>
				) : null}
			</section>
		</main>
	);
}
