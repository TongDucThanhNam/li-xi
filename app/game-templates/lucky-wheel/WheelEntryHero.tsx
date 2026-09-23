"use client";

import { Play } from "lucide-react";
import type { GameEntryHeroProps } from "@/app/game-templates/types";

/** Template-owned pre-session hero for the lucky wheel public entry. */
export default function WheelEntryHero({
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
		<main className="wheel-stage">
			{heroAssetUrl ? (
				<div
					aria-hidden="true"
					className="absolute inset-0 opacity-25 mix-blend-screen"
					style={{
						backgroundImage: `url(${heroAssetUrl})`,
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
				/>
			) : null}
			<div className="wheel-stage__inner">
				<header className="flex flex-col items-center">
					{brandName ? (
						<p className="wheel-hero__eyebrow">{brandName}</p>
					) : null}
					<h1 className="wheel-hero__title">{copy.title}</h1>
					<p className="wheel-hero__subtitle">
						{copy.subtitle || description || "Trải nghiệm trò chơi tri ân của chiến dịch."}
					</p>
				</header>
				<button
					className="wheel-cta"
					disabled={!canStart || pending}
					onClick={onStart}
					type="button"
				>
					<Play aria-hidden="true" size={18} />
					{copy.ctaLabel}
				</button>
				{!canStart && blockedMessage ? (
					<p className="wheel-status" role="status">
						{blockedMessage}
					</p>
				) : null}
				{statusMessage ? (
					<p role="alert" className="wheel-status" style={{ color: "#ef476f" }}>
						{statusMessage}
					</p>
				) : null}
				{canStart && copy.waitingMessage?.trim() ? (
					<p className="wheel-status" role="status">
						{copy.waitingMessage}
					</p>
				) : null}
			</div>
		</main>
	);
}
