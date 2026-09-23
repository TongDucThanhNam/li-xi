"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, PartyPopper, Play } from "lucide-react";
import type {
	GamePlayStageProps,
	GenericClaimDetail,
	GenericPlayOutcome,
} from "@/app/game-templates/types";
import type { SlotCombination, SlotSymbolKey } from "@/lib/gameTemplates";
import { SLOT_MISS_COMBINATION } from "@/lib/gameTemplates";
import {
	SLOT_IDLE_COMBINATION,
	SLOT_SYMBOL_ICONS,
} from "@/app/game-templates/slot-reveal/slotSymbols";
import {
	recoveredOutcomeKey,
	shouldAdoptRecoveredClaim,
	shouldAdoptRecoveredOutcome,
} from "@/app/game-templates/recoveryPolicy";

/**
 * Slot-reveal stage (docs/design-slot-reveal.md). Exactly ONE server action
 * ({ type: "spin-reels" }) per session, fired by the Spin control (pointer
 * or keyboard). Reels loop while the request is in flight, then settle ON
 * the authoritative combination with a staggered ease-out; reduced motion
 * settles instantly. Recovery (reload/closure) presents the settled
 * combination without any spin. No monetary stake, no free plays accounting.
 */

const REEL_BASE_MS = 900;
const REEL_STAGGER_MS = 240;
/** Minimum visible loop before the settle so fast responses still read as a spin. */
const MIN_SPIN_MS = 1200;

type SlotPlayContext = {
	reelTheme?: string;
	winningCombinations?: Array<{ itemId?: string; symbolKeys?: string[] }>;
	missCombination?: string[];
};

type Phase = "hero" | "spinning" | "settling" | "result";

const REEL_THEME_CLASSES: Record<string, string> = {
	gold: "slot-machine--gold",
	neon: "slot-machine--neon",
	festive: "slot-machine--festive",
};

function normalizeCombination(keys: string[] | undefined): SlotCombination | null {
	if (!keys || keys.length !== 3) return null;
	const valid = keys.every((key) => key in SLOT_SYMBOL_ICONS);
	return valid ? ([keys[0], keys[1], keys[2]] as SlotCombination) : null;
}

