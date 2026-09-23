"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, PartyPopper, Sparkles } from "lucide-react";
import type {
	GamePlayStageProps,
	GenericClaimDetail,
	GenericPlayOutcome,
} from "@/app/game-templates/types";
import { scratchCoverPalette } from "@/app/game-templates/scratch-card/coverPalettes";
import {
	recoveredOutcomeKey,
	shouldAdoptRecoveredClaim,
	shouldAdoptRecoveredOutcome,
} from "@/app/game-templates/recoveryPolicy";

/**
 * Scratch-card stage. Interaction model (docs/design-scratch-card.md):
 * - Erasing (pointer/touch strokes on the coating canvas) is independent from
 *   the reveal request: strokes keep erasing while the request is in flight.
 * - The FIRST deliberate input (stroke or keyboard button) fires exactly ONE
 *   immutable server reveal via onPlay({ type: "scratch-reveal" }). A failed
 *   request allows a retry, which replays the same server-side allocation.
 * - revealThresholdPercent is presentation-only: once the authoritative
 *   outcome is in hand, measured canvas coverage at or above the threshold
 *   auto-removes the rest of the coating. The keyboard control offers an
 *   immediate full-clear bypass. The threshold is never a security gate.
 * - A recovered outcome (reload) opens the card directly — no re-scratching.
 */

/** Coarse alpha sampling grid (~40 samples across the short side). */
const COVERAGE_SAMPLE_GRID = 40;
const COVERAGE_THROTTLE_MS = 120;
const CLEAR_FADE_MS = 700;

