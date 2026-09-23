"use client";

import { useEffect, useRef, useState } from "react";
import { Gift } from "lucide-react";
import { ENVELOPE_COUNT } from "@/lib/lixiPolicy";
import { EnvelopeCard } from "@/app/draw/fortune/EnvelopeCard";
import { HeroSection } from "@/app/draw/fortune/HeroSection";
import { OrnamentDivider } from "@/app/draw/fortune/OrnamentDivider";
import type { CardState, Phase, Prize } from "@/app/draw/fortune/types";
import type {
	GamePlayStageProps,
	GenericClaimDetail,
	GenericPlayOutcome,
} from "@/app/game-templates/types";
import {
	recoveredOutcomeKey,
	shouldAdoptRecoveredClaim,
	shouldAdoptRecoveredOutcome,
} from "@/app/game-templates/recoveryPolicy";

const ENTRY_STAGGER_MS = 80;
const HERO_HIDE_MS = 500;
const READY_DELAY_MS = 1000;
const NORMAL_REVEAL_MS = 1200;

/**
 * Generic-contract adapter for the Lunar Fortune envelope experience. The
 * reward decision stays server-side: no client prize pool, no amount/rarity
 * pre-assignment — envelopes are cosmetic and the outcome arrives from
 * onPlay({ type: "reveal-envelope" }).
 */
