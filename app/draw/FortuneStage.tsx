"use client";

import { useEffect, useRef, useState } from "react";
import { ENVELOPE_COUNT } from "@/lib/lixiPolicy";
import type { CardState, Phase, Prize, RewardPoolItem } from "./fortune/types";
import { buildPreAssignedPrizes, createInitialCards } from "./fortune/prizePool";
import { formatCurrency } from "./hostUtils";
import { EnvelopeCard } from "./fortune/EnvelopeCard";
import { ResultModal } from "./fortune/ResultModal";
import { HeroSection } from "./fortune/HeroSection";

type FortuneStageProps = {
	sessionId: string | null;
	canStart: boolean;
	disabled: boolean;
	statusMessage?: string;
	guestName?: string;
	rewardPool: RewardPoolItem[];
	onRedeem: (envelopeIndex: number) => Promise<Prize>;
	onRevealStateChange: (revealing: boolean) => void;
	onCollect: () => void;
	onExit?: () => void;
};

type LegendaryFxState = {
	isActive: boolean;
	focusedCardIndex: number | null;
};

const DEFAULT_LEGENDARY_FX_STATE: LegendaryFxState = {
	isActive: false,
	focusedCardIndex: null,
};

const ENTRY_STAGGER_MS = 80;
const HERO_HIDE_MS = 500;
const READY_DELAY_MS = 1000;
const NORMAL_REVEAL_MS = 1500;
const LEGENDARY_FALLBACK_REVEAL_MS = 700;
const LEGENDARY_MOVE_TO_CENTER_MS = 50;
const LEGENDARY_REVEAL_MS = 3500;
const RESULT_DELAY_MS = 2000;

function usePrefersReducedMotion() {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setPrefersReducedMotion(mediaQuery.matches);
		sync();
		if ("addEventListener" in mediaQuery) {
			mediaQuery.addEventListener("change", sync);
			return () => mediaQuery.removeEventListener("change", sync);
		}
		mediaQuery.addListener(sync);
		return () => mediaQuery.removeListener(sync);
	}, []);

	return prefersReducedMotion;
}

