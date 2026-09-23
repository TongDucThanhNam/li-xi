"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CircleCheck, Gift, Link2, Lock, MoonStar, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireGameTemplate } from "@/app/game-templates/registry";
import type {
	GamePlayStageProps,
	GenericClaimDetail,
	GenericPlayAction,
	GenericPlayActionResult,
	GenericPlayOutcome,
} from "@/app/game-templates/types";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { normalizePublicShareCode } from "@/lib/publicAppUrlPolicy";
import { newStartKey } from "@/lib/playPolicy";
import {
	buildSurfaceInputs,
	collectSavedRewardRows,
	deriveCapabilityRecovery,
	isNextPlayEligible,
	needsClaimDetail,
	resolvePublicEntrySurface,
	type SavedSummaryLike,
} from "./entrySurfacePolicy";

const PARTICIPANT_TOKEN_STORAGE_KEY = "cx.participant-token";
const sessionStorageKey = (shareCode: string) => `cx.play-session.${shareCode}`;
const startKeyStorageKey = (shareCode: string) => `cx.play-startkey.${shareCode}`;
const claimHistoryKey = (shareCode: string) => `cx.play-claims.${shareCode}`;
/** Server query bound per saved-rewards request — storage is never truncated. */
const SAVED_REWARDS_CHUNK = 20;

export type ShareEntryResult = FunctionReturnType<typeof api.publicPlay.getPublicShareEntry>;
export type ShareEntryOpenView = Extract<ShareEntryResult, { state: "open" }>;
type PublicOutcome = FunctionReturnType<typeof api.publicPlay.getPublicSessionOutcome>;
type PublicClaim = FunctionReturnType<typeof api.publicPlay.getPublicClaimDetail>;
type PublicSnapshot = FunctionReturnType<typeof api.publicPlay.getPublicSessionSnapshot>;
type QuizStateView = FunctionReturnType<typeof api.publicPlay.getPublicQuizState>;
type OutcomeView = NonNullable<PublicOutcome>["outcome"];
type ClaimView = NonNullable<PublicClaim>["claim"];
type SavedSummaries = FunctionReturnType<typeof api.publicPlay.getSavedRewardSummaries>;

type StoredSession = {
	sessionId: string;
	sessionToken: string;
};

function readStoredParticipantToken(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage.getItem(PARTICIPANT_TOKEN_STORAGE_KEY);
	} catch {
		return null;
	}
}

function storeParticipantToken(token: string) {
	try {
		window.localStorage.setItem(PARTICIPANT_TOKEN_STORAGE_KEY, token);
	} catch {
		// Storage may be unavailable (private mode); device limits stay
		// best-effort by design.
	}
}

function readStoredSession(shareCode: string): StoredSession | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		const raw = window.localStorage.getItem(sessionStorageKey(shareCode));
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<StoredSession>;
		if (typeof parsed.sessionId === "string" && typeof parsed.sessionToken === "string") {
			return { sessionId: parsed.sessionId, sessionToken: parsed.sessionToken };
		}
	} catch {
		// Corrupt storage behaves like no stored session.
	}
	return null;
}

function storeSession(shareCode: string, session: StoredSession) {
	try {
		window.localStorage.setItem(sessionStorageKey(shareCode), JSON.stringify(session));
	} catch {
		// Best-effort persistence.
	}
}

/** Persisted BEFORE the first start so a lost response cannot orphan a slot. */
function takeStartKey(shareCode: string): string {
	try {
		const existing = window.localStorage.getItem(startKeyStorageKey(shareCode));
		if (existing && /^[a-f0-9]{32}$/.test(existing)) {
			return existing;
		}
		const generated = newStartKey();
		window.localStorage.setItem(startKeyStorageKey(shareCode), generated);
		return generated;
	} catch {
		return newStartKey();
	}
}

type HistoryEntry = { sessionId: string; sessionToken: string };

function readClaimHistory(shareCode: string): HistoryEntry[] {
	if (typeof window === "undefined") {
		return [];
	}
	try {
		const raw = window.localStorage.getItem(claimHistoryKey(shareCode));
		const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
		return Array.isArray(parsed)
			? parsed.filter(
					(entry) =>
						typeof entry.sessionId === "string" && typeof entry.sessionToken === "string",
				)
			: [];
	} catch {
		return [];
	}
}