export default function LunarPlayStage({
	sessionKey,
	canPlay,
	disabled,
	statusMessage,
	copy,
	heroAssetUrl,
	initialOutcome,
	initialClaim,
	autoBegin,
	onPlay,
	onClaim,
	onCollect,
	onRevealStateChange,
}: GamePlayStageProps) {
	const [phase, setPhase] = useState<Phase>("IDLE");
	const [cards, setCards] = useState<CardState[]>(() =>
		Array.from({ length: ENVELOPE_COUNT }, () => ({
			isIn: false,
			isOpened: false,
			isMissed: false,
			prize: null,
		})),
	);
	const [showHero, setShowHero] = useState(!initialOutcome);
	const [showGrid, setShowGrid] = useState(false);
	const [outcome, setOutcome] = useState<GenericPlayOutcome | null>(initialOutcome ?? null);
	const [claim, setClaim] = useState<GenericClaimDetail | null>(initialClaim ?? null);
	const [claimPending, setClaimPending] = useState(false);
	const [playError, setPlayError] = useState("");
	const timeoutRef = useRef<number[]>([]);
	const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
	// Recovery synchronization: restored completed sessions adopt their
	// outcome/claim without restarting play; a genuinely new sessionKey still
	// resets the stage.
	const prevSessionKeyRef = useRef(sessionKey);
	const appliedOutcomeKeyRef = useRef("");
	const localPlayAttemptedRef = useRef(false);
	const autoBeganRef = useRef(false);
	const resultPrimaryRef = useRef<HTMLButtonElement | null>(null);
	const resultVisible = Boolean(outcome);

	const prefersReducedMotion =
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const schedule = (callback: () => void, delayMs: number) => {
		const timer = window.setTimeout(callback, delayMs);
		timeoutRef.current.push(timer);
	};

	const clearTimers = () => {
		timeoutRef.current.forEach((timer) => window.clearTimeout(timer));
		timeoutRef.current = [];
	};

	useEffect(() => {
		if (prevSessionKeyRef.current === sessionKey) {
			// First mount (or remount with the same session): keep recovered
			// completed state instead of resetting to the hero.
			return;
		}
		prevSessionKeyRef.current = sessionKey;
		clearTimers();
		appliedOutcomeKeyRef.current = "";
		autoBeganRef.current = false;
		setPhase("IDLE");
		setCards(
			Array.from({ length: ENVELOPE_COUNT }, () => ({
				isIn: false,
				isOpened: false,
				isMissed: false,
				prize: null,
			})),
		);
		setShowHero(true);
		setShowGrid(false);
		setOutcome(null);
		setClaim(null);
		setPlayError("");
	}, [sessionKey]);

	// Delayed recovery: adopt the completed outcome when this session has not
	// been played locally yet.
	useEffect(() => {
		if (
			!shouldAdoptRecoveredOutcome({
				localOutcome: outcome,
				incoming: initialOutcome ?? null,
				appliedKey: appliedOutcomeKeyRef.current,
				localPlayAttempted: localPlayAttemptedRef.current,
			})
		) {
			return;
		}
		const recovered = initialOutcome;
		if (!recovered) return;
		appliedOutcomeKeyRef.current = recoveredOutcomeKey(recovered);
		setOutcome(recovered);
		setClaim(null);
		setPhase("REVEAL");
		setShowHero(false);
		setShowGrid(false);
	}, [initialOutcome, outcome]);

	// Delayed recovery: adopt the recorded claim once the outcome is present,
	// never overwriting a newer local claim.
	useEffect(() => {
		if (
			!shouldAdoptRecoveredClaim({
				localOutcome: outcome,
				localClaim: claim,
				incomingClaim: initialClaim ?? null,
			})
		) {
			return;
		}
		const recoveredClaimDetail = initialClaim;
		if (!recoveredClaimDetail) return;
		setClaim(recoveredClaimDetail);
	}, [initialClaim, claim, outcome]);

	useEffect(() => {
		return () => clearTimers();
	}, []);

	// Move focus into the visible result actions whenever the panel appears
	// (fresh reveal or restored outcome) so background controls stay inert.
	useEffect(() => {
		if (resultVisible) {
			resultPrimaryRef.current?.focus();
		}
	}, [resultVisible, claim]);

	// A freshly admitted (or restored active) session proceeds straight into
	// the envelope intro with the same premium transition as the explicit
	// start: purely presentational — nothing is allocated or revealed here.
	useEffect(() => {
		if (autoBeganRef.current || !autoBegin) {
			return;
		}
		if (phase !== "IDLE" || !canPlay || disabled || initialOutcome) {
			return;
		}
		autoBeganRef.current = true;
		setPhase("INTRO");
		setShowHero(false);
		schedule(() => {
			setShowGrid(true);
			for (let index = 0; index < ENVELOPE_COUNT; index += 1) {
				schedule(() => {
					setCards((previous) =>
						previous.map((card, cardIndex) =>
							cardIndex === index ? { ...card, isIn: true } : card,
						),
					);
				}, index * ENTRY_STAGGER_MS);
			}
			schedule(() => setPhase("READY"), READY_DELAY_MS);
		}, prefersReducedMotion ? 0 : HERO_HIDE_MS);
		// prefersReducedMotion is a stable per-page media-query read; the
		// autoBegan guard keeps the intro one-shot regardless.
	}, [
		autoBegin,
		canPlay,
		disabled,
		initialOutcome,
		phase,
		prefersReducedMotion,
	]);

	const handleStart = () => {
		if (phase !== "IDLE" || !canPlay || disabled) {
			return;
		}
		setPhase("INTRO");
		setShowHero(false);
		schedule(() => {
			setShowGrid(true);
			for (let index = 0; index < ENVELOPE_COUNT; index += 1) {
				schedule(() => {
					setCards((previous) =>
						previous.map((card, cardIndex) =>
							cardIndex === index ? { ...card, isIn: true } : card,
						),
					);
				}, index * ENTRY_STAGGER_MS);
			}
			schedule(() => setPhase("READY"), READY_DELAY_MS);
		}, prefersReducedMotion ? 0 : HERO_HIDE_MS);
	};

	const handleCardSelect = async (cardIndex: number) => {
		if (phase !== "READY" || disabled) {
			return;
		}
		localPlayAttemptedRef.current = true;
		setPhase("REVEAL");
		onRevealStateChange?.(true);
		try {
			const result = await onPlay({ type: "reveal-envelope", envelopeIndex: cardIndex });
			const revealDelay = prefersReducedMotion ? 0 : NORMAL_REVEAL_MS;
			schedule(() => {
				setCards((previous) =>
					previous.map((card, index) => ({
						...card,
						isOpened: index === cardIndex ? true : card.isOpened,
						isMissed: index === cardIndex ? false : true,
						prize: index === cardIndex ? cosmeticPrize(result) : card.prize,
					})),
				);
				setOutcome(result);
				onRevealStateChange?.(false);
			}, revealDelay);
		} catch (unknownError) {
			setPhase("READY");
			onRevealStateChange?.(false);
			setPlayError(
				unknownError instanceof Error ? unknownError.message : "Không thể mở phong bao lúc này",
			);
		}
	};

	const handleClaim = async () => {
		setClaimPending(true);
		try {
			const detail = await onClaim();
			setClaim(detail);
		} catch (unknownError) {
			setPlayError(
				unknownError instanceof Error ? unknownError.message : "Không thể nhận thưởng lúc này",
			);
		} finally {
			setClaimPending(false);
		}
	};

	const resolvedCta = copy.ctaLabel?.trim() || "Thử vận may";
	const resolvedCollect = copy.collectLabel?.trim() || "Nhận thưởng";

	return (
		<>
			<section
				aria-live="polite"
				inert={resultVisible ? true : undefined}
				className="font-vn perspective-2000 relative h-dvh w-full overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(116,14,14,0.4),var(--color-black-ink))] transition-colors duration-700"
			>
				<svg aria-hidden="true" className="pointer-events-none absolute -z-10 h-0 w-0">
					<filter id="paperRoughness">
						<feTurbulence baseFrequency="0.04" numOctaves="5" result="noise" type="fractalNoise" />
						<feDiffuseLighting in="noise" lightingColor="#fff" surfaceScale="2">
							<feDistantLight azimuth="45" elevation="60" />
						</feDiffuseLighting>
						<feComposite in2="SourceGraphic" operator="in" />
						<feBlend in="SourceGraphic" mode="multiply" />
					</filter>
				</svg>
				<div aria-hidden="true" className="noise-overlay pointer-events-none fixed inset-0 z-10 opacity-5" />

				{heroAssetUrl ? (
					<div
						aria-hidden="true"
						className="absolute inset-0 z-0 bg-cover bg-center opacity-25 mix-blend-screen"
						style={{ backgroundImage: `url(${heroAssetUrl})` }}
					/>
				) : null}

				<div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4 sm:px-6">
					<HeroSection
						canBegin={canPlay && !disabled && phase === "IDLE"}
						campaignSubtitle={copy.subtitle}
						campaignTitle={copy.title || "Lunar Fortune"}
						ctaLabel={resolvedCta}
						onStart={handleStart}
						showHero={showHero}
						statusMessage={statusMessage}
						waitingMessage={copy.waitingMessage}
					/>

					<div
						className={`absolute inset-0 flex w-full flex-col items-center justify-center gap-4 px-4 pb-1 pt-1 transition-[opacity,visibility,transform] duration-800 ease-smooth sm:gap-6 sm:px-6 ${
							showGrid ? "pointer-events-auto visible opacity-100" : "pointer-events-none invisible opacity-0"
						}`}
					>
						<div className="mx-auto grid w-full max-w-[1600px] content-center justify-center justify-items-center gap-x-3 gap-y-3 [grid-template-columns:repeat(2,minmax(0,max-content))] perspective-distant sm:gap-x-4 sm:gap-y-4 md:gap-x-6 md:gap-y-5 md:[grid-template-columns:repeat(5,minmax(0,max-content))] lg:gap-x-8 lg:gap-y-6">
							{cards.map((card, index) => (
								<EnvelopeCard
									key={`envelope-${index}`}
									ref={(node) => {
										cardRefs.current[index] = node;
									}}
									card={card}
									index={index}
									isDetached={false}
									isReady={phase === "READY"}
									onClick={() => void handleCardSelect(index)}
								/>
							))}
						</div>
						{playError ? (
							<p className="font-vn text-sm text-red-vivid" role="alert">
								{playError}
							</p>
						) : null}
					</div>
				</div>
			</section>

			<LunarResultPanel
				collectLabel={resolvedCollect}
				claim={claim}
				claimPending={claimPending}
				onClaim={() => void handleClaim()}
				onCollect={onCollect}
				outcome={outcome}
			/>
		</>
	);
}

