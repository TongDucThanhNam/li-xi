"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Gift, PartyPopper, XCircle } from "lucide-react";
import type {
	GamePlayStageProps,
	GenericClaimDetail,
	GenericPlayActionResult,
	GenericPlayOutcome,
	GenericQuizProgressState,
} from "@/app/game-templates/types";
import {
	recoveredOutcomeKey,
	shouldAdoptRecoveredClaim,
	shouldAdoptRecoveredOutcome,
} from "@/app/game-templates/recoveryPolicy";

/**
 * Quiz stage (docs/design-quiz.md): authoritative multi-step progression.
 * Every answer is one server-validated `quiz-answer` action carrying the
 * question index and a retry revision; the stage adopts ONLY server
 * step states at least as new as its own (stale replies can never regress
 * progress). Intermediate answers create no outcome; the final answer is
 * graded ONCE by the server. Review (correct choice + explanation) renders
 * only after completion, from the capability-bound quiz state.
 */

type QuizPlayContext = {
	passCount?: number;
	questions?: Array<{ prompt?: string; choices?: string[] }>;
};

type Phase = "question" | "result";

export default function QuizStage({
	canPlay,
	disabled,
	statusMessage,
	copy,
	heroAssetUrl,
	playContext,
	initialOutcome,
	initialClaim,
	initialQuizState,
	onPlay,
	onPlayStep,
	onClaim,
	onCollect,
	onRevealStateChange,
}: GamePlayStageProps) {
	const frozenContextRef = useRef<QuizPlayContext | null>(null);
	if (!frozenContextRef.current) {
		frozenContextRef.current = (playContext ?? {}) as QuizPlayContext;
	}
	const context = frozenContextRef.current;
	const questions = (context.questions ?? []).filter(
		(question) =>
			typeof question?.prompt === "string" && Array.isArray(question.choices),
	);
	const total = questions.length;

	const [phase, setPhase] = useState<Phase>(initialOutcome ? "result" : "question");
	const [currentIndex, setCurrentIndex] = useState(() => {
		if (initialOutcome) return initialQuizState?.currentIndex ?? total;
		return initialQuizState?.currentIndex ?? 0;
	});
	const [outcome, setOutcome] = useState<GenericPlayOutcome | null>(
		initialOutcome ?? null,
	);
	const [grading, setGrading] = useState<{
		score: number;
		passed: boolean;
	} | null>(
		initialQuizState?.completed
			? {
					score: initialQuizState.score ?? 0,
					passed: Boolean(initialQuizState.passed),
				}
			: null,
	);
	const [review, setReview] = useState<GenericQuizProgressState["review"]>(
		initialQuizState?.completed ? (initialQuizState.review ?? null) : null,
	);
	const [claim, setClaim] = useState<GenericClaimDetail | null>(
		initialClaim ?? null,
	);
	const [claimPending, setClaimPending] = useState(false);
	const [playError, setPlayError] = useState("");
	const [answerPending, setAnswerPending] = useState(false);
	const [justAnswered, setJustAnswered] = useState<number | null>(null);

	// Server step counter mirror: guards against stale replies regressing.
	const answeredCountRef = useRef(initialQuizState?.answeredCount ?? 0);
	const appliedOutcomeKeyRef = useRef("");
	const localPlayAttemptedRef = useRef(false);
	const resultPrimaryRef = useRef<HTMLButtonElement | null>(null);

	// Delayed recovery: adopt a completed outcome not played locally.
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

	// Delayed recovery: adopt the recorded claim once the outcome is present.
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

	// Reactive capability-bound quiz state: adopt server truth that is NEWER
	// than local progress (never regress a newer local answer).
	useEffect(() => {
		if (!initialQuizState) return;
		if (initialQuizState.answeredCount < answeredCountRef.current) return;
		if (initialQuizState.completed) {
			setPhase("result");
		} else {
			setCurrentIndex(initialQuizState.currentIndex);
		}
	}, [initialQuizState]);

	useEffect(() => {
		if (phase === "result") {
			resultPrimaryRef.current?.focus();
		}
	}, [phase, claim]);

	const resolvedCta = copy.ctaLabel?.trim() || "Bắt đầu";
	const resolvedCollect = copy.collectLabel?.trim() || "Nhận quà";
	const resolvedTitle = copy.title?.trim() || "Trắc nghiệm tri ân";
	const passCount =
		typeof context.passCount === "number" && context.passCount >= 1
			? context.passCount
			: 1;

	const answer = async (choiceIndex: number) => {
		if (
			phase !== "question" ||
			answerPending ||
			disabled ||
			!canPlay ||
			!onPlayStep
		) {
			return;
		}
		localPlayAttemptedRef.current = true;
		setPlayError("");
		setAnswerPending(true);
		setJustAnswered(choiceIndex);
		onRevealStateChange?.(true);
		try {
			const result: GenericPlayActionResult = await onPlayStep({
				type: "quiz-answer",
				questionIndex: currentIndex,
				choiceIndex,
				revision: answeredCountRef.current,
			});
			if (result.status === "in-progress") {
				// Stale-reply guard: never regress below local progress.
				if (result.step.answeredCount >= answeredCountRef.current + 1) {
					answeredCountRef.current = result.step.answeredCount;
					setCurrentIndex(result.step.answeredCount);
				}
			} else {
				appliedOutcomeKeyRef.current = recoveredOutcomeKey(result.outcome);
				answeredCountRef.current = total;
				setOutcome(result.outcome);
				if (result.quizResult) {
					setGrading({
						score: result.quizResult.score,
						passed: result.quizResult.passed,
					});
				}
				setPhase("result");
			}
		} catch (unknownError) {
			// The answer never landed: same revision retries idempotently.
			setPlayError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể ghi nhận câu trả lời",
			);
		} finally {
			setAnswerPending(false);
			setJustAnswered(null);
			onRevealStateChange?.(false);
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

	const showResultButton =
		phase === "result" && Boolean(outcome) && (Boolean(claim) || !outcome?.canClaim);
	const currentQuestion = questions[currentIndex];
	const answeredSoFar = Math.min(currentIndex, total);

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
				<header className="flex flex-col items-center">
					<p className="quiz-hero__eyebrow">{copy.subtitle?.trim() || "Tri ân"}</p>
					<h1 className="quiz-hero__title">{resolvedTitle}</h1>
					{statusMessage ? (
						<p className="quiz-hero__subtitle" role="status">
							{statusMessage}
						</p>
					) : null}
				</header>

				{phase === "question" && currentQuestion ? (
					<section
						aria-label={`Câu hỏi ${currentIndex + 1} / ${total}`}
						className="quiz-card"
						data-testid="quiz-card"
						data-quiz-current-index={currentIndex}
						data-quiz-answered={answeredSoFar}
					>
						<div className="quiz-progress">
							<div className="quiz-progress__bar" aria-hidden="true">
								<div
									className="quiz-progress__fill"
									style={{ width: `${total === 0 ? 0 : (answeredSoFar / total) * 100}%` }}
								/>
							</div>
							<p className="quiz-progress__label">
								Câu {currentIndex + 1}/{total}
							</p>
						</div>
						<h2 className="quiz-card__prompt">{currentQuestion.prompt}</h2>
						<div className="quiz-choices" role="group" aria-label="Lựa chọn">
							{currentQuestion.choices.map((choice, choiceIndex) => (
								<button
									className={`quiz-choice${
										justAnswered === choiceIndex ? " quiz-choice--selected" : ""
									}`}
									data-testid="quiz-choice"
									disabled={answerPending || !canPlay || disabled}
									key={`${currentIndex}-${choiceIndex}`}
									onClick={() => void answer(choiceIndex)}
									type="button"
								>
									<span className="quiz-choice__marker" aria-hidden="true">
										{String.fromCharCode(65 + choiceIndex)}
									</span>
									<span className="quiz-choice__text">{choice}</span>
								</button>
							))}
						</div>
						{answerPending ? (
							<p aria-live="polite" className="quiz-status" role="status">
								Đang ghi nhận câu trả lời…
							</p>
						) : null}
					</section>
				) : null}

				{playError ? (
					<p className="quiz-error" role="alert">
						{playError}
						{phase === "question" ? " — hãy thử lại." : ""}
					</p>
				) : null}

				{phase === "result" && outcome ? (
					<section
						aria-label="Kết quả trắc nghiệm"
						className={`quiz-result ${outcome.kind === "reward" ? "quiz-result--pass" : ""}`}
						data-testid="quiz-result-panel"
					>
						<p className="quiz-result__eyebrow">
							{grading?.passed || outcome.kind === "reward"
								? "Chúc mừng bạn"
								: "Kết quả"}
						</p>
						{grading ? (
							<p className="quiz-result__score" data-testid="quiz-score">
								Bạn đúng {grading.score}/{total} câu
								{grading.passed ? " — đạt yêu cầu!" : ""}
							</p>
						) : null}
						<h2 className="quiz-result__label">{outcome.label}</h2>
						{claim?.secretCode ? (
							<p className="quiz-result__code" data-testid="quiz-code">
								{claim.secretCode}
							</p>
						) : null}
						{claim?.instructions ? (
							<p className="quiz-result__instructions">{claim.instructions}</p>
						) : null}
						{review && review.length > 0 ? (
							<div className="quiz-review" data-testid="quiz-review">
								<p className="quiz-review__title">Đáp án chi tiết</p>
								<ol className="quiz-review__list">
									{review.map((entry) => {
										const question = questions[entry.questionIndex];
										return (
											<li className="quiz-review__item" key={entry.questionIndex}>
												<span className="quiz-review__icon" aria-hidden="true">
													{entry.correct ? (
														<CheckCircle2 size={15} />
													) : (
														<XCircle size={15} />
													)}
												</span>
												<span className="quiz-review__text">
													{question?.prompt}
													<br />
													<strong>
														Đáp án đúng:{" "}
														{question?.choices[entry.correctIndex] ?? "—"}
													</strong>
													{entry.explanation ? (
														<>
															<br />
															{entry.explanation}
														</>
													) : null}
												</span>
											</li>
										);
									})}
								</ol>
							</div>
						) : null}
						<div className="quiz-result__actions">
							{outcome.canClaim && !claim ? (
								<button
									className="quiz-cta"
									disabled={claimPending}
									onClick={() => void handleClaim()}
									ref={resultPrimaryRef}
									type="button"
								>
									<Gift aria-hidden="true" size={18} />
									{claimPending ? "Đang nhận…" : resolvedCollect}
								</button>
							) : null}
							{showResultButton ? (
								<button
									className="quiz-button"
									onClick={onCollect}
									ref={outcome.canClaim && !claim ? undefined : resultPrimaryRef}
									type="button"
								>
									<PartyPopper aria-hidden="true" size={16} />
									Hoàn tất
								</button>
							) : null}
							{outcome.canClaim && !claim ? (
								<button className="quiz-button" onClick={onCollect} type="button">
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
