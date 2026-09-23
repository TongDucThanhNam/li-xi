"use client";

import { Play } from "lucide-react";
import type { GameEntryHeroProps } from "@/app/game-templates/types";

/**
 * Scratch-card entry hero: premium pre-admission surface with exactly one
 * Start action. Waiting copy never replaces the CTA label.
 */
export default function ScratchCardEntryHero({
	canStart,
	blockedMessage,
	pending,
	statusMessage,
	copy,
	brandName,
	description,
	gameName,
	heroAssetUrl,
	onStart,
}: GameEntryHeroProps) {
	return (
		<main
			className="scratch-stage"
			style={
				heroAssetUrl
					? undefined
					: { background: "radial-gradient(circle at 50% 30%, rgba(212,175,55,0.14), transparent 60%)" }
			}
		>
			{heroAssetUrl ? (
				<div
					aria-hidden="true"
					className="absolute inset-0 opacity-20 mix-blend-screen"
					style={{
						backgroundImage: `url(${heroAssetUrl})`,
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
				/>
			) : null}
			<div className="scratch-stage__inner">
				<p className="scratch-hero__eyebrow">{brandName || "Tri ân"}</p>
				<h1 className="scratch-hero__title">{copy.title}</h1>
				{copy.subtitle ? (
					<p className="scratch-hero__subtitle">{copy.subtitle}</p>
				) : null}
				{description ? (
					<p className="scratch-hero__brand">{description}</p>
				) : null}
				{gameName ? <p className="scratch-hero__brand">{gameName}</p> : null}
				{canStart ? (
					<button className="scratch-cta" disabled={pending} onClick={onStart} type="button">
						<Play aria-hidden="true" size={17} />
						{pending ? "Đang bắt đầu…" : copy.ctaLabel}
					</button>
				) : (
					<p className="scratch-hero__subtitle" role="status">
						{blockedMessage ?? copy.waitingMessage ?? "Trò chơi chưa mở"}
					</p>
				)}
				{statusMessage ? (
					<p className="scratch-error" role="alert">
						{statusMessage}
					</p>
				) : null}
			</div>
		</main>
	);
}
