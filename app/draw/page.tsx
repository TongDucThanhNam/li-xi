"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BudgetBar from "@/app/draw/components/BudgetBar";
import CreateSessionPanel from "@/app/draw/components/CreateSessionPanel";
import HostHeader from "@/app/draw/components/HostHeader";
import HostShell from "@/app/draw/components/HostShell";
import InventoryList from "@/app/draw/components/InventoryList";
import RecentRedemptions from "@/app/draw/components/RecentRedemptions";
import FortuneStage from "@/app/draw/FortuneStage";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PIN_LENGTH, type Rarity } from "@/lib/lixiPolicy";
import { clearOwnerSession } from "@/lib/ownerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";

type PrizeResult = {
	amount: number;
	rarity: Rarity;
};

type DrawSessionView = {
	id: Id<"drawSessions">;
	guestNameDisplay: string;
};

export default function DrawPage() {
	const router = useRouter();
	const owner = useOwnerSession();

	const createSession = useMutation(api.draw.createSession);
	const redeem = useMutation(api.draw.redeem);

	const [guestName, setGuestName] = useState("");
	const [hostPin, setHostPin] = useState("");
	const [activeSession, setActiveSession] = useState<DrawSessionView | null>(
		null,
	);
	const [guestMode, setGuestMode] = useState(false);
	const [isRevealing, setIsRevealing] = useState(false);
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
			router.replace("/auth");
		}
	}, [owner, router]);

	const stationState = useQuery(
		api.draw.getStationState,
		owner?.userId ? { ownerId: owner.userId } : "skip",
	);
	const pendingSession = stationState?.pendingSession ?? null;

	useEffect(() => {
		if (stationState && !stationState.hasSetup) {
			router.replace("/setup");
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
			};
			setActiveSession(snapshot);
			setGuestMode(true);
			return;
		}

		if (!pendingSession && !isRevealing) {
			setActiveSession(null);
			setGuestMode(false);
		}
	}, [
		isRevealing,
		pendingSession,
		router,
		skipAutoGuestUntilPendingCleared,
		stationState,
	]);

	const handleLogout = () => {
		clearOwnerSession();
		router.replace("/auth");
	};

	const handleCreateSession = async () => {
		if (!owner) return;

		setLoading(true);
		setError("");
		setNotice("");
		setResult(null);

		try {
			const createdSession = await createSession({
				ownerId: owner.userId,
				guestName,
				ownerPin: hostPin,
			});
			setActiveSession({
				id: createdSession.sessionId,
				guestNameDisplay: createdSession.guestNameDisplay,
			});
			setSkipAutoGuestUntilPendingCleared(false);
			setGuestMode(true);
			setGuestName("");
			setHostPin("");
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

	const handleRedeem = async (envelopeIndex: number): Promise<PrizeResult> => {
		if (!activeSession) {
			throw new Error("Không tìm thấy phiên rút đang hoạt động");
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

	if (guestMode) {
		return (
			<main className="w-screen h-dvh overflow-hidden bg-black-ink">
				<FortuneStage
					sessionId={activeSession?.id ?? null}
					canStart={Boolean(activeSession)}
					disabled={loading || !activeSession}
					rewardPool={stationState.budgetItems.map((item) => ({
						amount: item.amount,
						rarity: item.rarity,
						remainingQuantity: item.remainingQuantity,
					}))}
					onRedeem={handleRedeem}
					onRevealStateChange={handleRevealStateChange}
					onCollect={() => {
						setSkipAutoGuestUntilPendingCleared(true);
						setActiveSession(null);
						setGuestMode(false);
						setNotice("Đã hoàn tất lượt rút.");
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
					onSetup={() => router.push("/setup")}
					onLeaderboard={() => router.push("/leaderboard")}
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
							pinLength={PIN_LENGTH}
							loading={loading}
							onGuestNameChange={setGuestName}
							onHostPinChange={setHostPin}
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