export default function SlotRevealStage({
	canPlay,
	disabled,
	statusMessage,
	copy,
	heroAssetUrl,
	playContext,
	initialOutcome,
	initialClaim,
	onPlay,
	onClaim,
	onCollect,
	onRevealStateChange,
}: GamePlayStageProps) {
	// Frozen for the mount: a live config/pool edit never re-renders an
	// in-flight machine; the authoritative combination comes from the outcome.
	const frozenContextRef = useRef<SlotPlayContext | null>(null);
	if (!frozenContextRef.current) {
		frozenContextRef.current = (playContext ?? {}) as SlotPlayContext;
	}
	const context = frozenContextRef.current;
	const reelThemeClass =
		REEL_THEME_CLASSES[
			typeof context.reelTheme === "string" ? context.reelTheme : "gold"
		] ?? REEL_THEME_CLASSES.gold;

	const [phase, setPhase] = useState<Phase>(initialOutcome ? "result" : "hero");
	const [outcome, setOutcome] = useState<GenericPlayOutcome | null>(
		initialOutcome ?? null,
	);
	const [settledCombination, setSettledCombination] =
		useState<SlotCombination | null>(null);
	const [claim, setClaim] = useState<GenericClaimDetail | null>(
		initialClaim ?? null,
	);
	const [claimPending, setClaimPending] = useState(false);
	const [playError, setPlayError] = useState("");

	const spinTimerRef = useRef<number | null>(null);
	const settleTimerRef = useRef<number | null>(null);
	const appliedOutcomeKeyRef = useRef("");
	const localPlayAttemptedRef = useRef(false);
	const resultPrimaryRef = useRef<HTMLButtonElement | null>(null);

	const prefersReducedMotion = () =>
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	/** The documented mapping: reward item id → [k,k,k]; no-reward → miss. */
	const resolveCombination = (
		result: GenericPlayOutcome,
	): SlotCombination | null => {
		if (result.kind === "no-reward") {
			return (
				normalizeCombination(context.missCombination) ??
				SLOT_MISS_COMBINATION
			);
		}
		if (!result.segmentKey) return null;
		const match = (context.winningCombinations ?? []).find(
			(entry) => entry.itemId === result.segmentKey,
		);
		return match ? normalizeCombination(match.symbolKeys) : null;
	};

	useEffect(() => {
		return () => {
			if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current);
			if (settleTimerRef.current !== null)
				window.clearTimeout(settleTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (phase === "result") {
			resultPrimaryRef.current?.focus();
		}
	}, [phase, claim]);

	// Delayed recovery: adopt the completed outcome when this session has not
	// been played locally yet; the machine presents the settled combination
	// without any spin.
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
		setSettledCombination(resolveCombination(recovered));
		setPhase("result");
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mapping is frozen per mount
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

	const resolvedCta = copy.ctaLabel?.trim() || "Quay ngay";
	const resolvedCollect = copy.collectLabel?.trim() || "Nhận quà";
	const resolvedTitle = copy.title?.trim() || "Máy quay tri ân";

	/**
	 * The reels always display a deterministic identity: while spinning, the
	 * loop layer runs; otherwise the authoritative combination. An outcome
	 * outside the frozen mapping never shows a landed combination — the
	 * machine is withheld entirely (see `unmappedResult`).
	 */
	const resolvedCombination = outcome ? resolveCombination(outcome) : null;
	// Truthful fallback: an authoritative outcome outside the frozen mapping
	// (synthetic robustness case) renders the result/claim/Finish without a
	// machine that would imply a landing.
	const unmappedResult =
		phase === "result" && Boolean(outcome) && !resolvedCombination;
	const displayedCombination: SlotCombination =
		resolvedCombination ??
		(phase === "settling" && settledCombination
			? settledCombination
			: SLOT_IDLE_COMBINATION);

	const handleSpin = async () => {
		if (phase !== "hero" || disabled || !canPlay) {
			return;
		}
		localPlayAttemptedRef.current = true;
		setPlayError("");
		setPhase("spinning");
		onRevealStateChange?.(true);
		const spinStartedAt = Date.now();
		try {
			const result = await onPlay({ type: "spin-reels" });
			const combination = resolveCombination(result);
			setOutcome(result);
			if (!combination) {
				// Truthful fallback: the award is outside the frozen candidate
				// set — present the result without a reel landing.
				setPhase("result");
				onRevealStateChange?.(false);
				return;
			}
			// Keep the loop visible for at least MIN_SPIN_MS (reduced motion
			// skips the wait: the identity lands instantly).
			const elapsed = Date.now() - spinStartedAt;
			const wait = prefersReducedMotion()
				? 0
				: Math.max(0, MIN_SPIN_MS - elapsed);
			spinTimerRef.current = window.setTimeout(() => {
				spinTimerRef.current = null;
				setSettledCombination(combination);
				setPhase("settling");
				const totalMs = prefersReducedMotion()
					? 0
					: REEL_BASE_MS + REEL_STAGGER_MS * 2;
				settleTimerRef.current = window.setTimeout(() => {
					settleTimerRef.current = null;
					setPhase("result");
					onRevealStateChange?.(false);
				}, totalMs);
			}, wait);
		} catch (unknownError) {
			setPhase("hero");
			onRevealStateChange?.(false);
			setPlayError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể quay lúc này",
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
				unknownError instanceof Error
					? unknownError.message
					: "Không thể nhận thưởng lúc này",
			);
		} finally {
			setClaimPending(false);
		}
	};

	const showResultButton = phase === "result" && Boolean(outcome);
	// Completion is always available: no-reward finishes directly, an
	// unclaimed reward can be left without claiming, a claimed reward exits.
	const showFinishButton =
		showResultButton && Boolean(outcome) && (Boolean(claim) || !outcome?.canClaim);

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
				<header className="flex flex-col items-center">
					<p className="slot-hero__eyebrow">{copy.subtitle?.trim() || "Tri ân"}</p>
					<h1 className="slot-hero__title">{resolvedTitle}</h1>
					{statusMessage ? (
						<p className="slot-hero__subtitle" role="status">
							{statusMessage}
						</p>
					) : null}
				</header>

				{!unmappedResult ? (
					<section
						aria-label="Máy quay tri ân"
						className={`slot-machine ${reelThemeClass}`}
						data-slot-phase={phase}
						data-testid="slot-machine"
					>
						<div className="slot-marquee" aria-hidden="true">
							{Array.from({ length: 9 }, (_, index) => (
								<span className="slot-marquee__bulb" key={index} />
							))}
						</div>
						<div className="slot-reels">
							{displayedCombination.map((symbolKey, index) => {
								const Icon = SLOT_SYMBOL_ICONS[symbolKey];
								return (
									<div
										className={`slot-reel${phase === "spinning" ? " slot-reel--spinning" : ""}`}
										data-reel-index={index}
										data-reel-symbol={
											phase === "spinning" ? undefined : symbolKey
										}
										data-testid="slot-reel"
										key={index}
									>
										<div className="slot-reel__loop" aria-hidden="true">
											<div className="slot-reel__loop-track">
												{(Object.keys(SLOT_SYMBOL_ICONS) as SlotSymbolKey[]).map(
													(key) => {
														const LoopIcon = SLOT_SYMBOL_ICONS[key];
														return (
															<span
																className="slot-reel__cell"
																data-loop-symbol={key}
																key={key}
															>
																<LoopIcon aria-hidden="true" size={34} />
															</span>
														);
													},
												)}
												{(Object.keys(SLOT_SYMBOL_ICONS) as SlotSymbolKey[]).map(
													(key) => {
														const LoopIcon = SLOT_SYMBOL_ICONS[key];
														return (
															<span
																className="slot-reel__cell"
																data-loop-symbol={key}
																key={`repeat-${key}`}
															>
																<LoopIcon aria-hidden="true" size={34} />
															</span>
														);
													},
												)}
											</div>
										</div>
										<div
											className={`slot-reel__window${phase === "settling" ? " slot-reel__window--settle" : ""}`}
											style={
												phase === "settling"
													? {
															animationDuration: `${REEL_BASE_MS}ms`,
															animationDelay: `${index * REEL_STAGGER_MS}ms`,
														}
													: undefined
											}
										>
											<Icon aria-hidden="true" size={34} />
										</div>
									</div>
								);
							})}
						</div>
						{phase === "hero" || phase === "spinning" ? (
							<div className="slot-machine__controls">
								<button
									className="slot-cta"
									data-testid="slot-spin"
									disabled={!canPlay || disabled || phase === "spinning"}
									onClick={() => void handleSpin()}
									type="button"
								>
									<Play aria-hidden="true" size={18} />
									{phase === "spinning" ? "Đang quay…" : resolvedCta}
								</button>
							</div>
						) : null}
					</section>
				) : null}

				{phase === "spinning" ? (
					<p aria-live="polite" className="slot-status" role="status">
						Đang quay…
					</p>
				) : null}
				{playError ? (
					<p className="slot-error" role="alert">
						{playError}
					</p>
				) : null}

				{showResultButton && outcome ? (
					<section
						aria-label="Kết quả máy quay"
						className={`slot-result ${outcome.kind === "reward" ? "slot-result--win" : ""}`}
						data-testid="slot-result-panel"
					>
						<p className="slot-result__eyebrow">
							{outcome.kind === "reward" ? "Chúc mừng bạn" : "Kết quả"}
						</p>
						<h2 className="slot-result__label">{outcome.label}</h2>
						{claim?.secretCode ? (
							<p className="slot-result__code" data-testid="slot-code">
								{claim.secretCode}
							</p>
						) : null}
						{claim?.instructions ? (
							<p className="slot-result__instructions">{claim.instructions}</p>
						) : null}
						<div className="slot-result__actions">
							{outcome.canClaim && !claim ? (
								<button
									className="slot-cta"
									disabled={claimPending}
									onClick={() => void handleClaim()}
									ref={resultPrimaryRef}
									type="button"
								>
									<Gift aria-hidden="true" size={18} />
									{claimPending ? "Đang nhận…" : resolvedCollect}
								</button>
							) : null}
							{showFinishButton ? (
								<button
									className="slot-button"
									onClick={onCollect}
									ref={outcome.canClaim && !claim ? undefined : resultPrimaryRef}
									type="button"
								>
									<PartyPopper aria-hidden="true" size={16} />
									Hoàn tất
								</button>
							) : null}
							{outcome.canClaim && !claim ? (
								<button className="slot-button" onClick={onCollect} type="button">
									Rời trang (để dành phần thưởng)
								</button>
							) : null}
						</div>
					</section>
				) : null}
			</div>
		</main>
	);
}
