"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ENVELOPE_COUNT, type Rarity } from "@/lib/lixiPolicy";
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
		return "text-[#8a6e1e] border-2 border-gold-base bg-linear-to-br from-[#fffde7] to-[#fff8e1]";
	}
	if (rarity === "rare") {
		return "text-red-vivid border border-[#ef9a9a] bg-linear-to-b from-white to-[#ffebee]";
	}
	return "text-[#555] border border-[#ddd] bg-white";
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

function EnvelopeCard({
	card,
	index,
	onClick,
	onPointerMove,
	onPointerLeave,
}: {
	card: CardState;
	index: number;
	onClick: () => void;
	onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
}) {
	return (
		<div
			className={`relative w-full aspect-[0.72] preserve-3d cursor-pointer transition-[opacity,transform] duration-600 ease-elastic ${
				card.isIn
					? "opacity-100 translate-y-0"
					: "opacity-0 translate-y-[100px]"
			} ${card.isOpened ? "[&_.layerFlapWrapper]:translate-z-0 [&_.layerFlapWrapper]:rotate-x-180 [&_.layerFlapWrapper]:z-1 [&_.layerTicket]:-translate-y-[90%] [&_.layerTicket]:translate-z-px [&_.layerTicket]:scale-[1.1] [&_.layerTicket]:shadow-[0_10px_30px_rgba(0,0,0,0.3)] [&_.layerTicket]:z-20" : ""} ${
				card.isMissed ? "grayscale brightness-[0.3] pointer-events-none" : ""
			}`}
			onClick={onClick}
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
		>
			<div className="w-full h-full relative preserve-3d transition-transform duration-400 ease-smooth card-inner">
				<div className="absolute inset-0 rounded-[4px] -translate-z-px bg-liner-dark shadow-[0_10px_30px_rgba(0,0,0,0.5)] bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.2)_0,rgba(0,0,0,0.2)_1px,transparent_1px,transparent_4px)]" />
				<div
					className={`layerTicket absolute w-[80%] h-[75%] left-[10%] bottom-2 rounded-[4px_4px_2px_2px] translate-z-0 flex flex-col items-center justify-center overflow-hidden shadow-[0_2px_5px_rgba(0,0,0,0.2)] transition-transform duration-1200 ease-elastic z-5 bg-white text-[#333] ${ticketRarityClass(
						card.prize?.rarity ?? null,
					)}`}
				>
					<div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(45deg,#000_0,#000_1px,transparent_0,transparent_10px)]" />
					<span className="text-[0.65rem] tracking-[1.6px] uppercase mb-1 z-2">
						LUCKY MONEY
					</span>
					<span className="font-cinzel text-[1.15rem] font-black z-2">
						{card.isOpened && card.prize
							? formatCurrency(card.prize.amount)
							: "???"}
					</span>
				</div>
				<div className="absolute inset-0 filter-[url(#paperRoughness)] bg-linear-to-br from-red-vivid to-red-deep [clip-path:polygon(0_0,50%_12%,100%_0,100%_100%,0%_100%)] translate-z-px rounded-[4px] shadow-[inset_0_10px_20px_rgba(0,0,0,0.3)] transition-opacity duration-500 after:content-[''] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_120%,rgba(0,0,0,0.3)_0%,transparent_70%)] after:mix-blend-multiply">
					<div className="foilLayer absolute inset-0 pointer-events-none z-50 opacity-70 bg-linear-to-br from-transparent via-white/30 to-white/20 bg-size-[200%_200%] bg-position-[100%_100%] mix-blend-overlay transition-[background-position] duration-100" />
				</div>
				<div className="layerFlapWrapper absolute top-0 left-0 w-full h-[45%] origin-top translate-z-[2px] preserve-3d transition-[transform,opacity] duration-1000 ease-elastic z-10">
					<div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,50%_85%)] rounded-[4px_4px_0_0] backface-hidden bg-linear-to-b from-[#d32f2f] to-red-vivid filter-[url(#paperRoughness)]">
						<div className="foilLayer absolute inset-0 pointer-events-none z-50 opacity-70 bg-linear-to-br from-transparent via-white/30 to-white/20 bg-size-[200%_200%] bg-position-[100%_100%] mix-blend-overlay transition-[background-position] duration-100" />
					</div>
					<div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,50%_85%)] rounded-[4px_4px_0_0] backface-hidden bg-[#4a0505] rotate-y-180 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0,transparent_2px)]" />
					<div className="absolute bottom-[15%] left-1/2 w-11 h-11 -translate-x-1/2 translate-y-1/2 translate-z-px rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-gold-shine),var(--color-gold-shine),#8a6e1e)] text-red-deep font-cinzel text-[1.4rem] flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_0_0_2px_rgba(255,215,0,0.8)]">
						福
					</div>
				</div>
			</div>
			<span className="absolute -bottom-[26px] left-1/2 -translate-x-1/2 text-[0.85rem] tracking-[2px] text-[rgba(255,236,199,0.7)]">
				{index + 1}
			</span>
		</div>
	);
}

