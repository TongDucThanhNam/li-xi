"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireGameTemplate } from "@/app/game-templates/registry";
import type {
	GameEntryHeroProps,
	GenericClaimDetail,
	GenericPlayAction,
	GenericPlayOutcome,
} from "@/app/game-templates/types";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { formatScheduleTime } from "@/lib/schedulePolicy";
import { StationPinDialog } from "./StationPinDialog";

export type StationPlayState = FunctionReturnType<typeof api.stationPlay.getStationPlayState>;
type StationRecoverable = NonNullable<StationPlayState["recoverable"]>;

type StationCapability = {
	sessionId: string;
	sessionToken: string;
};

function newStationOpenKey(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID().replace(/-/g, "");
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Generic self-serve station flow for station-capable templates (lucky
 * wheel, scratch card). The template-owned `EntryHero` is the waiting
 * screen; Start self-admits a `channel: "station"` session under the
 * owner's authenticated session; the template `PlayStage` plays it through
 * the same capability-gated public actions; "Hoàn tất" resets the station
 * to waiting. The session capability lives in React state ONLY — never persisted to
 * web storage — so nothing leaks to the next kiosk visitor; refresh
 * recovery comes from the owner-authorized station-state query, which also
 * surfaces a completed-but-unresolved result (rewarded outcome never
 * collected, or claimed but never acknowledged) as a recoverable session:
 * the waiting screen shows a recovery banner, Start stays disabled until it
 * is resolved, resume re-shows the result/claim through the template stage,
 * and the host can abandon it behind the Host PIN.
 */
export function StationSelfServePlay({ campaignGameId }: { campaignGameId: string }) {
	const state = useQuery(api.stationPlay.getStationPlayState, { campaignGameId });
	const startSession = useMutation(api.stationPlay.startStationPlaySession);
	const playSessionAction = useMutation(api.publicPlay.playSessionAction);
	const claimPublicReward = useMutation(api.publicPlay.claimPublicReward);
	const acknowledgeResult = useMutation(api.stationPlay.acknowledgeStationPlayResult);
	const dismissResult = useMutation(api.stationPlay.dismissStationPlayResult);

	// Capability of the session admitted on THIS screen. Authoritative from
	// the moment start resolves until collect; the reactive query covers
	// refresh recovery of sessions admitted earlier.
	const [admitted, setAdmitted] = useState<StationCapability | null>(null);
	// A recovered session latches into state on first sight: once the play
	// completes, the query (which only surfaces ACTIVE sessions) would
	// otherwise drop the capability and flip this screen back to waiting in
	// the middle of the participant's result. Cleared on collect.
	const [adopted, setAdopted] = useState<StationCapability | null>(null);
	// A resumed recoverable (completed) result latches the same way: the
	// query stops surfacing it the moment collect acknowledges server-side.
	const [recoveredResult, setRecoveredResult] = useState<StationRecoverable | null>(null);
	// Locally handled recoverable ids cover the gap between the collect /
	// dismiss mutation and the next query replay, so the banner never
	// flashes back over the fresh waiting round.
	const [handledRecoveryIds, setHandledRecoveryIds] = useState<string[]>([]);
	const [startPending, setStartPending] = useState(false);
	const [startError, setStartError] = useState("");
	const [dismissError, setDismissError] = useState("");
	const [dismissOpen, setDismissOpen] = useState(false);
	const dismissTriggerRef = useRef<HTMLButtonElement>(null);
	// Each return to the waiting screen is a new waiting round (a new
	// mount of the hero) and records exactly one game_open.
	const [waitingRound, setWaitingRound] = useState(0);

	const recovered = state?.playSession ?? null;
	const serverRecoverable = state?.recoverable ?? null;
	useEffect(() => {
		if (admitted || adopted || !recovered) {
			return;
		}
		setAdopted({
			sessionId: recovered.sessionId,
			sessionToken: recovered.sessionToken,
		});
	}, [adopted, admitted, recovered]);
	const active: StationCapability | null = useMemo(
		() =>
			admitted ??
			adopted ??
			(recoveredResult
				? {
						sessionId: recoveredResult.sessionId,
						sessionToken: recoveredResult.sessionToken,
					}
				: recovered
					? { sessionId: recovered.sessionId, sessionToken: recovered.sessionToken }
					: null),
		[admitted, adopted, recovered, recoveredResult],
	);
	// While an admitted session has not been collected yet, a replay of the
	// query (station page refetch) must not flash the waiting hero over the
	// in-flight play surface. A resumed recoverable result pins the screen
	// the same way until collect.
	const pendingRecovery =
		serverRecoverable && !handledRecoveryIds.includes(serverRecoverable.sessionId)
			? serverRecoverable
			: null;
	const showWaiting = !active;

	const handleStart = useCallback(async () => {
		if (startPending || active) {
			return;
		}
		setStartPending(true);
		setStartError("");
		try {
			const result = await startSession({ campaignGameId });
			setAdmitted({
				sessionId: result.sessionId,
				sessionToken: result.sessionToken,
			});
		} catch (unknownError) {
			setStartError(
				unknownError instanceof Error ? unknownError.message : "Không thể bắt đầu lượt chơi",
			);
		} finally {
			setStartPending(false);
		}
	}, [active, campaignGameId, startPending, startSession]);

	const handlePlay = useCallback(
		async (playAction: GenericPlayAction): Promise<GenericPlayOutcome> => {
			if (!active) {
				throw new Error("Phiên chơi chưa sẵn sàng");
			}
			const result = await playSessionAction({
				sessionId: active.sessionId,
				sessionToken: active.sessionToken,
				action: playAction,
			});
			// Station templates are immediate (wheel/scratch); a multi-step
			// quiz reply never reaches this surface.
			if (result.quizStep) {
				throw new Error("Lượt chơi chưa hoàn tất nên chưa có kết quả");
			}
			return result.outcome;
		},
		[active, playSessionAction],
	);

	const handleClaim = useCallback(async (): Promise<GenericClaimDetail | null> => {
		if (!active) {
			throw new Error("Phiên chơi chưa sẵn sàng");
		}
		const result = await claimPublicReward({
			sessionId: active.sessionId,
			sessionToken: active.sessionToken,
		});
		return result.claim;
	}, [active, claimPublicReward]);

	// Next participant: drop the capability (nothing persisted), acknowledge
	// the completed result so it never resurfaces as recoverable, and remount
	// the waiting hero as a new waiting round.
	const handleCollect = useCallback(() => {
		if (active) {
			// The result was already handed to the guest on this device, so the
			// fresh waiting round must never flash the recovery banner while
			// the acknowledge write is in flight — nor latch it after the
			// write fails. (A reload restarts recovery cleanly.)
			setHandledRecoveryIds((ids) =>
				ids.includes(active.sessionId) ? ids : [...ids, active.sessionId],
			);
			void acknowledgeResult({ campaignGameId, sessionId: active.sessionId }).catch(
				(unknownError) => {
					// Best-effort and non-blocking: the result stays collected on
					// this device. Log so kiosk write failures are diagnosable;
					// a reload re-surfaces the result through the recovery path.
					console.warn(
						"Không thể hoàn tất kết quả trên trạm (kết quả đã được thu trên máy này):",
						unknownError,
					);
				},
			);
		}
		setAdmitted(null);
		setAdopted(null);
		setRecoveredResult(null);
		setStartError("");
		setWaitingRound((round) => round + 1);
	}, [acknowledgeResult, active, campaignGameId]);

	const handleResumeRecovery = useCallback(() => {
		if (!pendingRecovery || active) {
			return;
		}
		setRecoveredResult(pendingRecovery);
	}, [active, pendingRecovery]);

	const closeDismissDialog = useCallback(() => {
		setDismissOpen(false);
		setDismissError("");
		requestAnimationFrame(() => dismissTriggerRef.current?.focus());
	}, []);

	const handleDismissRecovery = useCallback(
		async (pin: string) => {
			if (!pendingRecovery) {
				return;
			}
			setDismissError("");
			try {
				await dismissResult({
					campaignGameId,
					sessionId: pendingRecovery.sessionId,
					pin,
				});
				setHandledRecoveryIds((ids) => [...ids, pendingRecovery.sessionId]);
				setDismissOpen(false);
				setDismissError("");
				requestAnimationFrame(() => dismissTriggerRef.current?.focus());
			} catch (unknownError) {
				setDismissError(
					unknownError instanceof Error ? unknownError.message : "Không thể bỏ kết quả",
				);
			}
		},
		[campaignGameId, dismissResult, pendingRecovery],
	);

	if (state === undefined) {
		return (
			<main className="station-status" role="status">
				Đang tải trạng thái trạm chơi…
			</main>
		);
	}

	if (showWaiting) {
		return (
			<>
				<StationWaitingScreen
					key={waitingRound}
					campaignGameId={campaignGameId}
					templateId={state.templateId}
					blocked={state.availability.soldOut || state.schedule.state !== "open"}
					blockedMessage={
						state.schedule.state === "not-started"
							? `Chưa đến giờ — trò chơi mở cửa sổ chơi lúc ${formatScheduleTime(state.schedule.startsAt ?? 0)}.`
							: state.schedule.state === "ended"
								? "Đã kết thúc — cửa sổ chơi của trò chơi này đã đóng."
								: undefined
					}
					gameName={state.gameName}
					brandName={state.campaign.brandName}
					description={state.campaign.description}
					heroAssetUrl={state.campaign.heroAssetUrl}
					assetUrls={state.assetUrls}
					copy={{
						title: state.copy.headline || state.campaign.name,
						subtitle: state.copy.subtitle || state.campaign.brandName || state.campaign.description || undefined,
						ctaLabel: state.copy.startCtaLabel || "Bắt đầu chơi",
						waitingMessage: state.copy.waitingMessage || undefined,
					}}
					pending={startPending}
					statusMessage={startError || undefined}
					recovery={pendingRecovery}
					onStart={() => void handleStart()}
					onResumeRecovery={handleResumeRecovery}
					onDismissRecovery={() => {
						setDismissError("");
						setDismissOpen(true);
					}}
					dismissTriggerRef={dismissTriggerRef}
				/>
				{dismissOpen && pendingRecovery ? (
					<StationPinDialog
						cancelLabel="Quay lại"
						description="Lượt chơi trước có phần thưởng chưa nhận. Nhập mã vận hành để bỏ kết quả này; phần thưởng sẽ không hiển thị lại trên trạm."
						error={dismissError}
						ids={{
							title: "station-dismiss-title",
							description: "station-dismiss-description",
							input: "station-dismiss-pin",
							error: "station-dismiss-error",
						}}
						submitLabel="Bỏ kết quả"
						title="Bỏ kết quả chưa nhận?"
						onClose={closeDismissDialog}
						onSubmit={handleDismissRecovery}
					/>
				) : null}
			</>
		);
	}

	const template = requireGameTemplate(state.templateId);
	const PlayStage = template.PlayStage;
	// The active session's frozen snapshot drives presentation; live entry
	// data is only the fallback (same precedence as the /p surface).
	const session = recoveredResult ?? recovered;
	const stageCopy = session?.copy ?? state.copy;
	return (
		<PlayStage
			key={active.sessionId}
			sessionKey={active.sessionId}
			canPlay
			disabled={false}
			copy={{
				title: stageCopy.headline || state.campaign.name,
				subtitle: stageCopy.subtitle || state.campaign.brandName || undefined,
				ctaLabel: stageCopy.startCtaLabel || undefined,
				collectLabel: stageCopy.collectCtaLabel || undefined,
				waitingMessage: stageCopy.waitingMessage || undefined,
			}}
			heroAssetUrl={state.campaign.heroAssetUrl}
			assetUrls={state.assetUrls}
			playContext={session?.playContext ?? undefined}
			initialOutcome={recoveredResult?.outcome ?? null}
			initialClaim={recoveredResult?.claim ?? null}
			autoBegin
			onPlay={handlePlay}
			onClaim={handleClaim}
			onCollect={handleCollect}
		/>
	);
}

/** Template-owned waiting screen; records exactly one open per mount. */
function StationWaitingScreen({
	campaignGameId,
	templateId,
	blocked,
	blockedMessage,
	copy,
	gameName,
	brandName,
	description,
	heroAssetUrl,
	assetUrls,
	pending,
	statusMessage,
	recovery,
	onStart,
	onResumeRecovery,
	onDismissRecovery,
	dismissTriggerRef,
}: {
	campaignGameId: string;
	templateId: StationPlayState["templateId"];
	blocked: boolean;
	/** Server-computed block reason (play window); defaults to sold-out copy. */
	blockedMessage?: string;
	copy: { title: string; subtitle?: string; ctaLabel: string; waitingMessage?: string };
	gameName: string | null;
	brandName: string | null;
	description: string | null;
	heroAssetUrl: string | null;
	/** Live per-game slot URLs for the template hero (presentation only). */
	assetUrls: Record<string, string>;
	pending: boolean;
	statusMessage?: string;
	recovery: StationRecoverable | null;
	onStart: () => void;
	onResumeRecovery: () => void;
	onDismissRecovery: () => void;
	dismissTriggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
	const recordOpen = useMutation(api.stationPlay.recordStationPlayOpen);
	const openKeyRef = useRef("");
	const openRecordedRef = useRef(false);
	// A failed open re-runs this effect exactly once with the SAME openKey
	// (the server dedupes on it), so a lost open is retried without ever
	// double counting.
	const [openRetryAttempt, setOpenRetryAttempt] = useState(0);

	// One stable key per mount, replayed on failure, so a retry can never
	// split or double count the waiting-screen open.
	useEffect(() => {
		if (openRecordedRef.current) {
			return;
		}
		if (!openKeyRef.current) {
			openKeyRef.current = newStationOpenKey();
		}
		const openKey = openKeyRef.current;
		openRecordedRef.current = true;
		void recordOpen({ campaignGameId, openKey }).catch(() => {
			openRecordedRef.current = false;
			setOpenRetryAttempt((attempt) => (attempt < 1 ? attempt + 1 : attempt));
		});
	}, [campaignGameId, openRetryAttempt, recordOpen]);

	try {
		const template = requireGameTemplate(templateId);
		const EntryHero = template.EntryHero;
		const heroProps: GameEntryHeroProps = {
			// A pending recoverable result must be resolved (resumed or
			// PIN-dismissed by the host) before the next participant starts:
			// silently starting over would abandon the guest's reward while
			// its stock unit and capacity slot stay burned.
			canStart: !blocked && !recovery,
			blockedMessage: recovery
				? "Hãy xử lý phần thưởng chưa nhận phía trên trước khi bắt đầu lượt mới."
				: blocked
					? (blockedMessage ?? "Trò chơi đã hết lượt tham gia.")
					: undefined,
			pending,
			statusMessage,
			copy,
			brandName,
			description,
			gameName,
			heroAssetUrl,
			assetUrls,
			onStart,
		};
		return (
			<>
				<EntryHero {...heroProps} />
				{recovery ? (
					<aside aria-label="Phần thưởng chưa nhận" className="station-recovery">
						<h2 className="station-recovery__title">Có phần thưởng chưa nhận</h2>
						<p className="station-recovery__text">
							Lượt chơi trước đã có kết quả nhưng chưa được hoàn tất. Tiếp tục để hiển thị lại
							phần thưởng, hoặc bỏ kết quả nếu không còn cần thiết.
						</p>
						<div className="station-recovery__actions">
							<button
								className="station-recovery__resume"
								onClick={onResumeRecovery}
								type="button"
							>
								Xem kết quả
							</button>
							<button
								className="station-recovery__dismiss"
								onClick={onDismissRecovery}
								ref={dismissTriggerRef}
								type="button"
							>
								Bỏ kết quả
							</button>
						</div>
					</aside>
				) : null}
			</>
		);
	} catch {
		return (
			<main className="station-status">
				<section className="station-status__card">
					<h1 className="station-status__title">Không thể mở trò chơi</h1>
					<p className="station-status__text">
						Mẫu trò chơi không được hỗ trợ trên trạm.
					</p>
				</section>
			</main>
		);
	}
}

