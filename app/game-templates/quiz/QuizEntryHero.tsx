"use client";

import { ListChecks, Play } from "lucide-react";
import type { GameEntryHeroProps } from "@/app/game-templates/types";

/**
 * Quiz entry hero: premium pre-admission surface with exactly one Start
 * action. Waiting copy never replaces the CTA label.
 */
export default function QuizEntryHero({
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
		<main className="quiz-stage">
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
			<div className="quiz-stage__inner">
				<p className="quiz-hero__eyebrow">{brandName || "Tri ân"}</p>
				<h1 className="quiz-hero__title">{copy.title}</h1>
				{copy.subtitle ? (
					<p className="quiz-hero__subtitle">{copy.subtitle}</p>
				) : null}
				{description ? <p className="quiz-hero__brand">{description}</p> : null}
				{gameName ? <p className="quiz-hero__brand">{gameName}</p> : null}
				<div aria-hidden="true" className="quiz-hero__badge">
					<ListChecks size={26} />
				</div>
				{canStart ? (
					<button
						className="quiz-cta"
						disabled={pending}
						onClick={onStart}
						type="button"
					>
						<Play aria-hidden="true" size={17} />
						{pending ? "Đang bắt đầu…" : copy.ctaLabel}
					</button>
				) : (
					<p className="quiz-hero__subtitle" role="status">
						{blockedMessage ?? copy.waitingMessage ?? "Trò chơi chưa mở"}
					</p>
				)}
				{statusMessage ? (
					<p className="quiz-error" role="alert">
						{statusMessage}
					</p>
				) : null}
			</div>
		</main>
	);
}
