"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, PartyPopper, RotateCw, Sparkles } from "lucide-react";
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

const SEGMENT_PALETTE = [
	"#f5a623",
	"#2ec4b6",
	"#ef476f",
	"#7b6cf6",
	"#ffd166",
	"#4cc9f0",
	"#fff6e8",
	"#9b5de5",
];

const LIGHT_SEGMENTS = new Set(["#ffd166", "#fff6e8"]);
const SPIN_DURATION_MS = 4200;
const MIN_SPINS = 4;
const MAX_SPINS = 6;
const NO_REWARD_FALLBACK_KEY = "__no-reward__";

type WheelSegment = {
	key: string;
	label: string;
	fill: string;
	isNoReward: boolean;
};

function buildSegments(playContext: Record<string, unknown> | undefined): WheelSegment[] {
	const rawSegments = Array.isArray(playContext?.segments)
		? (playContext.segments as unknown[]).filter(
				(segment): segment is { key: string; label: string } =>
					typeof segment === "object" &&
					segment !== null &&
					typeof (segment as { key?: unknown }).key === "string" &&
					typeof (segment as { label?: unknown }).label === "string" &&
					(segment as { label: string }).label.trim().length > 0,
			)
		: [];
	// Legacy fixture/entry shape: plain labels without stable keys.
	const legacyLabels = rawSegments.length === 0 && Array.isArray(playContext?.prizeLabels)
		? (playContext.prizeLabels as unknown[]).filter(
				(label): label is string => typeof label === "string" && label.trim().length > 0,
			)
		: [];
	const noRewardLabel =
		typeof playContext?.noRewardLabel === "string" && playContext.noRewardLabel.trim()
			? playContext.noRewardLabel
			: "Chúc bạn may mắn lần sau";
	const noRewardKey =
		typeof playContext?.noRewardKey === "string" && playContext.noRewardKey
			? playContext.noRewardKey
			: NO_REWARD_FALLBACK_KEY;
	const segments: WheelSegment[] = (rawSegments.length > 0 ? rawSegments : legacyLabels.map((label) => ({ key: label, label }))).map(
		(segment, index) => ({
			key: segment.key,
			label: segment.label,
			fill: SEGMENT_PALETTE[index % SEGMENT_PALETTE.length],
			isNoReward: false,
		}),
	);
	segments.push({
		key: noRewardKey,
		label: noRewardLabel,
		fill: SEGMENT_PALETTE[3 % SEGMENT_PALETTE.length],
		isNoReward: true,
	});
	return segments;
}

function polarPoint(radius: number, angleDeg: number) {
	const radians = ((angleDeg - 90) * Math.PI) / 180;
	return {
		x: 100 + radius * Math.cos(radians),
		y: 100 + radius * Math.sin(radians),
	};
}

function segmentPath(startAngle: number, endAngle: number, radius: number) {
	const start = polarPoint(radius, startAngle);
	const end = polarPoint(radius, endAngle);
	const largeArc = endAngle - startAngle > 180 ? 1 : 0;
	return [
		`M 100 100`,
		`L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
		`A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
		"Z",
	].join(" ");
}

/** Stable-key matching first; label matching only for legacy label-keyed sets. */
function resolveTargetSegmentIndex(segments: WheelSegment[], outcome: GenericPlayOutcome): number {
	if (outcome.segmentKey) {
		const keyIndex = segments.findIndex((segment) => segment.key === outcome.segmentKey);
		if (keyIndex >= 0) {
			return keyIndex;
		}
	}
	const labelIndex = segments.findIndex((segment) => segment.label === outcome.label);
	if (labelIndex >= 0) {
		return labelIndex;
	}
	if (outcome.kind === "no-reward") {
		return segments.findIndex((segment) => segment.isNoReward);
	}
	return -1;
}

