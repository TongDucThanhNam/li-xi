"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BudgetBar from "@/app/draw/components/BudgetBar";
import CreateSessionPanel from "@/app/draw/components/CreateSessionPanel";
import HostHeader from "@/app/draw/components/HostHeader";
import HostShell from "@/app/draw/components/HostShell";
import InventoryList from "@/app/draw/components/InventoryList";
import RecentRedemptions from "@/app/draw/components/RecentRedemptions";
import type { RewardPoolItem } from "@/app/draw/fortune/types";
import { getDrawTemplate, resolveDrawTemplateKey } from "@/app/draw/templates/registry";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { PIN_LENGTH, type Rarity } from "@/lib/lixiPolicy";
import { useHostLogout } from "@/lib/useHostLogout";
import { useOwnerSession } from "@/lib/useOwnerSession";

type PrizeResult = {
	amount: number;
	rarity: Rarity;
};

type CampaignDisplay = {
	name: string;
	brandName: string | null;
	description: string | null;
	claimHeadline: string | null;
	claimSubtitle: string | null;
	claimCtaLabel: string | null;
	claimCollectLabel: string | null;
	claimWaitingMessage: string | null;
	theme: "lunar" | "brand";
	heroAssetUrl: string | null;
};

type DrawSessionView = {
	id: Id<"drawSessions">;
	guestNameDisplay: string;
	campaign?: CampaignDisplay | null;
	rewardPool?: RewardPoolItem[];
};

type PendingLinkSessionView = {
	id: Id<"drawSessions">;
	guestNameDisplay: string;
	sharePath: string;
	campaignName: string | null;
	createdAt: number;
	expiresAt: number;
};

type DeliveryMode = "station" | "link";

export const Route = createFileRoute("/draw")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [
			{ rel: "stylesheet", href: getDrawTemplate().cssHref },
			...getDrawTemplate().fonts,
		],
	}),
	component: DrawPage,
});

