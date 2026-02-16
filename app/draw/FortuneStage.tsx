"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ENVELOPE_COUNT, RARITY_LABELS, type Rarity } from "@/lib/lixiPolicy";
import { formatCurrency } from "./hostUtils";

type Prize = {
	amount: number;
	rarity: Rarity;
};

type RewardPoolItem = {
	amount: number;
	rarity: Rarity;
	remainingQuantity: number;
};

type CardState = {
	isIn: boolean;
	isOpened: boolean;
	isMissed: boolean;
	prize: Prize | null;
};

type Phase = "IDLE" | "INTRO" | "READY" | "REVEAL";

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
const NORMAL_REVEAL_MS = 1500;
const LEGEND_REVEAL_MS = 1800;
const RESULT_DELAY_MS = 2000;

function createInitialCards() {
	return Array.from({ length: ENVELOPE_COUNT }, () => ({
		isIn: false,
		isOpened: false,
		isMissed: false,
		prize: null,
	})) as CardState[];
}

function ticketRarityClass(rarity: Rarity | null) {
	if (!rarity) {
		return "";
	}
	if (rarity === "legend") {
		return "text-[#8a6e1e] border-2 border-gold-base bg-linear-to-br from-[#fffde7] to-[#fff8e1] animate-legend-glow";
	}
	if (rarity === "rare") {
		return "text-red-vivid border border-[#ef9a9a] bg-linear-to-b from-white to-[#ffebee]";
	}
	return "text-[#555] border border-[#ddd] bg-white";
}

function rarityModalGlow(rarity: Rarity) {
	if (rarity === "legend") {
		return "bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.2)_0%,rgba(179,20,20,0.08)_40%,transparent_70%)]";
	}
	if (rarity === "rare") {
		return "bg-[radial-gradient(circle_at_50%_40%,rgba(179,20,20,0.2)_0%,transparent_60%)]";
	}
	return "bg-[radial-gradient(circle_at_50%_50%,rgba(179,20,20,0.1),transparent_70%)]";
}

function rollFromPool(pool: RewardPoolItem[]): Prize {
	const available = pool.filter((item) => item.remainingQuantity > 0);
	if (available.length === 0) {
		return { amount: 100000, rarity: "common" };
	}

	const totalWeight = available.reduce(
		(sum, item) => sum + item.remainingQuantity,
		0,
	);
	let threshold = Math.floor(Math.random() * totalWeight);
	for (const item of available) {
		threshold -= item.remainingQuantity;
		if (threshold < 0) {
			return { amount: item.amount, rarity: item.rarity };
		}
	}

	const fallback = available[available.length - 1];
	return { amount: fallback.amount, rarity: fallback.rarity };
}

function revealTilt(wrapper: HTMLElement, clientX: number, clientY: number) {
	const card = wrapper.querySelector<HTMLElement>(".card-inner");
	if (!card) {
		return;
	}

	const rect = wrapper.getBoundingClientRect();
	const x = clientX - rect.left;
	const y = clientY - rect.top;
	const rotateX = (y / rect.height - 0.5) * -20;
	const rotateY = (x / rect.width - 0.5) * 20;
	card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;

	const px = (1 - x / rect.width) * 100;
	const py = (1 - y / rect.height) * 100;
	wrapper.querySelectorAll<HTMLElement>(".foilLayer").forEach((node) => {
		node.style.backgroundPosition = `${px}% ${py}%`;
	});
}

/* ── Ornamental Divider ── */
function OrnamentDivider({ className = "" }: { className?: string }) {
	return (
		<div
			className={`flex items-center justify-center gap-3 select-none ${className}`}
			aria-hidden="true"
		>
			<span className="block h-px w-10 sm:w-16 bg-linear-to-r from-transparent to-gold-base/40" />
			<span className="text-gold-base/60 text-xs">✦</span>
			<span className="block h-px w-10 sm:w-16 bg-linear-to-l from-transparent to-gold-base/40" />
		</div>
	);
}

