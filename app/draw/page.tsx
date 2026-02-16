"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import FortuneStage from "@/app/draw/FortuneStage";
import BudgetBar from "@/app/draw/components/BudgetBar";
import CreateSessionPanel from "@/app/draw/components/CreateSessionPanel";
import HostHeader from "@/app/draw/components/HostHeader";
import HostShell from "@/app/draw/components/HostShell";
import InventoryList from "@/app/draw/components/InventoryList";
import RecentRedemptions from "@/app/draw/components/RecentRedemptions";
import ResultSummary from "@/app/draw/components/ResultSummary";
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
	const [result, setResult] = useState<{
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
		if (!stationState?.hasSetup) {
			if (stationState) {
				router.replace("/setup");
			}
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
		if (!owner) {
			return;
		}

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
				<div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
					Đang tải trạm rút...
				</div>
			</HostShell>
		);
	}

	if (guestMode) {
		return (
			<main className="min-h-screen bg-black-ink p-0">
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
			<section className="relative z-10 flex w-full flex-1 flex-col gap-8 animate-fade-in-up">
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

				{error ? (
					<p className="rounded-[12px] border border-[rgba(255,160,160,0.54)] bg-[rgba(94,10,10,0.7)] px-[16px] py-[12px] text-[rgba(255,220,220,0.95)] backdrop-blur-md shadow-lg animate-shake">
						{error}
					</p>
				) : null}
				{notice ? (
					<p className="rounded-[12px] border border-[rgba(212,175,55,0.5)] bg-[rgba(44,24,0,0.6)] px-[16px] py-[12px] text-[rgba(255,241,203,0.95)] backdrop-blur-md shadow-lg animate-fade-in">
						{notice}
					</p>
				) : null}
				{result ? (
					<ResultSummary
						guestNameDisplay={result.guestNameDisplay}
						amount={result.amount}
						rarity={result.rarity}
					/>
				) : null}

				<div className="grid flex-1 gap-[24px] lg:grid-cols-12 items-start">
					<section className="grid gap-[20px] lg:col-span-7">
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

					<aside className="grid gap-[24px] lg:col-span-5 h-full">
						<InventoryList items={stationState.budgetItems} />
						<RecentRedemptions items={stationState.recentRedemptions} />
					</aside>
				</div>
			</section>
		</HostShell>
	);
}
