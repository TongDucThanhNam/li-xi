"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ENVELOPE_COUNT, RARITY_LABELS } from "@/lib/lixiPolicy";
import { formatCurrency } from "./hostUtils";
import type { CardState, Phase, Prize, RewardPoolItem } from "./fortune/types";
import {
	buildPreAssignedPrizes,
	createInitialCards,
	getAvailablePrizeKinds,
} from "./fortune/prizePool";
import { OrnamentDivider } from "./fortune/OrnamentDivider";
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

const ENTRY_STAGGER_MS = 80;
const HERO_HIDE_MS = 500;
const READY_DELAY_MS = 1000;
const NORMAL_REVEAL_MS = 450;
const LEGEND_REVEAL_MS = 700;
const RESULT_DELAY_MS = 2000;

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
	onExit,
}: FortuneStageProps) {
	const [phase, setPhase] = useState<Phase>("IDLE");
	const [cards, setCards] = useState<CardState[]>(() => createInitialCards());
	const [showHero, setShowHero] = useState(true);
	const [showGrid, setShowGrid] = useState(false);
	const [showInstruction, setShowInstruction] = useState(false);
	const [modalPrize, setModalPrize] = useState<Prize | null>(null);
	const timeoutRef = useRef<number[]>([]);
	const availablePrizeKinds = useMemo(
		() => getAvailablePrizeKinds(rewardPool),
		[rewardPool],
	);
	const onlyAvailablePrize =
		availablePrizeKinds.length === 1 ? availablePrizeKinds[0] : null;

	const canBegin = canStart && !disabled && phase === "IDLE";

	const schedule = (callback: () => void, delayMs: number) => {
		const timer = window.setTimeout(callback, delayMs);
		timeoutRef.current.push(timer);
	};

	const clearTimers = () => {
		timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
		timeoutRef.current = [];
	};

	const resetStage = () => {
		clearTimers();
		setPhase("IDLE");
		setCards(createInitialCards());
		setShowHero(true);
		setShowGrid(false);
		setShowInstruction(false);
		setModalPrize(null);
		onRevealStateChange(false);
	};

	useEffect(() => {
		resetStage();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	useEffect(() => {
		return () => clearTimers();
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
			Array.from({ length: ENVELOPE_COUNT }, (_, i) => ({
				isIn: false,
				isOpened: false,
				isMissed: false,
				prize: preAssigned[i] ?? null,
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
			schedule(() => {
				setPhase("READY");
				setShowInstruction(true);
			}, READY_DELAY_MS);
		}, HERO_HIDE_MS);
	};

	// Prizes were already pre-assigned in handleStart – just mark as missed.
	const revealOtherCards = (chosenIndex: number) => {
		setCards((previous) =>
			previous.map((card, index) => {
				if (index === chosenIndex) {
					return card;
				}
				return {
					...card,
					isOpened: true,
					isMissed: true,
				};
			}),
		);
	};

	const handleCardClick = async (cardIndex: number) => {
		if (phase !== "READY" || disabled) {
			return;
		}

		setPhase("REVEAL");
		setShowInstruction(false);
		onRevealStateChange(true);

		try {
			const selectedPrize = await onRedeem(cardIndex);
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

			const revealDelay =
				selectedPrize.rarity === "legend" ? LEGEND_REVEAL_MS : NORMAL_REVEAL_MS;

			schedule(() => revealOtherCards(cardIndex), revealDelay);
			schedule(
				() => setModalPrize(selectedPrize),
				revealDelay + RESULT_DELAY_MS,
			);
		} catch {
			setPhase("READY");
			setShowInstruction(true);
			onRevealStateChange(false);
		}
	};

	const cardsList = useMemo(() => {
		return cards.map((card, index) => (
			<EnvelopeCard
				key={`envelope-${index}`} // biome-ignore lint/suspicious/noArrayIndexKey: using index as key for static count
				card={card}
				index={index}
				isReady={phase === "READY"}
				onClick={() => handleCardClick(index)}
			/>
		));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cards, phase]);

	return (
		<section
			className="relative w-full h-dvh overflow-hidden perspective-2000 font-vn bg-[radial-gradient(circle_at_50%_30%,rgba(116,14,14,0.4),var(--color-black-ink))]"
			aria-live="polite"
		>
			{/* ── SVG Filter ── */}
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

			{/* ── Noise Overlay ── */}
			<div className="fixed inset-0 pointer-events-none opacity-5 z-10 noise-overlay" />

			{/* ── Main Content ── */}
			<div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 sm:px-6">
					{/* ── Hero Section ── */}
					<HeroSection
						guestName={guestName}
						statusMessage={statusMessage}
						canBegin={canBegin}
						showHero={showHero}
						onStart={handleStart}
					/>

					{/* ── Grid Section ── */}
					<div
						className={`absolute inset-0 w-full flex flex-col items-center justify-center gap-4 sm:gap-6 px-4 sm:px-6 transition-[opacity,visibility,transform] duration-800 ease-smooth ${
							showGrid
								? "opacity-100 visible pointer-events-auto"
								: "opacity-0 invisible pointer-events-none"
						}`}
					>

						{/* Card grid */}
						<div className="grid [grid-template-columns:repeat(2,minmax(0,max-content))] md:[grid-template-columns:repeat(5,minmax(0,max-content))] gap-x-3 gap-y-3 sm:gap-x-4 sm:gap-y-4 md:gap-x-6 md:gap-y-5 lg:gap-x-8 lg:gap-y-6 w-full max-w-[1600px] mx-auto px-1 sm:px-2 md:px-5 pb-1 pt-1 justify-center justify-items-center content-center perspective-distant">
							{cardsList}
						</div>
					</div>
			</div>

			{/* ── Result Modal ── */}
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