/* ── Envelope Card ── */
function EnvelopeCard({
	card,
	index,
	isReady,
	onClick,
	onPointerMove,
	onPointerLeave,
}: {
	card: CardState;
	index: number;
	isReady: boolean;
	onClick: () => void;
	onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
}) {
	return (
		<div
			className={`group relative w-36 sm:w-40 md:w-44 lg:w-48 aspect-[0.72] preserve-3d cursor-pointer transition-[opacity,transform] duration-600 ease-elastic ${
				card.isIn
					? "opacity-100 translate-y-0"
					: "opacity-0 translate-y-[100px]"
			} ${
				card.isMissed
					? "grayscale brightness-[0.3] pointer-events-none scale-[0.96] transition-all duration-700"
					: ""
			} ${
				isReady && !card.isOpened && !card.isMissed
					? "animate-card-breathe hover:scale-[1.06] hover:-translate-y-1 active:scale-[0.97]"
					: ""
			}`}
			onClick={onClick}
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
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
					<div className="foilLayer absolute inset-0 pointer-events-none z-50 opacity-70 bg-linear-to-br from-transparent via-white/30 to-white/20 bg-size-[200%_200%] bg-position-[100%_100%] mix-blend-overlay transition-[background-position] duration-100" />
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
						<div className="foilLayer absolute inset-0 pointer-events-none z-50 opacity-70 bg-linear-to-br from-transparent via-white/30 to-white/20 bg-size-[200%_200%] bg-position-[100%_100%] mix-blend-overlay transition-[background-position] duration-100" />
					</div>
					<div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,50%_85%)] rounded-[4px_4px_0_0] backface-hidden bg-[#4a0505] rotate-y-180 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0,transparent_2px)]" />
					<div className="absolute bottom-[15%] left-1/2 w-9 h-9 sm:w-11 sm:h-11 -translate-x-1/2 translate-y-1/2 translate-z-px rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-gold-shine),var(--color-gold-shine),#8a6e1e)] text-red-deep font-cinzel text-[1.1rem] sm:text-[1.4rem] flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_0_0_2px_rgba(255,215,0,0.8)]">
						福
					</div>
				</div>
			</div>

			{/* Card number */}
			<span className="absolute -bottom-6 sm:-bottom-7 left-1/2 -translate-x-1/2 text-[0.7rem] sm:text-[0.8rem] tracking-[2px] text-gold-base/40 font-cinzel tabular-nums select-none">
				{String(index + 1).padStart(2, "0")}
			</span>

			{/* Hover glow ring (only when ready) */}
			{isReady && !card.isOpened && !card.isMissed ? (
				<div className="absolute -inset-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-[radial-gradient(circle,rgba(212,175,55,0.08)_0%,transparent_70%)]" />
			) : null}
		</div>
	);
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
	onExit,
}: FortuneStageProps) {
	const [phase, setPhase] = useState<Phase>("IDLE");
	const [cards, setCards] = useState<CardState[]>(() => createInitialCards());
	const [showHero, setShowHero] = useState(true);
	const [showGrid, setShowGrid] = useState(false);
	const [showInstruction, setShowInstruction] = useState(false);
	const [modalPrize, setModalPrize] = useState<Prize | null>(null);
	const [isLegendary, setIsLegendary] = useState(false);
	const timeoutRef = useRef<number[]>([]);

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
		setIsLegendary(false);
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
		setCards(createInitialCards());

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

	const revealOtherCards = (chosenIndex: number, chosenPrize: Prize) => {
		const remaining = Array.from({ length: ENVELOPE_COUNT - 1 }, () =>
			rollFromPool(rewardPool),
		);
		setCards((previous) =>
			previous.map((card, index) => {
				if (index === chosenIndex) {
					return card;
				}
				const prize = remaining.pop() ?? chosenPrize;
				return {
					...card,
					isOpened: true,
					isMissed: true,
					prize,
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
			setIsLegendary(selectedPrize.rarity === "legend");

			schedule(() => revealOtherCards(cardIndex, selectedPrize), revealDelay);
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
				onPointerMove={(event) => {
					if (phase !== "READY") {
						return;
					}
					revealTilt(event.currentTarget, event.clientX, event.clientY);
				}}
				onPointerLeave={(event) => {
					const cardNode =
						event.currentTarget.querySelector<HTMLElement>(".card-inner");
					if (cardNode) {
						cardNode.style.transform = "none";
					}
				}}
			/>
		));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cards, phase]);

	return (
		<section
			className={`relative w-full h-dvh flex flex-col overflow-hidden perspective-2000 font-vn transition-shadow duration-1000 bg-[radial-gradient(circle_at_50%_30%,rgba(116,14,14,0.4),var(--color-black-ink))] ${
				isLegendary ? "animate-legend-glow" : ""
			}`}
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

			{/* ── Ambient Lights ── */}
			<div
				className={`fixed rounded-full pointer-events-none z-1 w-[800px] h-[800px] top-[-20%] left-[-10%] transition-all duration-1500 ${
					isLegendary
						? "animate-glow-pulse opacity-50 bg-[radial-gradient(circle,var(--color-gold-base)_0%,var(--color-red-vivid)_40%,transparent_70%)]"
						: "opacity-30 blur-[100px] bg-[radial-gradient(circle,var(--color-red-vivid)_0%,transparent_70%)]"
				}`}
			/>
			<div className="fixed rounded-full blur-[100px] opacity-[0.15] pointer-events-none z-1 w-[600px] h-[600px] bottom-[-20%] right-[-10%] animate-float-slow bg-[radial-gradient(circle,#ff4500_0%,transparent_70%)]" />
			<div
				className={`fixed rounded-full blur-[100px] pointer-events-none z-1 w-[400px] h-[400px] top-[40%] left-[40%] mix-blend-overlay animate-float-medium transition-opacity duration-1500 bg-[radial-gradient(circle,var(--color-gold-base)_0%,transparent_70%)] ${
					isLegendary ? "opacity-30" : "opacity-10"
				}`}
			/>

			{/* ── Header ── */}
			<header className="relative z-20 shrink-0 flex justify-between items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-6">
				<div className="flex items-center gap-3">
					<span className="font-cinzel text-[0.8rem] sm:text-[0.95rem] tracking-[0.25em] sm:tracking-[0.32em] uppercase text-gold-base/60">
						Lì Xì Station
					</span>
					{guestName ? (
						<>
							<span className="text-gold-base/30 text-xs hidden sm:inline">
								•
							</span>
							<span className="text-gold-shine/70 text-[0.8rem] sm:text-[0.9rem] font-playfair hidden sm:inline truncate max-w-[180px]">
								{guestName}
							</span>
						</>
					) : null}
				</div>
				{onExit ? (
					<button
						type="button"
						className="group/btn border border-gold-base/30 bg-[rgba(25,4,4,0.7)] text-gold-shine/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[0.8rem] sm:text-[0.9rem] cursor-pointer backdrop-blur-sm hover:-translate-y-px hover:border-gold-shine/60 hover:bg-[rgba(64,10,10,0.85)] hover:text-gold-shine transition-all duration-200 font-vn flex items-center gap-1.5"
						onClick={onExit}
					>
						<svg
							className="w-3.5 h-3.5 opacity-60 group-hover/btn:opacity-100 transition-opacity"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M15.75 19.5L8.25 12l7.5-7.5"
							/>
						</svg>
						Về host
					</button>
				) : null}
			</header>

			{/* ── Main Content ── */}
			<div className="relative z-10 flex-1 min-h-0 w-full flex flex-col items-center justify-center px-4 sm:px-6 pb-4 sm:pb-6">
				<div className="relative w-full h-full flex flex-col items-center justify-center">
					{/* ── Hero Section ── */}
					<div
						className={`text-center relative z-30 transition-[opacity,transform] duration-800 ease-smooth flex flex-col items-center ${
							showHero
								? "animate-fade-in-up"
								: "opacity-0 -translate-y-5 pointer-events-none absolute inset-0"
						}`}
					>
						{/* Decorative top ornament */}
						<div
							className="mb-4 sm:mb-6 text-gold-base/30 text-2xl select-none"
							aria-hidden="true"
						>
							❧
						</div>

						{guestName ? (
							<p className="mb-3 sm:mb-4 text-gold-shine/60 text-sm sm:text-base tracking-[2px] font-playfair">
								Chào mừng,{" "}
								<span className="text-gold-shine/90 font-bold">
									{guestName}
								</span>
							</p>
						) : null}

						<h1 className="m-0 font-cinzel text-[clamp(36px,5.2vw,72px)] leading-[1.05] bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]">
							Lunar Fortune
						</h1>

						<OrnamentDivider className="mt-3 sm:mt-4" />

						<p className="mt-2 sm:mt-3 text-white/50 tracking-[3px] sm:tracking-[4px] uppercase text-xs sm:text-sm font-playfair">
							Premium Gacha Experience
						</p>

						<button
							type="button"
							className="group/cta mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base font-cinzel text-sm sm:text-base tracking-[2px] uppercase cursor-pointer backdrop-blur-sm shadow-[0_0_20px_rgba(0,0,0,0.45)] hover:bg-[rgba(80,0,0,0.82)] hover:border-gold-shine/70 hover:text-gold-shine hover:shadow-[0_0_40px_rgba(212,175,55,0.22)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_0_20px_rgba(0,0,0,0.45)] relative overflow-hidden"
							disabled={!canBegin}
							onClick={handleStart}
						>
							{/* Shimmer sweep on hover */}
							<span className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/cta:translate-x-full transition-transform duration-700 pointer-events-none" />
							<span className="relative z-10">Summon Luck</span>
						</button>

						{statusMessage ? (
							<p className="mt-5 text-[0.85rem] sm:text-[0.95rem] text-gold-shine/60 max-w-sm leading-relaxed">
								{statusMessage}
							</p>
						) : null}
					</div>

					{/* ── Grid Section ── */}
					<div
						className={`relative w-full h-full flex items-center justify-center transition-[opacity,visibility] duration-800 ease-smooth ${
							showGrid
								? "opacity-100 visible pointer-events-auto"
								: "opacity-0 invisible pointer-events-none absolute"
						}`}
					>
						{/* Instruction banner */}
						<div
							className={`absolute left-1/2 top-[clamp(0.5rem,5vh,3rem)] -translate-x-1/2 text-center overflow-hidden transition-[max-height,opacity,transform,margin] duration-500 ease-smooth ${
								showInstruction
									? "max-h-28 sm:max-h-32 opacity-100 translate-y-0"
									: "max-h-0 opacity-0 -translate-y-3 pointer-events-none"
							}`}
						>
							{guestName ? (
								<p className="text-gold-shine/50 text-xs sm:text-sm mb-1 font-playfair">
									Lượt của{" "}
									<span className="text-gold-shine/80 font-bold">
										{guestName}
									</span>
								</p>
							) : null}
							<p className="text-gold-base/70 text-sm sm:text-base tracking-[2px] uppercase font-cinzel animate-pulse-slow">
								Chọn một phong bao
							</p>
							<OrnamentDivider className="mt-2" />
						</div>

						{/* Card grid */}
						<div className="grid [grid-template-columns:repeat(2,minmax(0,max-content))] md:[grid-template-columns:repeat(5,minmax(0,max-content))] gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-5 md:gap-x-8 md:gap-y-7 lg:gap-x-10 lg:gap-y-8 w-full max-w-[1600px] mx-auto px-1 sm:px-2 md:px-5 pb-6 pt-1 justify-center justify-items-center content-center perspective-distant">
							{cardsList}
						</div>
					</div>
				</div>
			</div>

			{/* ── Result Modal ── */}
			<div
				className={`fixed inset-0 z-1000 flex flex-col items-center justify-center transition-[opacity,visibility] duration-500 bg-black/[0.96] ${
					modalPrize
						? "opacity-100 visible pointer-events-auto"
						: "opacity-0 invisible pointer-events-none"
				}`}
				role="dialog"
				aria-modal="true"
				aria-label="Kết quả rút phong bao"
			>
				{/* Rarity-aware background glow */}
				<div
					className={`absolute inset-0 -z-10 transition-opacity duration-700 ${
						modalPrize ? rarityModalGlow(modalPrize.rarity) : ""
					}`}
				/>

				{/* Decorative sparkles for legendary */}
				{modalPrize?.rarity === "legend" ? (
					<div
						className="absolute inset-0 overflow-hidden pointer-events-none -z-5"
						aria-hidden="true"
					>
						<span className="absolute top-[20%] left-[15%] w-1 h-1 rounded-full bg-gold-base animate-sparkle opacity-0" />
						<span className="absolute top-[45%] left-[75%] w-1 h-1 rounded-full bg-gold-base animate-sparkle opacity-0 [animation-delay:0.3s]" />
						<span className="absolute top-[70%] left-[30%] w-1 h-1 rounded-full bg-gold-base animate-sparkle opacity-0 [animation-delay:0.6s]" />
						<span className="absolute top-[35%] left-[55%] w-1 h-1 rounded-full bg-gold-base animate-sparkle opacity-0 [animation-delay:0.9s]" />
						<span className="absolute top-[60%] left-[85%] w-1 h-1 rounded-full bg-gold-base animate-sparkle opacity-0 [animation-delay:1.2s]" />
						<span className="absolute top-[80%] left-[45%] w-1 h-1 rounded-full bg-gold-base animate-sparkle opacity-0 [animation-delay:1.5s]" />
					</div>
				) : null}

				<div
					className={`flex flex-col items-center ${modalPrize ? "animate-modal-enter" : ""}`}
				>
					<p className="m-0 text-xs sm:text-sm tracking-[3px] sm:tracking-[4px] uppercase text-white/50 font-playfair">
						Bạn nhận được
					</p>

					<OrnamentDivider className="my-3 sm:my-4" />

					<h2 className="mt-1 mb-2 font-cinzel text-[clamp(38px,5vw,72px)] leading-tight bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(212,175,55,0.3)] animate-count-up">
						{modalPrize ? formatCurrency(modalPrize.amount) : "0đ"}
					</h2>

					{guestName ? (
						<p className="mt-1 text-white/40 text-xs sm:text-sm font-playfair">
							cho <span className="text-gold-shine/70">{guestName}</span>
						</p>
					) : null}

					<button
						type="button"
						className="group/collect mt-8 sm:mt-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border border-gold-base/40 bg-[rgba(40,0,0,0.65)] text-gold-base font-cinzel text-sm sm:text-base tracking-[2px] uppercase cursor-pointer backdrop-blur-sm shadow-[0_0_20px_rgba(0,0,0,0.45)] hover:bg-[rgba(80,0,0,0.82)] hover:border-gold-shine/70 hover:text-gold-shine hover:shadow-[0_0_40px_rgba(212,175,55,0.22)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 relative overflow-hidden"
						onClick={() => {
							resetStage();
							onCollect();
						}}
					>
						<span className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/collect:translate-x-full transition-transform duration-700 pointer-events-none" />
						<span className="relative z-10">Nhận lì xì</span>
					</button>
				</div>
			</div>
		</section>
	);
}