export default function ScratchCardStage({
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
	const context = (playContext ?? {}) as {
		coverStyle?: string;
		revealThresholdPercent?: number;
	};
	const palette = scratchCoverPalette(context.coverStyle);
	const coverStyleClass = `scratch-cover--${
		typeof context.coverStyle === "string" ? context.coverStyle : "gold"
	}`;
	// Presentation-only coating-clear threshold (10-100) from the frozen
	// snapshot; never consulted for authorization.
	const revealThreshold = Math.min(
		100,
		Math.max(10, Math.round(Number(context.revealThresholdPercent) || 55)),
	);

	const [outcome, setOutcome] = useState<GenericPlayOutcome | null>(
		initialOutcome ?? null,
	);
	const [claim, setClaim] = useState<GenericClaimDetail | null>(
		initialClaim ?? null,
	);
	const [claimPending, setClaimPending] = useState(false);
	const [pending, setPending] = useState(false);
	const [playError, setPlayError] = useState("");
	// Coating fully removed → the result panel (with all controls) renders.
	// A reload that recovers an immutable outcome opens the card immediately.
	const [coatingOpen, setCoatingOpen] = useState(Boolean(initialOutcome));
	const [clearing, setClearing] = useState(false);
	const [scratchPercent, setScratchPercent] = useState(0);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	// Request gate: at most one reveal request in flight, none after the
	// authoritative outcome exists. Deliberately NOT tied to drawing.
	const inFlightRef = useRef(false);
	const outcomeRef = useRef<GenericPlayOutcome | null>(initialOutcome ?? null);
	const clearStartedRef = useRef(Boolean(initialOutcome));
	const activePointerRef = useRef<number | null>(null);
	const lastCoverageReadRef = useRef(0);
	const clearTimerRef = useRef<number | null>(null);
	const appliedOutcomeKeyRef = useRef("");
	const resultPrimaryRef = useRef<HTMLButtonElement | null>(null);
	const resultVisible = Boolean(outcome) && coatingOpen;

	const prefersReducedMotion = () =>
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	/** Threshold presentation rule: the outcome is already authoritative, so
	 * this only decides when the remaining coating auto-removes. */
	const evaluateAutoClear = (coverage?: number) => {
		if (clearStartedRef.current || !outcomeRef.current) return;
		const measured = coverage ?? measureCoverage();
		if (measured >= revealThreshold) {
			beginClear();
		}
	};

	const beginClear = () => {
		if (clearStartedRef.current) return;
		clearStartedRef.current = true;
		if (prefersReducedMotion()) {
			setCoatingOpen(true);
			return;
		}
		setClearing(true);
		clearTimerRef.current = window.setTimeout(() => {
			clearTimerRef.current = null;
			setCoatingOpen(true);
		}, CLEAR_FADE_MS);
	};

	// Delayed recovery: adopt the completed outcome when this session has not
	// been played locally yet. Recovery means the play happened BEFORE this
	// mount (earlier visit or another device), so the card opens without
	// re-scratching — mirroring the mount-time initialOutcome path. The
	// adoption policy already refuses to run while a local reveal is in
	// flight or in hand, so a delayed live query can never bypass the
	// presentation threshold during a local play.
	useEffect(() => {
		if (
			!shouldAdoptRecoveredOutcome({
				localOutcome: outcome,
				incoming: initialOutcome ?? null,
				appliedKey: appliedOutcomeKeyRef.current,
				localPlayAttempted: inFlightRef.current,
			})
		) {
			return;
		}
		const recovered = initialOutcome;
		if (!recovered) return;
		appliedOutcomeKeyRef.current = recoveredOutcomeKey(recovered);
		outcomeRef.current = recovered;
		setOutcome(recovered);
		setClaim(null);
		beginClear();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- gates are refs; a re-run re-evaluates cheaply
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
		if (resultVisible) {
			resultPrimaryRef.current?.focus();
		}
	}, [resultVisible, claim]);

	useEffect(() => {
		return () => {
			if (clearTimerRef.current !== null) {
				window.clearTimeout(clearTimerRef.current);
			}
		};
	}, []);

	// Coating paint: one foil layer per uncovered mount, tinted by the frozen
	// coverStyle palette so the choice is visible on the actual card.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || coatingOpen) return;
		const parent = canvas.parentElement;
		if (!parent) return;
		const rect = parent.getBoundingClientRect();
		canvas.width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
		canvas.height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
		const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
		gradient.addColorStop(0, palette.canvas[0]);
		gradient.addColorStop(0.5, palette.canvas[1]);
		gradient.addColorStop(1, palette.canvas[2]);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, rect.width, rect.height);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- palette is stable for a mounted card
	}, [coatingOpen]);

	/** Real coverage: share of sampled coating pixels erased by strokes. */
	const measureCoverage = (): number => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return 0;
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		const stride = Math.max(
			4,
			Math.round(Math.min(canvas.width, canvas.height) / COVERAGE_SAMPLE_GRID),
		);
		let total = 0;
		let cleared = 0;
		for (let y = 0; y < canvas.height; y += stride) {
			for (let x = 0; x < canvas.width; x += stride) {
				total += 1;
				if (data[(y * canvas.width + x) * 4 + 3] < 32) cleared += 1;
			}
		}
		return total === 0 ? 0 : Math.round((cleared / total) * 100);
	};

	const authorizeReveal = async () => {
		// Request gate only — drawing never consults this.
		if (inFlightRef.current || outcomeRef.current || !canPlay || disabled) return;
		inFlightRef.current = true;
		setPending(true);
		setPlayError("");
		onRevealStateChange?.(true);
		try {
			const result = await onPlay({ type: "scratch-reveal" });
			outcomeRef.current = result;
			appliedOutcomeKeyRef.current = recoveredOutcomeKey(result);
			setOutcome(result);
			evaluateAutoClear();
		} catch (unknownError) {
			// The reveal never landed: the next deliberate input may retry it.
			setPlayError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể mở thẻ lúc này",
			);
		} finally {
			inFlightRef.current = false;
			setPending(false);
			onRevealStateChange?.(false);
		}
	};

	const eraseAt = (canvas: HTMLCanvasElement, x: number, y: number) => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const rect = canvas.getBoundingClientRect();
		const localX = Math.min(Math.max(0, x - rect.left), rect.width);
		const localY = Math.min(Math.max(0, y - rect.top), rect.height);
		const radius = Math.max(18, rect.width * 0.07);
		ctx.globalCompositeOperation = "destination-out";
		ctx.beginPath();
		ctx.arc(localX, localY, radius, 0, Math.PI * 2);
		ctx.fill();
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (coatingOpen || !canPlay || disabled) return;
		if (activePointerRef.current !== null) return;
		activePointerRef.current = event.pointerId;
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// A synthetic/inactive pointer cannot be captured; the stroke still
			// erases and authorizes from the canvas events themselves.
		}
		eraseAt(event.currentTarget, event.clientX, event.clientY);
		// First deliberate stroke authorizes the ONE server reveal; further
		// strokes during the request keep erasing (independent gates).
		void authorizeReveal();
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (coatingOpen || activePointerRef.current !== event.pointerId) return;
		eraseAt(event.currentTarget, event.clientX, event.clientY);
		const now = Date.now();
		if (now - lastCoverageReadRef.current >= COVERAGE_THROTTLE_MS) {
			lastCoverageReadRef.current = now;
			const coverage = measureCoverage();
			setScratchPercent(coverage);
			evaluateAutoClear(coverage);
		}
	};

	const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (activePointerRef.current !== event.pointerId) return;
		activePointerRef.current = null;
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			// Capture may already be gone (cancel/leave); the stroke just ends.
		}
		if (coatingOpen) return;
		const coverage = measureCoverage();
		setScratchPercent(coverage);
		evaluateAutoClear(coverage);
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

	const resolvedCollect = copy.collectLabel?.trim() || "Nhận quà";
	const showFinishButton =
		Boolean(outcome) && coatingOpen && (Boolean(claim) || !outcome?.canClaim);

	return (
		<main className="scratch-stage">
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
				<header className="flex flex-col items-center">
					<p className="scratch-hero__eyebrow">{copy.subtitle?.trim() || "Tri ân"}</p>
					<h1 className="scratch-hero__title">
						{copy.title?.trim() || "Thẻ cào may mắn"}
					</h1>
					{statusMessage ? (
						<p className="scratch-hero__subtitle" role="status">
							{statusMessage}
						</p>
					) : null}
				</header>

				<div
					className={`scratch-card-shell${coatingOpen ? " scratch-card-shell--open" : ""}`}
				>
					<div
						aria-hidden="true"
						className={`scratch-cover-backdrop ${coverStyleClass}`}
					>
						<Sparkles aria-hidden="true" size={28} />
					</div>
					{!coatingOpen ? (
						<div className="scratch-teaser" data-testid="scratch-beneath">
							<p className="scratch-result__eyebrow">Phần thưởng của bạn</p>
							<p className="scratch-teaser__label">
								<span className="scratch-chip">
									Chà sáng lớp phủ để nhận phần thưởng
								</span>
							</p>
						</div>
					) : null}
					{!coatingOpen ? (
						<div
							className="scratch-cover-wrap"
							data-scratch-coverage={scratchPercent}
							data-testid="scratch-cover"
						>
							<canvas
								ref={canvasRef}
								className={`scratch-cover-canvas${clearing ? " scratch-cover-canvas--clearing" : ""}`}
								data-testid="scratch-canvas"
								aria-label="Lớp phủ thẻ cào"
								onPointerDown={handlePointerDown}
								onPointerMove={handlePointerMove}
								onPointerUp={endStroke}
								onPointerCancel={endStroke}
							/>
							<p className="scratch-cover-hint">
								<span className="scratch-chip">
									{outcome
										? "Kết quả đã sẵn sàng — chà tiếp hoặc gỡ lớp phủ"
										: "Chà sáng lớp phủ để nhận phần thưởng"}
								</span>
							</p>
							<div className="scratch-cover-bar" aria-hidden="true">
								<div
									className="scratch-cover-bar__fill"
									style={{ width: `${scratchPercent}%` }}
								/>
							</div>
						</div>
					) : null}
					{pending ? (
						<div className="scratch-pending" role="status">
							Đang mở thẻ…
						</div>
					) : null}
					{resultVisible && outcome ? (
						<section
							aria-label="Kết quả thẻ cào"
							className="scratch-result"
							data-testid="scratch-result-panel"
						>
							<p className="scratch-result__eyebrow">
								{outcome.kind === "reward" ? "Chúc mừng bạn" : "Kết quả"}
							</p>
							<h2 className="scratch-result__label">{outcome.label}</h2>
							{claim?.secretCode ? (
								<p className="scratch-result__code" data-testid="scratch-code">
									{claim.secretCode}
								</p>
							) : null}
							{claim?.instructions ? (
								<p className="scratch-result__instructions">
									{claim.instructions}
								</p>
							) : null}
							<div className="scratch-result__actions">
								{outcome.canClaim && !claim ? (
									<button
										className="scratch-cta"
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
										className="scratch-button"
										onClick={onCollect}
										ref={outcome.canClaim && !claim ? undefined : resultPrimaryRef}
										type="button"
									>
										<PartyPopper aria-hidden="true" size={16} />
										Hoàn tất
									</button>
								) : null}
							</div>
						</section>
					) : null}
				</div>

				{/* Controls live OUTSIDE the coated card: nothing interactive is
				    ever beneath the coating or the pending overlay. */}
				<div className="scratch-stage__controls">
					{!coatingOpen && !pending ? (
						<button
							className="scratch-button"
							data-testid="scratch-keyboard-reveal"
							disabled={!canPlay || disabled}
							onClick={() => {
								if (outcome) {
									// Threshold bypass: immediate full clear of the coating.
									beginClear();
									return;
								}
								void authorizeReveal();
							}}
							type="button"
						>
							<Sparkles aria-hidden="true" size={15} />
							{outcome ? "Gỡ lớp phủ ngay" : "Gỡ lớp phủ bằng bàn phím"}
						</button>
					) : null}
					{outcome && coatingOpen && outcome.canClaim && !claim ? (
						<button className="scratch-button" onClick={onCollect} type="button">
							Rời trang (để dành phần thưởng)
						</button>
					) : null}
					{playError ? (
						<p className="scratch-error" role="alert">
							{playError}
							{!outcome ? " — hãy thử lại." : ""}
						</p>
					) : null}
				</div>
			</div>
		</main>
	);
}