/** Retention: every awarded capability is kept — rendering is bounded instead. */
function appendClaimHistory(shareCode: string, entry: HistoryEntry) {
	try {
		const history = readClaimHistory(shareCode).filter(
			(item) => item.sessionId !== entry.sessionId,
		);
		history.unshift(entry);
		window.localStorage.setItem(claimHistoryKey(shareCode), JSON.stringify(history));
	} catch {
		// Best-effort persistence.
	}
}

function newOpenKey(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID().replace(/-/g, "");
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A claimed reward result needs its immutable claim detail rendered. */
export function PublicShareEntryFeature({ shareCode }: { shareCode: string }) {
	const normalizedShareCode = normalizePublicShareCode(shareCode);
	const [participantToken, setParticipantToken] = useState<string | null>(null);
	const [session, setSession] = useState<StoredSession | null>(null);
	const [viewing, setViewing] = useState<StoredSession | null>(null);
	const [sessionReady, setSessionReady] = useState(false);
	const [collected, setCollected] = useState(false);
	const [startPending, setStartPending] = useState(false);
	const [startError, setStartError] = useState("");
	// Successful action responses are retained per capability until the
	// reactive queries catch up (and for reopening finished awards), so a
	// delayed outcome/claim query never erases a result that is already in
	// hand — and never assigns one session's result to another.
	const [actionResults, setActionResults] = useState(
		() => new Map<string, OutcomeView>(),
	);
	const [claimResults, setClaimResults] = useState(
		() => new Map<string, ClaimView>(),
	);
	const openKeyRef = useRef<string>("");
	const openRecordedRef = useRef(false);
	const recordShareEntryOpen = useMutation(api.publicPlay.recordShareEntryOpen);
	const startPublicPlaySession = useMutation(api.publicPlay.startPublicPlaySession);
	const playSessionAction = useMutation(api.publicPlay.playSessionAction);
	const claimPublicReward = useMutation(api.publicPlay.claimPublicReward);

	useEffect(() => {
		setParticipantToken(readStoredParticipantToken());
		if (normalizedShareCode) {
			setSession(readStoredSession(normalizedShareCode));
		}
		setSessionReady(true);
	}, [normalizedShareCode]);

	const entry = useQuery(
		api.publicPlay.getPublicShareEntry,
		normalizedShareCode
			? { shareCode: normalizedShareCode, participantToken: participantToken ?? undefined }
			: "skip",
	);

	// Recover a completed outcome for the stored capability (refresh after award).
	const recovered = useQuery(
		api.publicPlay.getPublicSessionOutcome,
		session ? { sessionId: session.sessionId, sessionToken: session.sessionToken } : "skip",
	);
	const recoveredClaim = useQuery(
		api.publicPlay.getPublicClaimDetail,
		session && needsClaimDetail(recovered?.outcome)
			? { sessionId: session.sessionId, sessionToken: session.sessionToken }
			: "skip",
	);
	// Frozen admitted rules: participant presentation uses the snapshot.
	const sessionSnapshot = useQuery(
		api.publicPlay.getPublicSessionSnapshot,
		session ? { sessionId: session.sessionId, sessionToken: session.sessionToken } : "skip",
	);
	// Capability-bound quiz progression (mid-quiz recovery, completion
	// review). Only queried for quiz sessions; never another participant.
	const quizState = useQuery(
		api.publicPlay.getPublicQuizState,
		session &&
		(sessionSnapshot?.rules.templateId ?? entry?.game.templateId) === "quiz"
			? { sessionId: session.sessionId, sessionToken: session.sessionToken }
			: "skip",
	);
	// Saved (viewing) session recovery — always its OWN capability.
	const viewingOutcome = useQuery(
		api.publicPlay.getPublicSessionOutcome,
		viewing ? { sessionId: viewing.sessionId, sessionToken: viewing.sessionToken } : "skip",
	);
	const viewingClaim = useQuery(
		api.publicPlay.getPublicClaimDetail,
		viewing && needsClaimDetail(viewingOutcome?.outcome)
			? { sessionId: viewing.sessionId, sessionToken: viewing.sessionToken }
			: "skip",
	);
	const viewingSnapshot = useQuery(
		api.publicPlay.getPublicSessionSnapshot,
		viewing ? { sessionId: viewing.sessionId, sessionToken: viewing.sessionToken } : "skip",
	);

	// Opens use one stable key per page view and retry that same key on
	// failure so a failed request never splits the count.
	useEffect(() => {
		if (!normalizedShareCode || !entry || entry.state !== "open") {
			return;
		}
		if (openRecordedRef.current) {
			return;
		}
		if (!openKeyRef.current) {
			openKeyRef.current = newOpenKey();
		}
		const openKey = openKeyRef.current;
		openRecordedRef.current = true;
		void recordShareEntryOpen({ shareCode: normalizedShareCode, openKey }).catch(() => {
			openRecordedRef.current = false;
		});
	}, [entry, normalizedShareCode, recordShareEntryOpen]);

	const handleStart = useCallback(async () => {
		if (!normalizedShareCode || startPending) {
			return;
		}
		setStartPending(true);
		setStartError("");
		try {
			const startKey = takeStartKey(normalizedShareCode);
			const result = await startPublicPlaySession({
				shareCode: normalizedShareCode,
				participantToken: participantToken ?? undefined,
				startKey,
			});
			if (result.participantToken) {
				storeParticipantToken(result.participantToken);
				setParticipantToken(result.participantToken);
			}
			const stored = {
				sessionId: result.sessionId,
				sessionToken: result.sessionToken,
			};
			storeSession(normalizedShareCode, stored);
			setSession(stored);
		} catch (unknownError) {
			setStartError(
				unknownError instanceof Error ? unknownError.message : "Không thể bắt đầu lượt chơi",
			);
		} finally {
			setStartPending(false);
		}
	}, [normalizedShareCode, participantToken, startPending, startPublicPlaySession]);

	// Capability-bound handlers: the active session and a viewed saved award
	// never share a fallback, so opening/reading a saved reward can never
	// replay, complete or claim the active (or any other) session.
	const handlePlay = useCallback(
		async (action: GenericPlayAction): Promise<GenericPlayOutcome> => {
			if (!session) {
				throw new Error("Phiên chơi chưa sẵn sàng");
			}
			const result = await playSessionAction({
				sessionId: session.sessionId,
				sessionToken: session.sessionToken,
				action,
			});
			setActionResults((previous) =>
				new Map(previous).set(session.sessionId, result.outcome),
			);
			return result.outcome;
		},
		[playSessionAction, session],
	);

	/**
	 * Multi-step (quiz) adapter over the SAME capability. Immediate templates
	 * keep `handlePlay` untouched; quiz answers return the typed step/completed
	 * result and only cache real outcomes (in-progress states never enter the
	 * outcome cache, so a stale reply cannot fabricate a completion).
	 */
	const handlePlayStep = useCallback(
		async (action: GenericPlayAction): Promise<GenericPlayActionResult> => {
			if (!session) {
				throw new Error("Phiên chơi chưa sẵn sàng");
			}
			const result = await playSessionAction({
				sessionId: session.sessionId,
				sessionToken: session.sessionToken,
				action,
			});
			if ("quizStep" in result && result.quizStep) {
				return {
					status: "in-progress",
					step: {
						totalQuestions: result.quizStep.totalQuestions,
						answeredCount: result.quizStep.answeredCount,
					},
				};
			}
			setActionResults((previous) =>
				new Map(previous).set(session.sessionId, result.outcome),
			);
			return {
				status: "completed",
				outcome: result.outcome,
				quizResult: result.quizResult,
			};
		},
		[playSessionAction, session],
	);

	const handleClaim = useCallback(async (): Promise<GenericClaimDetail | null> => {
		if (!session) {
			throw new Error("Phiên chơi chưa sẵn sàng");
		}
		const result = await claimPublicReward({
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
		});
		setClaimResults((previous) =>
			new Map(previous).set(session.sessionId, result.claim),
		);
		return result.claim;
	}, [claimPublicReward, session]);

	const handleViewedPlay = useCallback(
		async (action: GenericPlayAction): Promise<GenericPlayOutcome> => {
			void action;
			// Read-only surface: a viewed saved award is never replayed.
			throw new Error("Phần thưởng đã lưu không thể chơi lại");
		},
		[],
	);

	const handleViewedClaim = useCallback(async (): Promise<GenericClaimDetail | null> => {
		if (!viewing) {
			throw new Error("Phần thưởng đã lưu chưa sẵn sàng");
		}
		const result = await claimPublicReward({
			sessionId: viewing.sessionId,
			sessionToken: viewing.sessionToken,
		});
		setClaimResults((previous) =>
			new Map(previous).set(viewing.sessionId, result.claim),
		);
		return result.claim;
	}, [claimPublicReward, viewing]);

	/**
	 * Finish of the ACTIVE session's result: archive the capability (claimed
	 * or not) and reach completion. Works even while the reactive outcome
	 * query has not caught up yet, because the capability came from the play
	 * response that is already in hand.
	 */
	const handleCollect = useCallback(() => {
		if (session && normalizedShareCode) {
			appendClaimHistory(normalizedShareCode, {
				sessionId: session.sessionId,
				sessionToken: session.sessionToken,
			});
		}
		setCollected(true);
	}, [normalizedShareCode, session]);

	/**
	 * Explicit next-play action: clears the active session and its start key so
	 * the next start uses a NEW persisted key and a new session (the multi-play
	 * limit still applies). Transport retries never rotate keys, and a page
	 * refresh never starts a play on its own.
	 */
	const handleNextPlay = useCallback(() => {
		if (!normalizedShareCode) {
			return;
		}
		try {
			window.localStorage.removeItem(sessionStorageKey(normalizedShareCode));
			window.localStorage.removeItem(startKeyStorageKey(normalizedShareCode));
		} catch {
			// Storage unavailable: keep UI state consistent anyway.
		}
		setSession(null);
		setCollected(false);
	}, [normalizedShareCode]);

	if (!normalizedShareCode) {
		return (
			<EntryStatusShell
				icon={Link2}
				message="Liên kết chơi này không đúng định dạng hoặc đã bị chỉnh sửa."
				title="Liên kết không hợp lệ"
			/>
		);
	}

	// Saved-reward capabilities persist for every finished result; rendering
	// is bounded and reward-filtered by the section below.
	const savedEntries = readClaimHistory(normalizedShareCode);
	const savedRewards =
		savedEntries.length > 0 ? (
			<SavedRewardsSection
				entries={savedEntries}
				shareCode={normalizedShareCode}
				viewingSessionId={viewing?.sessionId ?? null}
				onReopen={setViewing}
			/>
		) : null;

	// Raw reactive queries are reconciled with retained successful action
	// responses (per capability) before any branch decision: a cached result
	// or claim stays authoritative through query lag, entry closure and
	// saved-view detours, and is never assigned to another capability.
	const sessionRecovery = deriveCapabilityRecovery({
		actionResults,
		capability: session,
		claimResults,
		rawClaim: recoveredClaim,
		rawOutcome: recovered,
	});
	const viewingRecovery = deriveCapabilityRecovery({
		actionResults,
		capability: viewing,
		claimResults,
		rawClaim: viewingClaim,
		rawOutcome: viewingOutcome,
	});
	const openEntry = entry && entry.state === "open" ? entry : null;
	const surface = resolvePublicEntrySurface(
		buildSurfaceInputs({
			actionResults,
			claimResults,
			collected,
			entryLoaded: entry !== undefined,
			entryState: entry?.state,
			normalizedShareCode,
			recovered,
			recoveredClaim,
			session,
			sessionReady,
			sessionSnapshot,
			viewing,
			viewingClaim,
			viewingOutcome,
			viewingSnapshot,
		}),
	);

	switch (surface) {
		case "viewing-loading":
			return (
				<EntryStatusShell
					icon={MoonStar}
					loading
					message="Đang mở phần thưởng đã lưu…"
					title="Đang tải"
				/>
			);
			case "viewing-result":
				// Reopened saved session: read-only recovered result view; claiming
				// uses the viewed capability's own token and collecting returns to
				// the previous surface without touching the active session or start key.
				return (
					<TemplateEntrySurface
						entry={openEntry}
						onClaim={handleViewedClaim}
						onCollect={() => setViewing(null)}
						onPlay={handleViewedPlay}
						pending={startPending}
						recoveredClaim={viewingRecovery.claimPayload}
						recoveredOutcome={viewingRecovery.payload}
						session={viewing}
						sessionSnapshot={viewingSnapshot ?? null}
						quizState={null}
						startError={startError}
						viewOnly
					/>
				);
			case "viewing-unavailable":
			// The viewed capability resolved without a recoverable result: it is
			// invalid or no longer available. Fail closed with a return path
			// instead of falling through into active-session operations.
			return (
				<EntryStatusShell
					action={{ label: "Quay lại", onPress: () => setViewing(null) }}
					icon={Gift}
					message="Phần thưởng này không còn khả dụng hoặc không thể đọc được."
					title="Không mở được phần thưởng"
				/>
			);
		case "complete":
			// An explicit completed/exit state always wins: a late reactive
			// recovery must never override the Finish the participant performed.
			return (
				<EntryStatusShell
					action={
						isNextPlayEligible(openEntry)
							? { label: "Chơi lượt mới", onPress: handleNextPlay }
							: undefined
					}
					icon={CircleCheck}
					message="Cảm ơn bạn đã tham gia trải nghiệm của chúng tôi!"
					title="Hoàn tất"
					tone="complete"
				>
					{savedRewards}
				</EntryStatusShell>
			);
		case "recovery-loading":
			return (
				<EntryStatusShell
					icon={MoonStar}
					loading
					message="Đang khôi phục lượt chơi của bạn…"
					title="Đang khôi phục"
				/>
			);
		case "recovery-claim-loading":
			return (
				<EntryStatusShell
					icon={MoonStar}
					loading
					message="Đang tải chi tiết phần thưởng…"
					title="Đang tải"
				/>
			);
		case "recovered-result":
			// A completed session's capability always recovers its permitted
			// result/claim — even after the reusable entry is closed or revoked —
			// while new participants stay blocked by the entry states below.
			return (
				<TemplateEntrySurface
					entry={openEntry}
					onClaim={handleClaim}
					onCollect={handleCollect}
					onPlay={handlePlay}
					onPlayStep={handlePlayStep}
					pending={startPending}
					recoveredClaim={sessionRecovery.claimPayload}
					recoveredOutcome={sessionRecovery.payload}
					session={session}
					sessionSnapshot={sessionSnapshot ?? null}
					quizState={quizState ?? null}
					startError={startError}
					footer={savedRewards}
				/>
			);
		case "entry-loading":
			return (
				<EntryStatusShell
					icon={MoonStar}
					loading
					message="Đang mở không gian chơi của chiến dịch…"
					title="Đang tải"
				/>
			);
		case "closed-entry":
		case "open-entry":
		case "invalid-link":
			// Handled by the shared entry rendering below.
			break;
	}

	if (surface === "closed-entry" && entry && entry.state !== "open") {
		const closedCopy: Record<
			Exclude<ShareEntryResult["state"], "open">,
			{ icon: LucideIcon; title: string; message: string }
		> = {
			invalid: {
				icon: Link2,
				title: "Không tìm thấy liên kết",
				message: "Liên kết này không tồn tại hoặc đã bị gỡ.",
			},
			revoked: {
				icon: Lock,
				title: "Liên kết đã thu hồi",
				message:
					"Liên kết chơi đã bị người tổ chức thu hồi. Vui lòng liên hệ nhân viên chiến dịch để nhận liên kết mới.",
			},
			closed: {
				icon: Lock,
				title: "Trò chơi đã đóng",
				message:
					"Chiến dịch hoặc trò chơi hiện không còn hoạt động. Cảm ơn bạn đã quan tâm!",
			},
		};
		const copy = closedCopy[entry.state];
		return (
			<>
				<EntryStatusShell icon={copy.icon} message={copy.message} title={copy.title} />
				{savedRewards}
			</>
		);
	}

	return (
		<TemplateEntrySurface
			entry={openEntry}
			onClaim={handleClaim}
			onCollect={handleCollect}
			onPlay={handlePlay}
			onPlayStep={handlePlayStep}
			onStart={() => void handleStart()}
			pending={startPending}
			recoveredClaim={sessionRecovery.claimPayload}
			recoveredOutcome={sessionRecovery.payload}
			session={session}
			sessionSnapshot={sessionSnapshot ?? null}
			quizState={quizState ?? null}
			startError={startError}
			footer={savedRewards}
		/>
	);

}

function TemplateEntrySurface({
	entry,
	session,
	startError,
	pending,
	onStart,
	onPlay,
	onPlayStep,
	onClaim,
	onCollect,
	recoveredOutcome,
	recoveredClaim,
	quizState,
	sessionSnapshot,
	footer,
	viewOnly = false,
}: {
	entry: ShareEntryOpenView | null;
	session: StoredSession | null;
	startError: string;
	pending: boolean;
	onStart?: () => void;
	onPlay: (action: GenericPlayAction) => Promise<GenericPlayOutcome>;
	onPlayStep?: (action: GenericPlayAction) => Promise<GenericPlayActionResult>;
	onClaim: () => Promise<GenericClaimDetail | null>;
	onCollect: () => void;
	recoveredOutcome: PublicOutcome | null;
	recoveredClaim: PublicClaim | null;
	quizState: QuizStateView | null;
	sessionSnapshot: PublicSnapshot | null;
	footer?: React.ReactNode;
	/** Read-only saved-award view: the mechanic cannot be replayed. */
	viewOnly?: boolean;
}) {
	if (session) {
		// An admitted session stays playable even when the game is sold out for
		// new admissions, and keeps its frozen presentation from the admission
		// snapshot (live entry data is only the fallback).
		const templateId =
			sessionSnapshot?.rules.templateId ?? entry?.game.templateId ?? "li-xi";
		const stageProps: GamePlayStageProps = {
			sessionKey: session.sessionId,
			canPlay: !viewOnly,
			disabled: viewOnly,
			statusMessage: undefined,
			copy: {
				title:
					sessionSnapshot?.rules.publicCopy.headline ||
					entry?.game.publicCopy.headline ||
					entry?.campaign.name ||
					"Trò chơi chiến dịch",
				subtitle:
					sessionSnapshot?.rules.publicCopy.subtitle ||
					entry?.game.publicCopy.subtitle ||
					entry?.campaign.brandName ||
					undefined,
				ctaLabel:
					sessionSnapshot?.rules.publicCopy.startCtaLabel ||
					entry?.game.publicCopy.startCtaLabel ||
					undefined,
				collectLabel:
					sessionSnapshot?.rules.publicCopy.collectCtaLabel ||
					entry?.game.publicCopy.collectCtaLabel ||
					undefined,
				waitingMessage:
					sessionSnapshot?.rules.publicCopy.waitingMessage ||
					entry?.game.publicCopy.waitingMessage ||
					undefined,
			},
			heroAssetUrl: entry?.campaign.heroAssetUrl ?? null,
			playContext: sessionSnapshot?.rules.scratchCard
				? {
						coverStyle: sessionSnapshot.rules.scratchCard.coverStyle,
						revealThresholdPercent: sessionSnapshot.rules.scratchCard.revealThresholdPercent,
					}
				: sessionSnapshot?.rules.quiz
					? {
							passCount: sessionSnapshot.rules.quiz.passCount,
							questions: sessionSnapshot.rules.quiz.questions,
						}
					: sessionSnapshot?.rules.slotReels
					? {
							reelTheme: sessionSnapshot.rules.slotReels.reelTheme,
							winningCombinations: sessionSnapshot.rules.slotReels.winningCombinations,
							missCombination: sessionSnapshot.rules.slotReels.missCombination,
						}
					: sessionSnapshot?.rules.wheel
						? {
								noRewardLabel: sessionSnapshot.rules.wheel.noRewardLabel,
								segments: sessionSnapshot.rules.wheel.segments,
								noRewardKey: sessionSnapshot.rules.wheel.noRewardKey,
							}
						: entry?.game.wheel
							? {
									noRewardLabel: entry.game.wheel.noRewardLabel,
									segments: entry.game.wheel.segments,
									noRewardKey: entry.game.wheel.noRewardKey,
								}
							: undefined,
			initialOutcome: recoveredOutcome?.outcome ?? null,
			initialClaim: recoveredClaim?.claim ?? null,
			initialQuizState: quizState ?? null,
			autoBegin: !viewOnly,
			onPlay,
			onPlayStep,
			onClaim,
			onCollect,
		};
		try {
			const template = requireGameTemplate(templateId);
			const PlayStage = template.PlayStage;
			return (
				<>
					<PlayStage key={session.sessionId} {...stageProps} />
					{footer}
				</>
			);
		} catch {
			return (
				<EntryStatusShell
					icon={Link2}
					message={`Mẫu trò chơi không được hỗ trợ: ${templateId}`}
					title="Không thể mở trò chơi"
				/>
			);
		}
	}

	if (!entry || entry.state !== "open") {
		return (
			<EntryStatusShell
				icon={MoonStar}
				loading
				message="Đang mở không gian chơi của chiến dịch…"
				title="Đang tải"
			/>
		);
	}

	try {
		const template = requireGameTemplate(entry.game.templateId);
		const EntryHero = template.EntryHero;
		const limitReached = entry.viewer?.reason === "limit";
		// An explicit viewer denial blocks new admissions even without a
		// reason code (stage-3 configurable eligibility); an unknown viewer
		// (null) stays usable for a first-time participant. Admitted sessions
		// already on the stage are never re-denied by this live check.
		const viewerDenied = entry.viewer !== null && entry.viewer?.canPlay === false;
		const blocked =
			!entry.game.selfServe ||
			entry.availability.soldOut ||
			limitReached ||
			viewerDenied;
		const blockedMessage = !entry.game.selfServe
			? "Trò chơi này sử dụng luồng chơi cổ điển và không mở qua liên kết tự phục vụ."
			: entry.availability.soldOut
				? "Trò chơi đã hết lượt tham gia."
				: limitReached || viewerDenied
					? "Bạn đã hết lượt tham gia trò chơi này."
					: undefined;
		const heroProps = {
			canStart: !blocked,
			blockedMessage,
			pending,
			statusMessage: startError || undefined,
			copy: {
				title: entry.game.publicCopy.headline || entry.campaign.name,
				subtitle:
					entry.game.publicCopy.subtitle ||
					entry.campaign.brandName ||
					entry.campaign.description ||
					undefined,
				ctaLabel: entry.game.publicCopy.startCtaLabel || "Bắt đầu chơi",
				waitingMessage: entry.game.publicCopy.waitingMessage || undefined,
			},
			brandName: entry.campaign.brandName,
			description: entry.campaign.description,
			gameName: entry.game.gameName,
			heroAssetUrl: entry.campaign.heroAssetUrl,
			onStart: onStart ?? (() => {}),
		};
		return (
			<>
				<EntryHero {...heroProps} />
				{footer}
			</>
		);
	} catch {
		return (
			<EntryStatusShell
				icon={Link2}
				message={`Mẫu trò chơi không được hỗ trợ: ${entry.game.templateId}`}
				title="Không thể mở trò chơi"
			/>
		);
	}
}

/** Server query bound per chunk — storage is never truncated. */
function SavedRewardsSection({
	entries,
	shareCode,
	viewingSessionId,
	onReopen,
}: {
	entries: HistoryEntry[];
	shareCode: string;
	viewingSessionId: string | null;
	onReopen: (capability: StoredSession) => void;
}) {
	const totalChunks = Math.max(1, Math.ceil(entries.length / SAVED_REWARDS_CHUNK));
	const [visibleChunks, setVisibleChunks] = useState(1);
	const shownChunks = Math.min(visibleChunks, totalChunks);
	// Per-chunk query results, `null` while that chunk is still loading.
	const [reports, setReports] = useState<Array<SavedSummaries | null>>([]);

	const handleChunkReport = useCallback(
		(index: number, result: SavedSummaries | null) => {
			setReports((previous) => {
				if (previous[index] === result) {
					return previous;
				}
				const next = [...previous];
				while (next.length <= index) {
					next.push(null);
				}
				next[index] = result;
				return next;
			});
		},
		[],
	);

	const chunks: HistoryEntry[][] = [];
	for (let index = 0; index < shownChunks; index += 1) {
		chunks.push(entries.slice(index * SAVED_REWARDS_CHUNK, (index + 1) * SAVED_REWARDS_CHUNK));
	}
	const hasOlder = shownChunks < totalChunks;
	const loading =
		reports.length < shownChunks ||
		chunks.some((_, index) => reports[index] === null || reports[index] === undefined);
	const rewardRows = chunks.flatMap((chunk, index) =>
		collectSavedRewardRows(chunk, (reports[index]?.entries ?? null) as SavedSummaryLike[] | null),
	);

	// Chunk query components stay mounted regardless of the visual outcome so
	// their queries keep running. The reward heading renders only when at
	// least one actual reward is known; older plays stay reachable through a
	// neutrally named control even when the loaded chunks hold no rewards.
	const showRewardHeading = rewardRows.length > 0;
	const showSection = !loading && (showRewardHeading || hasOlder);
	return (
		<>
			{chunks.map((chunk, index) => (
				<SavedRewardsChunk
					key={`chunk-${index}`}
					chunk={chunk}
					index={index}
					onReport={handleChunkReport}
					shareCode={shareCode}
				/>
			))}
			{showSection ? (
			<section
			aria-label={
				showRewardHeading
					? "Phần thưởng đã lưu của bạn"
					: "Lượt chơi đã lưu của bạn"
			}
			className="mt-4 grid w-full gap-2 text-left text-xs"
			style={{ color: "rgba(244,241,234,0.75)" }}
		>
			{showRewardHeading ? (
				<p className="font-semibold">
					Phần thưởng đã lưu của bạn
					{entries.length > rewardRows.length
						? ` (${rewardRows.length}/${entries.length} lượt có phần thưởng)`
						: ""}
				</p>
			) : null}
			{rewardRows.map((row) => {
				const isViewing = viewingSessionId === row.sessionId;
				return (
					<div className="flex flex-wrap items-center gap-2" key={row.sessionId}>
						<p className="break-all">
							• {row.label}
							{row.claimed && row.secretCode ? ` — mã: ${row.secretCode}` : ""}
							{row.claimed ? " (đã nhận)" : ""}
						</p>
						{!isViewing ? (
							<button
								className="rounded-full border px-3 py-1 font-semibold"
								onClick={() =>
								onReopen({
									sessionId: row.sessionId,
									sessionToken: row.sessionToken,
								})
							}
								style={{ borderColor: "rgba(255,255,255,0.4)", color: "#f4f1ea" }}
								type="button"
							>
								{row.claimed ? "Xem lại" : "Mở để nhận thưởng"}
								<Gift aria-hidden="true" className="ml-1 inline" size={12} />
							</button>
						) : null}
					</div>
				);
			})}
			{hasOlder ? (
				<button
					className="justify-self-start rounded-full border px-3 py-1 font-semibold"
					onClick={() => setVisibleChunks((current) => current + 1)}
					style={{ borderColor: "rgba(255,255,255,0.4)", color: "#f4f1ea" }}
					type="button"
				>
					Xem các lượt cũ hơn ({entries.length - shownChunks * SAVED_REWARDS_CHUNK})
				</button>
			) : null}
			</section>
			) : null}
		</>
	);
}

/** Loads one bounded chunk of saved-reward summaries through its own query. */
function SavedRewardsChunk({
	chunk,
	index,
	shareCode,
	onReport,
}: {
	chunk: HistoryEntry[];
	index: number;
	shareCode: string;
	onReport: (index: number, result: SavedSummaries | null) => void;
}) {
	const summaries = useQuery(
		api.publicPlay.getSavedRewardSummaries,
		chunk.length > 0 ? { shareCode, entries: chunk } : "skip",
	);
	useEffect(() => {
		onReport(index, summaries === undefined ? null : summaries);
	}, [index, onReport, summaries]);
	return null;
}

function EntryStatusShell({
	icon: Icon,
	title,
	message,
	loading = false,
	tone = "neutral",
	action,
	children,
}: {
	icon: LucideIcon;
	title: string;
	message: string;
	loading?: boolean;
	tone?: "neutral" | "complete";
	action?: { label: string; onPress: () => void };
	children?: React.ReactNode;
}) {
	return (
		<main
			className="grid min-h-dvh place-items-center p-6"
			style={{ background: "#101018", color: "#f4f1ea", fontFamily: "system-ui, sans-serif" }}
		>
			<section
				aria-live={loading ? "polite" : undefined}
				className="grid w-full max-w-md justify-items-center gap-2 rounded-3xl border p-8 text-center"
				style={{ borderColor: "rgba(255,255,255,0.16)", background: "#191922" }}
				role={loading ? "status" : undefined}
			>
				<span
					className="mb-2 grid size-13 place-items-center rounded-full"
					style={{
						border: `1.5px solid ${tone === "complete" ? "rgba(46,196,182,0.6)" : "rgba(255,255,255,0.3)"}`,
						background: tone === "complete" ? "rgba(46,196,182,0.12)" : "rgba(255,255,255,0.08)",
						color: tone === "complete" ? "#2ec4b6" : "#f4f1ea",
					}}
				>
					<Icon aria-hidden="true" size={22} />
				</span>
				<h1 className="text-2xl font-bold">{title}</h1>
				<p className="max-w-sm text-sm leading-6" style={{ color: "rgba(244,241,234,0.7)" }}>
					{message}
				</p>
				{action ? (
					<button
						className="mt-3 inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold"
						onClick={action.onPress}
						style={{ borderColor: "rgba(255,255,255,0.4)", color: "#f4f1ea" }}
						type="button"
					>
						<Play aria-hidden="true" size={15} />
						{action.label}
					</button>
				) : null}
				{children}
			</section>
		</main>
	);
}