export default function FortuneStage({
	sessionId,
	canStart,
	disabled,
	statusMessage,
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
			schedule(() => setPhase("READY"), READY_DELAY_MS);
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
			onRevealStateChange(false);
		}
	};

	const cardsList = useMemo(() => {
		return cards.map((card, index) => (
			<EnvelopeCard
				key={`envelope-${index}`} // biome-ignore lint/suspicious/noArrayIndexKey: using index as key for static count
				card={card}
				index={index}
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
			className={`relative min-h-screen p-6 pb-8 overflow-hidden perspective-2000 font-vn ${
				isLegendary
					? "shadow-[0_0_0_1px_rgba(255,213,95,0.5),0_0_40px_rgba(255,187,58,0.25)]"
					: ""
			}`}
			style={{
				background:
					"radial-gradient(circle at 50% 30%, rgba(116, 14, 14, 0.4), var(--color-black-ink))",
			}}
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
			<div
				className="fixed inset-0 pointer-events-none opacity-5 z-10"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
				}}
			/>
			<div
				className="fixed rounded-full blur-[100px] opacity-30 pointer-events-none z-1 w-[800px] h-[800px] top-[-20%] left-[-10%]"
				style={{
					background:
						"radial-gradient(circle, var(--color-red-vivid) 0%, transparent 70%)",
				}}
			/>
			<div
				className="fixed rounded-full blur-[100px] opacity-[0.15] pointer-events-none z-1 w-[600px] h-[600px] bottom-[-20%] right-[-10%]"
				style={{
					background: "radial-gradient(circle, #ff4500 0%, transparent 70%)",
				}}
			/>
			<div
				className="fixed rounded-full blur-[100px] opacity-10 pointer-events-none z-1 w-[400px] h-[400px] top-[40%] left-[40%] mix-blend-overlay"
				style={{
					background:
						"radial-gradient(circle, var(--color-gold-base) 0%, transparent 70%)",
				}}
			/>

			<header className="relative z-20 flex justify-between items-center gap-3">
				<span className="font-cinzel text-[0.95rem] tracking-[0.32em] uppercase text-[rgba(255,237,199,0.8)]">
					Lì Xì Station
				</span>
				{onExit ? (
					<button
						type="button"
						className="border border-[rgba(255,228,168,0.45)] bg-[rgba(25,4,4,0.7)] text-[rgba(255,237,199,0.85)] px-4 py-2 rounded-full text-[0.9rem] cursor-pointer hover:-translate-y-px hover:border-gold-shine hover:bg-[rgba(64,10,10,0.85)] transition-all duration-200 font-vn"
						onClick={onExit}
					>
						Về host
					</button>
				) : null}
			</header>

			<div className="relative z-10 w-full min-h-[calc(100vh-80px)] flex flex-col items-center justify-center">
				<div className="relative w-full flex flex-col items-center justify-center">
					<div
						className={`text-center relative z-30 transition-[opacity,transform] duration-800 ease-smooth ${
							showHero ? "" : "opacity-0 -translate-y-5 pointer-events-none"
						}`}
					>
						<h1 className="m-0 font-cinzel text-[clamp(42px,5.2vw,72px)] leading-[1.05] bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]">
							Lunar Fortune
						</h1>
						<p className="mt-3 m-0 text-white/70 tracking-[4px] uppercase text-base">
							Premium Gacha Experience
						</p>
						<button
							type="button"
							className="mt-[30px] px-8 py-3.5 rounded-full border border-[rgba(212,175,55,0.45)] bg-[rgba(40,0,0,0.65)] text-gold-base font-cinzel text-base tracking-[2px] uppercase cursor-pointer backdrop-blur-[5px] shadow-[0_0_20px_rgba(0,0,0,0.45)] hover:bg-[rgba(80,0,0,0.82)] hover:border-gold-shine hover:text-white hover:shadow-[0_0_40px_rgba(212,175,55,0.22)] transition-all duration-300 disabled:opacity-[0.45] disabled:cursor-not-allowed"
							disabled={!canBegin}
							onClick={handleStart}
						>
							Summon Luck
						</button>
						{statusMessage ? (
							<p className="mt-[18px] text-[0.95rem] text-[rgba(255,214,171,0.78)]">
								{statusMessage}
							</p>
						) : null}
					</div>

					<div
						className={`grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-10 w-full max-w-[1600px] px-5 py-10 justify-center content-center perspective-distant transition-[opacity,visibility] duration-800 ease-smooth ${
							showGrid
								? "opacity-100 visible pointer-events-auto"
								: "opacity-0 invisible pointer-events-none"
						}`}
					>
						{cardsList}
					</div>
				</div>
			</div>

			<div
				className={`fixed inset-0 z-1000 flex flex-col items-center justify-center transition-[opacity,visibility] duration-500 ${
					modalPrize
						? "opacity-100 visible pointer-events-auto"
						: "opacity-0 invisible pointer-events-none"
				}`}
				style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
			>
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(179,20,20,0.15),transparent_70%)] -z-10" />
				<p className="m-0 text-base tracking-[4px] uppercase text-white/70">
					You Received
				</p>
				<h2 className="mt-[18px] mb-2 font-cinzel text-[clamp(42px,5vw,72px)] bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(212,175,55,0.3)]">
					{modalPrize ? formatCurrency(modalPrize.amount) : "0đ"}
				</h2>
				<button
					type="button"
					className="mt-[30px] px-8 py-3.5 rounded-full border border-[rgba(212,175,55,0.45)] bg-[rgba(40,0,0,0.65)] text-gold-base font-cinzel text-base tracking-[2px] uppercase cursor-pointer backdrop-blur-[5px] shadow-[0_0_20px_rgba(0,0,0,0.45)] hover:bg-[rgba(80,0,0,0.82)] hover:border-gold-shine hover:text-white hover:shadow-[0_0_40px_rgba(212,175,55,0.22)] transition-all duration-300"
					onClick={() => {
						resetStage();
						onCollect();
					}}
				>
					Collect
				</button>
			</div>
		</section>
	);
}