function cosmeticPrize(outcome: GenericPlayOutcome): Prize {
	// Envelope visuals expect an amount/rarity pair; generic outcomes keep
	// their server label, so non-cash rewards render with a zero amount and a
	// common ticket while the result panel shows the real label.
	return {
		amount: outcome.rewardType === "cash" ? outcome.amount ?? 0 : 0,
		rarity: outcome.kind === "reward" ? "rare" : "common",
	};
}

function LunarResultPanel({
	outcome,
	claim,
	claimPending,
	collectLabel,
	onClaim,
	onCollect,
}: {
	outcome: GenericPlayOutcome | null;
	claim: GenericClaimDetail | null;
	claimPending: boolean;
	collectLabel: string;
	onClaim: () => void;
	onCollect: () => void;
}) {
	const visible = Boolean(outcome);
	const primaryRef = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		if (visible) {
			primaryRef.current?.focus();
		}
	}, [visible, claim]);
	const isWin = outcome?.kind === "reward";
	return (
		<div
			aria-label="Kết quả lì xì"
			aria-modal="true"
			role="dialog"
			data-result-panel="true"
			className={`fixed inset-0 z-1000 flex flex-col items-center justify-center transition-[opacity,visibility] duration-500 ${
				visible ? "pointer-events-auto visible opacity-100" : "pointer-events-none invisible opacity-0"
			}`}
			style={{ background: "rgba(0,0,0,0.96)" }}
		>
			<div
				className={`absolute inset-0 -z-10 transition-opacity duration-700 ${
					isWin
						? "bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.2)_0%,rgba(179,20,20,0.08)_40%,transparent_70%)]"
						: "bg-[radial-gradient(circle_at_50%_50%,rgba(179,20,20,0.1),transparent_70%)]"
				}`}
			/>
			<div className="animate-modal-enter relative z-10 flex flex-col items-center">
				<p className="m-0 font-playfair text-xs uppercase tracking-[3px] text-white/50 sm:text-sm sm:tracking-[4px]">
					{isWin ? "Bạn nhận được" : "Lần này chưa có"}
				</p>
				<OrnamentDivider className="my-3 sm:my-4" />
				<h2
					className={`font-cinzel text-[clamp(28px,5vw,58px)] leading-tight ${
						isWin
							? "animate-legend-glow bg-linear-to-b from-gold-shine via-gold-base to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_50px_rgba(212,175,55,0.6)]"
							: "bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent"
					}`}
				>
					{outcome?.label ?? ""}
				</h2>
				{claim?.secretCode ? (
					<p className="mt-4 break-all rounded-xl border border-dashed border-gold-base/60 bg-black-ink/60 px-5 py-3 font-cinzel text-lg tracking-[0.08em] text-gold-shine">
						{claim.secretCode}
					</p>
				) : null}
				{claim?.instructions ? (
					<p className="mt-2 max-w-sm text-center font-playfair text-sm text-gold-shine/70">
						{claim.instructions}
					</p>
				) : null}
				<div className="mt-8 flex flex-wrap justify-center gap-3 sm:mt-10">
					{outcome?.canClaim && !claim ? (
						<button
							className="mag-btn inline-flex items-center gap-2 px-8 py-3.5 sm:px-10 sm:py-4"
							disabled={claimPending}
							onClick={onClaim}
							ref={primaryRef}
							type="button"
						>
							<Gift aria-hidden="true" size={18} />
							{claimPending ? "Đang nhận…" : collectLabel}
						</button>
					) : null}
					{outcome && (claim || !outcome.canClaim) ? (
						<button
							className="mag-btn px-8 py-3.5 sm:px-10 sm:py-4"
							onClick={onCollect}
							ref={outcome.canClaim && !claim ? undefined : primaryRef}
							type="button"
						>
							Hoàn tất
						</button>
					) : null}
					{outcome?.canClaim && !claim ? (
						<button
							className="rounded-full border border-gold-base/50 px-6 py-3 font-vn text-sm text-gold-shine/80"
							onClick={onCollect}
							type="button"
						>
							Rời trang (để dành phần thưởng)
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