function DrawPage() {
	const navigate = useNavigate();
	const owner = useOwnerSession();
	const logout = useHostLogout();

	const createSession = useMutation(api.draw.createSession);
	const cancelSession = useMutation(api.draw.cancelSession);
	const redeem = useMutation(api.draw.redeem);

	const [guestName, setGuestName] = useState("");
	const [hostPin, setHostPin] = useState("");
	const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("station");
	const [activeSession, setActiveSession] = useState<DrawSessionView | null>(
		null,
	);
	const [guestMode, setGuestMode] = useState(false);
	const [lastCreatedSharePath, setLastCreatedSharePath] = useState<string | null>(
		null,
	);
	const [lastCreatedShareExpiresAt, setLastCreatedShareExpiresAt] = useState<
		number | null
	>(null);
	const [cancellingSessionId, setCancellingSessionId] =
		useState<Id<"drawSessions"> | null>(null);
	const [isRevealing, setIsRevealing] = useState(false);
	const [stationGuestWaiting, setStationGuestWaiting] = useState(false);
	const [
		skipAutoGuestUntilPendingCleared,
		setSkipAutoGuestUntilPendingCleared,
	] = useState(false);
	const [, setResult] = useState<{
		guestNameDisplay: string;
		amount: number;
		rarity: Rarity;
	} | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	const handleRevealStateChange = useCallback((revealing: boolean) => {
		setIsRevealing(revealing);
	}, []);

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	const stationState = useQuery(
		api.draw.getStationState,
		owner ? {} : "skip",
	);
	const pendingSession = stationState?.pendingSession ?? null;
	const pendingLinkSessions = useMemo(
		() => (stationState?.pendingLinkSessions ?? []) as PendingLinkSessionView[],
		[stationState?.pendingLinkSessions],
	);

	useEffect(() => {
		if (stationState && !stationState.hasSetup) {
			void navigate({ to: "/setup", replace: true });
			return;
		}

		if (skipAutoGuestUntilPendingCleared) {
			if (!pendingSession) {
				setSkipAutoGuestUntilPendingCleared(false);
				setIsRevealing(false);
			}
			return;
		}

		if (pendingSession && !isRevealing) {
			const snapshot: DrawSessionView = {
				id: pendingSession.id,
				guestNameDisplay: pendingSession.guestNameDisplay,
				campaign: pendingSession.campaign,
				rewardPool: pendingSession.rewardPool,
			};
			setStationGuestWaiting(false);
			setActiveSession(snapshot);
			setGuestMode(true);
			return;
		}

		if (!pendingSession && !isRevealing) {
			setActiveSession(null);
			if (!stationGuestWaiting) {
				setGuestMode(false);
			}
		}
	}, [
		isRevealing,
		pendingSession,
		navigate,
		skipAutoGuestUntilPendingCleared,
		stationState,
		stationGuestWaiting,
	]);

	useEffect(() => {
		if (!lastCreatedSharePath || stationState === undefined) {
			return;
		}
		const stillPending = pendingLinkSessions.some(
			(session) => session.sharePath === lastCreatedSharePath,
		);
		if (!stillPending) {
			setLastCreatedSharePath(null);
			setLastCreatedShareExpiresAt(null);
		}
	}, [lastCreatedSharePath, pendingLinkSessions, stationState]);

	const handleLogout = async () => {
		await logout();
		void navigate({ to: "/auth", replace: true });
	};

	const handleCreateSession = async () => {
		if (!owner) return;

		setLoading(true);
		setError("");
		setNotice("");
		setResult(null);

		try {
			const createdSession = await createSession({
				deliveryMode,
				guestName,
				ownerPin: hostPin,
			});
			setSkipAutoGuestUntilPendingCleared(false);
			setStationGuestWaiting(false);
			setGuestName("");
			setHostPin("");
			if (deliveryMode === "link") {
				setLastCreatedSharePath(createdSession.sharePath);
				setLastCreatedShareExpiresAt(createdSession.expiresAt);
				setGuestMode(false);
				setNotice("Đã tạo link rút công khai.");
			} else {
				setActiveSession({
					id: createdSession.sessionId,
					guestNameDisplay: createdSession.guestNameDisplay,
				});
				setGuestMode(true);
			}
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể tạo lượt rút",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleCancelLinkSession = async (sessionId: Id<"drawSessions">) => {
		if (!owner || cancellingSessionId) return;

		setError("");
		setNotice("");
		setCancellingSessionId(sessionId);
		try {
			await cancelSession({
				sessionId,
			});
			const cancelledLink = pendingLinkSessions.find(
				(session) => session.id === sessionId,
			);
			if (cancelledLink?.sharePath === lastCreatedSharePath) {
				setLastCreatedSharePath(null);
				setLastCreatedShareExpiresAt(null);
			}
			setNotice("Đã hủy link rút đang chờ.");
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể hủy link rút",
			);
		} finally {
			setCancellingSessionId(null);
		}
	};

	const handleRedeem = async (envelopeIndex: number): Promise<PrizeResult> => {
		if (!activeSession) {
			throw new Error("Không tìm thấy phiên rút đang hoạt động");
		}
		if (!owner) {
			throw new Error("Phiên host không hợp lệ");
		}

		setLoading(true);
		setError("");
		setNotice("");
		setResult(null);
		setIsRevealing(true);

		try {
			const redeemResult = await redeem({
				sessionId: activeSession.id,
				envelopeIndex,
			});

			setResult({
				guestNameDisplay: redeemResult.guestNameDisplay,
				amount: redeemResult.amount,
				rarity: redeemResult.rarity,
			});
			setNotice("Rút phong bao thành công.");

			return {
				amount: redeemResult.amount,
				rarity: redeemResult.rarity,
			};
		} catch (unknownError) {
			const message =
				unknownError instanceof Error
					? unknownError.message
					: "Không thể rút phong bao";
			setError(message);
			setIsRevealing(false);
			throw new Error(message);
		} finally {
			setLoading(false);
		}
	};

	if (!owner || stationState === undefined) {
		return (
			<HostShell>
				<div className="relative z-10 flex flex-1 items-center justify-center">
					<div className="flex flex-col items-center gap-6">
						<div className="h-16 w-16 animate-spin rounded-full border-4 border-gold-base/20 border-t-gold-base shadow-[0_0_20px_rgba(212,175,55,0.2)]" />
						<span className="font-playfair text-xl font-bold tracking-[0.2em] text-gold-shine/60 animate-pulse">
							ĐANG TẢI TRẠM RÚT...
						</span>
					</div>
				</div>
			</HostShell>
		);
	}

	const activePendingSession =
		activeSession && pendingSession?.id === activeSession.id ? pendingSession : null;
	const guestCampaign =
		activePendingSession?.campaign ??
		activeSession?.campaign ??
		stationState.activeCampaign ??
		null;
	const guestRewardPool =
		activePendingSession?.rewardPool && activePendingSession.rewardPool.length > 0
			? activePendingSession.rewardPool
			: activeSession?.rewardPool && activeSession.rewardPool.length > 0
				? activeSession.rewardPool
				: [];
	const guestRewardPoolReady = Boolean(activeSession && guestRewardPool.length > 0);
	const DrawStage = getDrawTemplate(resolveDrawTemplateKey(guestCampaign?.theme)).Stage;

	if (guestMode) {
		return (
			<main className="w-screen h-dvh overflow-hidden bg-black-ink">
				<DrawStage
					sessionKey={activeSession?.id ?? null}
					guestName={activeSession?.guestNameDisplay}
					campaignTitle={
						guestCampaign?.claimHeadline ??
						guestCampaign?.name ??
						undefined
					}
					campaignSubtitle={
						guestCampaign?.claimSubtitle ??
						guestCampaign?.brandName ??
						guestCampaign?.description ??
						undefined
					}
					ctaLabel={guestCampaign?.claimCtaLabel ?? undefined}
					collectLabel={guestCampaign?.claimCollectLabel ?? undefined}
						waitingMessage={
							activeSession
								? guestCampaign?.claimWaitingMessage ?? "Đang chuẩn bị lượt rút"
								: "Đang chờ lượt rút tiếp theo"
						}
						statusMessage={
							activeSession
								? guestRewardPoolReady
									? undefined
									: "Đang đồng bộ phần thưởng cho lượt rút."
								: "Trạm đang chờ lượt rút tiếp theo."
						}
						heroAssetUrl={guestCampaign?.heroAssetUrl ?? null}
						canStart={guestRewardPoolReady}
						disabled={loading || !guestRewardPoolReady}
					rewardPool={guestRewardPool}
					onRedeem={handleRedeem}
					onRevealStateChange={handleRevealStateChange}
					onCollect={() => {
						setSkipAutoGuestUntilPendingCleared(true);
						setStationGuestWaiting(true);
						setActiveSession(null);
						setGuestMode(true);
						setNotice("Đã hoàn tất lượt rút.");
					}}
					onExit={() => {
						setSkipAutoGuestUntilPendingCleared(false);
						setStationGuestWaiting(false);
						setActiveSession(null);
						setGuestMode(false);
						setNotice("Đã quay lại bảng điều khiển.");
					}}
				/>
			</main>
		);
	}

	return (
		<HostShell>
			<section className="relative z-10 flex h-full w-full flex-col gap-4 animate-fade-in-up overflow-hidden">
				<HostHeader
					ownerUsername={owner.username}
					onCampaigns={() => void navigate({ to: "/campaigns" })}
					onSetup={() => void navigate({ to: "/setup" })}
					onLeaderboard={() => void navigate({ to: "/leaderboard" })}
					onLogout={handleLogout}
				/>

				{stationState.budget ? (
					<BudgetBar
						totalBudget={stationState.budget.totalBudget}
						remainingBudget={stationState.budget.remainingBudget}
						availableUnits={stationState.availableUnits}
					/>
				) : null}

				<div className="flex flex-col gap-2 shrink-0">
					{error ? (
						<div className="group relative overflow-hidden rounded-xl border border-red-vivid/40 bg-linear-to-r from-red-deep/40 to-black-ink/60 px-4 py-2 shadow-xl backdrop-blur-md animate-shake">
							<div className="absolute inset-0 noise-overlay opacity-[0.05]" />
							<div className="relative z-10 flex items-center gap-3">
								<div className="h-1.5 w-1.5 rounded-full bg-red-vivid shadow-[0_0_10px_rgba(179,20,20,0.8)]" />
								<p className="font-vn text-[13px] font-bold text-red-vivid/90">
									{error}
								</p>
							</div>
						</div>
					) : null}
					{notice ? (
						<div className="group relative overflow-hidden rounded-xl border border-gold-base/30 bg-linear-to-r from-gold-base/10 to-black-ink/60 px-4 py-2 shadow-xl backdrop-blur-md animate-fade-in">
							<div className="absolute inset-0 noise-overlay opacity-[0.05]" />
							<div className="relative z-10 flex items-center gap-3">
								<div className="h-1.5 w-1.5 rounded-full bg-gold-base shadow-[0_0_10px_rgba(212,175,55,0.8)] animate-pulse" />
								<p className="font-vn text-[13px] font-bold text-gold-shine/80">
									{notice}
								</p>
							</div>
						</div>
					) : null}
				</div>

				<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12 overflow-hidden">
					<section className="lg:col-span-7 h-full overflow-hidden">
						<CreateSessionPanel
							guestName={guestName}
							hostPin={hostPin}
							deliveryMode={deliveryMode}
							sharePath={lastCreatedSharePath}
							shareExpiresAt={lastCreatedShareExpiresAt}
							pendingLinkSessions={pendingLinkSessions}
							cancellingSessionId={cancellingSessionId}
							pinLength={PIN_LENGTH}
							loading={loading}
							onGuestNameChange={setGuestName}
							onHostPinChange={setHostPin}
							onDeliveryModeChange={setDeliveryMode}
							onCancelLinkSession={handleCancelLinkSession}
							onCreate={handleCreateSession}
						/>
					</section>

					<aside className="flex flex-col gap-4 lg:col-span-5 h-full overflow-hidden">
						<div className="flex-1 min-h-0">
							<InventoryList items={stationState.budgetItems} />
						</div>
						<div className="flex-1 min-h-0">
							<RecentRedemptions items={stationState.recentRedemptions} />
						</div>
					</aside>
				</div>
			</section>
		</HostShell>
	);
}
