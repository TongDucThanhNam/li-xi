"use client";

import { Play } from "lucide-react";
import type { GameEntryHeroProps } from "@/app/game-templates/types";
import {
	SLOT_IDLE_COMBINATION,
	SLOT_SYMBOL_ICONS,
} from "@/app/game-templates/slot-reveal/slotSymbols";

/**
 * Slot-reveal entry hero: premium pre-admission surface with exactly one
 * Start action. Waiting copy never replaces the CTA label.
 */
export default function SlotRevealEntryHero({
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
		<main className="slot-stage">
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
			<div className="slot-stage__inner">
				<p className="slot-hero__eyebrow">{brandName || "Tri ân"}</p>
				<h1 className="slot-hero__title">{copy.title}</h1>
				{copy.subtitle ? (
					<p className="slot-hero__subtitle">{copy.subtitle}</p>
				) : null}
				{description ? <p className="slot-hero__brand">{description}</p> : null}
				{gameName ? <p className="slot-hero__brand">{gameName}</p> : null}
				<div
					aria-hidden="true"
					className="slot-machine slot-machine--gold slot-machine--mini"
				>
					<div className="slot-reels">
						{SLOT_IDLE_COMBINATION.map((symbolKey, index) => {
							const Icon = SLOT_SYMBOL_ICONS[symbolKey];
							return (
								<div className="slot-reel" key={`${symbolKey}-${index}`}>
									<div className="slot-reel__window">
										<Icon aria-hidden="true" size={30} />
									</div>
								</div>
							);
						})}
					</div>
				</div>
				{canStart ? (
					<button
						className="slot-cta"
						disabled={pending}
						onClick={onStart}
						type="button"
					>
						<Play aria-hidden="true" size={17} />
						{pending ? "Đang bắt đầu…" : copy.ctaLabel}
					</button>
				) : (
					<p className="slot-hero__subtitle" role="status">
						{blockedMessage ?? copy.waitingMessage ?? "Trò chơi chưa mở"}
					</p>
				)}
				{statusMessage ? (
					<p className="slot-error" role="alert">
						{statusMessage}
					</p>
				) : null}
			</div>
		</main>
	);
}