export default function LuckyWheelStage({
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
	// The displayed segment set is frozen for the lifetime of this session
	// mount: a live stock change never re-renders the wheel mid-journey, and
	// every configured outcome in the frozen set stays reachable.
	const frozenSegments = useRef<WheelSegment[] | null>(null);
	if (!frozenSegments.current) {
		frozenSegments.current = buildSegments(playContext);
	}
	const segments = frozenSegments.current;
	const segmentAngle = 360 / segments.length;
	const [phase, setPhase] = useState<"hero" | "spinning" | "result">(
		initialOutcome ? "result" : "hero",
	);
	const [rotation, setRotation] = useState(0);
	const [outcome, setOutcome] = useState<GenericPlayOutcome | null>(initialOutcome ?? null);
	const [claim, setClaim] = useState<GenericClaimDetail | null>(initialClaim ?? null);
	const [claimPending, setClaimPending] = useState(false);
	const [playError, setPlayError] = useState("");
	const spinTimerRef = useRef<number | null>(null);
	// Delayed recovery synchronization (same contract as the Lunar stage).
	const appliedOutcomeKeyRef = useRef("");
	const localPlayAttemptedRef = useRef(false);
	const resultPrimaryRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		return () => {
			if (spinTimerRef.current !== null) {
				window.clearTimeout(spinTimerRef.current);
			}
		};
	}, []);

	// Move focus into the visible result actions when the result appears.
	useEffect(() => {
		if (phase === "result") {
			resultPrimaryRef.current?.focus();
		}
	}, [phase, claim]);

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
		setPhase("result");
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
	const resolvedTitle = copy.title?.trim() || "Vòng quay may mắn";

	const showResultDirectly = (result: GenericPlayOutcome) => {
		// Truthful fallback: when the awarded key is not part of the frozen
		// displayed set, never land on an arbitrary wedge — present the result
		// without a spin animation instead.
		setOutcome(result);
		setPhase("result");
		onRevealStateChange?.(false);
	};

	const handleSpin = async () => {
		if (phase !== "hero" || disabled || !canPlay) {
			return;
		}
		localPlayAttemptedRef.current = true;
		setPlayError("");
		setPhase("spinning");
		onRevealStateChange?.(true);
		try {
			const result = await onPlay({ type: "spin" });
			const targetIndex = resolveTargetSegmentIndex(segments, result);
			if (targetIndex < 0) {
				showResultDirectly(result);
				return;
			}
			const jitter = (Math.random() - 0.5) * segmentAngle * 0.6;
			const targetAbsolute = -((targetIndex + 0.5) * segmentAngle) + jitter;
			const currentNormalized = ((rotation % 360) + 360) % 360;
			const targetNormalized = ((targetAbsolute % 360) + 360) % 360;
			const spins = MIN_SPINS + Math.floor(Math.random() * (MAX_SPINS - MIN_SPINS + 1));
			const delta = spins * 360 + ((targetNormalized - currentNormalized + 360) % 360);
			setRotation(rotation + delta);
			spinTimerRef.current = window.setTimeout(() => {
				setOutcome(result);
				setPhase("result");
				onRevealStateChange?.(false);
			}, SPIN_DURATION_MS - 200);
		} catch (unknownError) {
			setPhase("hero");
			onRevealStateChange?.(false);
			setPlayError(
				unknownError instanceof Error ? unknownError.message : "Không thể quay lúc này",
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

	const discClass = phase === "hero" ? "wheel-disc wheel-disc--idle" : "wheel-disc";
	const discStyle = {
		transform: `rotate(${rotation}deg)`,
		transition:
			phase === "spinning"
				? `transform ${SPIN_DURATION_MS}ms var(--ease-wheel-spin)`
				: undefined,
	};
	const labelFontSize = segments.length > 12 ? 9 : segments.length > 8 ? 10.5 : 12.5;
	// Completion is always available: no-reward finishes directly, an
	// unclaimed reward can be left without claiming, and a claimed reward
	// returns to the thank-you exit.
	const showFinishButton = phase === "result" && Boolean(outcome) && (Boolean(claim) || !outcome?.canClaim);

	return (
		<main className="wheel-stage">
			{heroAssetUrl ? (
				<div
					aria-hidden="true"
					className="absolute inset-0 opacity-25 mix-blend-screen"
					style={{
						backgroundImage: `url(${heroAssetUrl})`,
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
				/>
			) : null}
			<div className="wheel-stage__inner">
				<header className="flex flex-col items-center">
					<p className="wheel-hero__eyebrow">{copy.subtitle?.trim() || "Customer Appreciation"}</p>
					<h1 className="wheel-hero__title">{resolvedTitle}</h1>
					{copy.waitingMessage?.trim() && phase === "hero" && !canPlay ? (
						<p className="wheel-hero__subtitle" role="status">
							{copy.waitingMessage}
						</p>
					) : null}
				</header>

				<div className="wheel-board" role="img" aria-label="Vòng quay may mắn">
					<div className="wheel-board__pointer" aria-hidden="true" />
					<svg
						aria-hidden="true"
						className={discClass}
						style={discStyle}
						viewBox="0 0 200 200"
					>
						{segments.length === 1 ? (
							<g key={segments[0].key}>
								<circle cx="100" cy="100" r="90" fill={segments[0].fill} />
								<text
									className={
										LIGHT_SEGMENTS.has(segments[0].fill)
											? "wheel-segment-label wheel-segment-label--on-light"
											: "wheel-segment-label"
									}
									x="100"
									y="42"
									textAnchor="middle"
									dominantBaseline="middle"
									fontSize={labelFontSize + 2}
								>
									{segments[0].label.length > 24
										? `${segments[0].label.slice(0, 23)}…`
										: segments[0].label}
								</text>
							</g>
						) : (
						segments.map((segment, index) => {
							const startAngle = index * segmentAngle;
							const endAngle = startAngle + segmentAngle;
							const midAngle = startAngle + segmentAngle / 2;
							const labelPoint = polarPoint(60, midAngle);
							const isLight = LIGHT_SEGMENTS.has(segment.fill);
							return (
								<g key={`${segment.key}-${index}`}>
									<path
										d={segmentPath(startAngle, endAngle, 90)}
										fill={segment.fill}
										stroke="rgba(20, 20, 51, 0.85)"
										strokeWidth="1.5"
									/>
									<text
										className={isLight ? "wheel-segment-label wheel-segment-label--on-light" : "wheel-segment-label"}
										x={labelPoint.x}
										y={labelPoint.y}
										textAnchor="middle"
										dominantBaseline="middle"
										fontSize={labelFontSize}
										transform={`rotate(${midAngle}, ${labelPoint.x}, ${labelPoint.y})`}
									>
										{segment.label.length > 18 ? `${segment.label.slice(0, 17)}…` : segment.label}
									</text>
								</g>
							);
						})
						)}
						<circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,246,232,0.35)" strokeWidth="1" />
					</svg>
					<div className="wheel-disc__hub" aria-hidden="true">
						<RotateCw size={18} strokeWidth={2.4} />
					</div>
				</div>

				{phase === "hero" ? (
					<div className="flex flex-col items-center gap-3">
						<button
							className="wheel-cta"
							disabled={!canPlay || disabled}
							onClick={() => void handleSpin()}
							type="button"
						>
							<Sparkles aria-hidden="true" size={18} />
							{resolvedCta}
						</button>
						{statusMessage ? (
							<p className="wheel-status" role="status">
								{statusMessage}
							</p>
						) : null}
						{playError ? (
							<p className="wheel-status" role="alert">
								{playError}
							</p>
						) : null}
					</div>
				) : null}

				{phase === "spinning" ? (
					<p aria-live="polite" className="wheel-status" role="status">
						Đang quay…
					</p>
				) : null}

				{phase === "result" && outcome ? (
					<section
						aria-label="Kết quả vòng quay"
						className={`wheel-result ${outcome.kind === "reward" ? "wheel-result--win" : ""}`}
					>
						<p className="wheel-result__eyebrow">
							{outcome.kind === "reward" ? "Chúc mừng bạn" : "Kết quả"}
						</p>
						<h2 className="wheel-result__label">{outcome.label}</h2>
						{claim?.secretCode ? (
							<p className="wheel-result__code">{claim.secretCode}</p>
						) : null}
						{claim?.instructions ? (
							<p className="wheel-result__instructions">{claim.instructions}</p>
						) : null}
						<div className="wheel-result__actions">
							{outcome.canClaim && !claim ? (
								<button
									className="wheel-cta"
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
									className="wheel-button"
									onClick={onCollect}
									ref={outcome.canClaim && !claim ? undefined : resultPrimaryRef}
									type="button"
								>
									<PartyPopper aria-hidden="true" size={16} />
									Hoàn tất
								</button>
							) : null}
							{outcome.canClaim && !claim ? (
								<button className="wheel-button" onClick={onCollect} type="button">
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