export default function FortuneStage({
	sessionId,
	canStart,
	disabled,
	statusMessage,
	guestName,
	rewardPool,
	onRedeem,
	onRevealStateChange,
	onCollect,
}: FortuneStageProps) {
	const [phase, setPhase] = useState<Phase>("IDLE");
	const [cards, setCards] = useState<CardState[]>(() => createInitialCards());
	const [showHero, setShowHero] = useState(true);
	const [showGrid, setShowGrid] = useState(false);
	const [modalPrize, setModalPrize] = useState<Prize | null>(null);
	const [legendaryFx, setLegendaryFx] = useState<LegendaryFxState>(
		DEFAULT_LEGENDARY_FX_STATE,
	);

	const timeoutRef = useRef<number[]>([]);
	const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
	const cloneHostRef = useRef<HTMLDivElement | null>(null);
	const legendCloneRef = useRef<HTMLDivElement | null>(null);

	const prefersReducedMotion = usePrefersReducedMotion();
	const canBegin = canStart && !disabled && phase === "IDLE";

	const schedule = (callback: () => void, delayMs: number) => {
		const timer = window.setTimeout(callback, delayMs);
		timeoutRef.current.push(timer);
	};

	const clearTimers = () => {
		timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
		timeoutRef.current = [];
	};

	const clearLegendaryArtifacts = (resetFxState = true) => {
		if (resetFxState) {
			setLegendaryFx(DEFAULT_LEGENDARY_FX_STATE);
		}
		if (legendCloneRef.current) {
			legendCloneRef.current.remove();
			legendCloneRef.current = null;
		}
	};

	const resetStage = () => {
		clearTimers();
		clearLegendaryArtifacts();
		setPhase("IDLE");
		setCards(createInitialCards());
		setShowHero(true);
		setShowGrid(false);
		setModalPrize(null);
		onRevealStateChange(false);
	};

	useEffect(() => {
		resetStage();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	useEffect(() => {
		return () => {
			clearTimers();
			clearLegendaryArtifacts(false);
		};
	}, []);

	const handleStart = () => {
		if (!canBegin) {
			return;
		}

		setPhase("INTRO");
		setShowHero(false);

		// Pre-assign cosmetic prizes while rewardPool is guaranteed current
		const preAssigned = buildPreAssignedPrizes(rewardPool, ENVELOPE_COUNT);
		setCards(
			Array.from({ length: ENVELOPE_COUNT }, (_, index) => ({
				isIn: false,
				isOpened: false,
				isMissed: false,
				prize: preAssigned[index] ?? null,
			})),
		);

		schedule(() => {
			setShowGrid(true);
			for (let index = 0; index < ENVELOPE_COUNT; index += 1) {
				schedule(() => {
					setCards((previous) =>
						previous.map((card, cardIndex) =>
							cardIndex === index
								? {
										...card,
										isIn: true,
									}
								: card,
						),
					);
				}, index * ENTRY_STAGGER_MS);
			}
			schedule(() => setPhase("READY"), READY_DELAY_MS);
		}, HERO_HIDE_MS);
	};

	const revealOtherCards = (chosenIndex: number) => {
		for (let index = 0; index < ENVELOPE_COUNT; index += 1) {
			if (index === chosenIndex) {
				continue;
			}
			const missedRarity = cards[index]?.prize?.rarity;
			const regretDelayMs =
				missedRarity === "legend" ? 260 : missedRarity === "rare" ? 140 : 0;
			const delayMs = prefersReducedMotion
				? 0
				: Math.floor(Math.random() * 500) + regretDelayMs;
			schedule(() => {
				setCards((previous) =>
					previous.map((card, cardIndex) =>
						cardIndex === index
							? {
									...card,
									isOpened: true,
									isMissed: true,
								}
							: card,
					),
				);
			}, delayMs);
		}
	};

	const playNormalReveal = (cardIndex: number, selectedPrize: Prize) => {
		schedule(() => revealOtherCards(cardIndex), NORMAL_REVEAL_MS);
		schedule(() => setModalPrize(selectedPrize), NORMAL_REVEAL_MS + RESULT_DELAY_MS);
	};

	const playLegendaryReveal = (cardIndex: number, selectedPrize: Prize) => {
		const sourceCard = cardRefs.current[cardIndex];
		const cloneHost = cloneHostRef.current;

		if (prefersReducedMotion || !sourceCard || !cloneHost) {
			schedule(() => {
				revealOtherCards(cardIndex);
				setCards((previous) =>
					previous.map((card, index) =>
						index === cardIndex
							? {
									...card,
									isOpened: true,
									prize: selectedPrize,
								}
							: card,
					),
				);
				schedule(() => {
					setModalPrize(selectedPrize);
				}, RESULT_DELAY_MS);
			}, LEGENDARY_FALLBACK_REVEAL_MS);
			return;
		}

		const sourceRect = sourceCard.getBoundingClientRect();
		const clone = sourceCard.cloneNode(true) as HTMLDivElement;
		clone.style.position = "absolute";
		clone.style.left = `${sourceRect.left}px`;
		clone.style.top = `${sourceRect.top}px`;
		clone.style.width = `${sourceRect.width}px`;
		clone.style.height = `${sourceRect.height}px`;
		clone.style.transformOrigin = "center";
		clone.style.transition = "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)";
		clone.style.willChange = "transform";
		cloneHost.appendChild(clone);
		legendCloneRef.current = clone;

		setLegendaryFx({
			isActive: true,
			focusedCardIndex: cardIndex,
		});

		schedule(() => {
			if (legendCloneRef.current !== clone) {
				return;
			}
			const centerX = window.innerWidth / 2 - sourceRect.width / 2;
			const centerY = window.innerHeight / 2 - sourceRect.height / 2;
			clone.style.transform = `translate(${centerX - sourceRect.left}px, ${centerY - sourceRect.top}px) scale(1.2)`;
			const cloneCard = clone.querySelector<HTMLElement>(".card-inner");
			if (cloneCard) {
				cloneCard.style.animation = "shake-violent 0.5s infinite";
			}
		}, LEGENDARY_MOVE_TO_CENTER_MS);

		schedule(() => {
			revealOtherCards(cardIndex);

			if (legendCloneRef.current === clone) {
				const cloneCard = clone.querySelector<HTMLElement>(".card-inner");
				if (cloneCard) {
					cloneCard.style.animation = "none";
				}
				const cloneFlap = clone.querySelector<HTMLElement>(".layerFlapWrapper");
				if (cloneFlap) {
					cloneFlap.style.transform = "translate3d(0,0,0) rotateX(180deg)";
					cloneFlap.style.zIndex = "5";
				}
				const cloneTicket = clone.querySelector<HTMLElement>(".layerTicket");
				if (cloneTicket) {
					cloneTicket.style.transform = "translate3d(0,-112%,1px) scale(1.08)";
					cloneTicket.style.zIndex = "30";
					cloneTicket.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
				}
				const cloneTicketValue = clone.querySelector<HTMLElement>(
					".layerTicket .font-cinzel",
				);
				if (cloneTicketValue) {
					cloneTicketValue.textContent = formatCurrency(selectedPrize.amount);
				}
			}

			schedule(() => {
				setCards((previous) =>
					previous.map((card, index) =>
						index === cardIndex
							? {
									...card,
									isOpened: true,
									prize: selectedPrize,
								}
							: card,
					),
				);
				clearLegendaryArtifacts(false);
				setModalPrize(selectedPrize);
			}, RESULT_DELAY_MS);
		}, LEGENDARY_REVEAL_MS);
	};

	const handleCardClick = async (cardIndex: number) => {
		if (phase !== "READY" || disabled) {
			return;
		}

		setPhase("REVEAL");
		onRevealStateChange(true);

		try {
			const selectedPrize = await onRedeem(cardIndex);
			if (selectedPrize.rarity === "legend") {
				playLegendaryReveal(cardIndex, selectedPrize);
			} else {
				setCards((previous) =>
					previous.map((card, index) =>
						index === cardIndex
							? {
									...card,
									isOpened: true,
									prize: selectedPrize,
								}
							: card,
					),
				);
				playNormalReveal(cardIndex, selectedPrize);
			}
		} catch {
			setPhase("READY");
			onRevealStateChange(false);
		}
	};

	return (
		<section
			className={`relative w-full h-dvh overflow-hidden perspective-2000 font-vn transition-colors duration-700 ${
				legendaryFx.isActive
					? "bg-black"
					: "bg-[radial-gradient(circle_at_50%_30%,rgba(116,14,14,0.4),var(--color-black-ink))]"
			}`}
			aria-live="polite"
		>
			<svg
				className="absolute w-0 h-0 pointer-events-none -z-10"
				aria-hidden="true"
			>
				<filter id="paperRoughness">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.04"
						numOctaves="5"
						result="noise"
					/>
					<feDiffuseLighting in="noise" lightingColor="#fff" surfaceScale="2">
						<feDistantLight azimuth="45" elevation="60" />
					</feDiffuseLighting>
					<feComposite operator="in" in2="SourceGraphic" />
					<feBlend in="SourceGraphic" mode="multiply" />
				</filter>
			</svg>

			<div className="fixed inset-0 pointer-events-none opacity-5 z-10 noise-overlay" />

			<div
				className={`absolute inset-0 z-20 bg-black transition-opacity duration-700 ${
					legendaryFx.isActive ? "opacity-60" : "opacity-0"
				}`}
			/>

			<div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4 sm:px-6">
				<HeroSection
					guestName={guestName}
					statusMessage={statusMessage}
					canBegin={canBegin}
					showHero={showHero}
					onStart={handleStart}
				/>

				<div
					className={`absolute inset-0 w-full flex flex-col items-center justify-center gap-4 sm:gap-6 px-4 sm:px-6 transition-[opacity,visibility,transform] duration-800 ease-smooth ${
						showGrid
							? "opacity-100 visible pointer-events-auto"
							: "opacity-0 invisible pointer-events-none"
					}`}
				>
					<div className="grid [grid-template-columns:repeat(2,minmax(0,max-content))] md:[grid-template-columns:repeat(5,minmax(0,max-content))] gap-x-3 gap-y-3 sm:gap-x-4 sm:gap-y-4 md:gap-x-6 md:gap-y-5 lg:gap-x-8 lg:gap-y-6 w-full max-w-[1600px] mx-auto px-1 sm:px-2 md:px-5 pb-1 pt-1 justify-center justify-items-center content-center perspective-distant">
						{cards.map((card, index) => (
							<EnvelopeCard
								key={`envelope-${index}`} // biome-ignore lint/suspicious/noArrayIndexKey: static envelope count
								ref={(node) => {
									cardRefs.current[index] = node;
								}}
								card={card}
								index={index}
								isReady={phase === "READY"}
								isDetached={
									legendaryFx.isActive &&
									legendaryFx.focusedCardIndex === index
								}
								onClick={() => handleCardClick(index)}
							/>
						))}
					</div>
				</div>
			</div>

			<div ref={cloneHostRef} className="fixed inset-0 z-[9000] pointer-events-none" />

			<ResultModal
				prize={modalPrize}
				guestName={guestName}
				onCollect={() => {
					resetStage();
					onCollect();
				}}
			/>
		</section>
	);
}
