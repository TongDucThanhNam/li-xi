"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import FortuneStage from "@/app/draw/FortuneStage";
import BudgetBar from "@/app/draw/components/BudgetBar";
import CreateSessionPanel from "@/app/draw/components/CreateSessionPanel";
import HostHeader from "@/app/draw/components/HostHeader";
import HostShell from "@/app/draw/components/HostShell";
import InventoryList from "@/app/draw/components/InventoryList";
import PendingSessionPanel from "@/app/draw/components/PendingSessionPanel";
import RecentRedemptions from "@/app/draw/components/RecentRedemptions";
import ResultSummary from "@/app/draw/components/ResultSummary";
import { classNames } from "@/app/draw/hostStyles";
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
  const cancelSession = useMutation(api.draw.cancelSession);
  const redeem = useMutation(api.draw.redeem);

  const [guestName, setGuestName] = useState("");
  const [hostPin, setHostPin] = useState("");
  const [activeSession, setActiveSession] = useState<DrawSessionView | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
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

    if (!pendingSession && !isRevealing) {
      setActiveSession(null);
      return;
    }

    if (pendingSession && !isRevealing) {
      const snapshot: DrawSessionView = {
        id: pendingSession.id,
        guestNameDisplay: pendingSession.guestNameDisplay,
      };
      setActiveSession(snapshot);
    }
  }, [isRevealing, pendingSession, router, stationState]);

  const guestStatusMessage = useMemo(() => {
    if (!pendingSession) {
      return "Đang chờ host tạo lượt rút mới.";
    }
    return "";
  }, [pendingSession]);

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
      await createSession({
        ownerId: owner.userId,
        guestName,
        ownerPin: hostPin,
      });
      setGuestName("");
      setHostPin("");
      setNotice("Đã tạo lượt rút. Có thể vào giao diện người rút.");
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

  const handleCancelSession = async () => {
    if (!owner || !pendingSession) {
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      await cancelSession({
        ownerId: owner.userId,
        sessionId: pendingSession.id,
      });
      setActiveSession(null);
      setNotice("Đã hủy lượt hiện tại.");
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Không thể hủy lượt rút",
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
        <div className={classNames.layout}>Đang tải trạm rút...</div>
      </HostShell>
    );
  }

  if (guestMode) {
    return (
      <main className={classNames.guestPage}>
        <FortuneStage
          sessionId={activeSession?.id ?? null}
          canStart={Boolean(activeSession)}
          disabled={loading || !pendingSession}
          statusMessage={guestStatusMessage || undefined}
          rewardPool={stationState.budgetItems.map((item) => ({
            amount: item.amount,
            rarity: item.rarity,
            remainingQuantity: item.remainingQuantity,
          }))}
          onRedeem={handleRedeem}
          onRevealStateChange={handleRevealStateChange}
          onCollect={() => {
            setIsRevealing(false);
            setActiveSession(null);
          }}
          onExit={() => setGuestMode(false)}
        />
      </main>
    );
  }

  return (
    <HostShell>
      <section className={classNames.layout}>
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

        {error ? <p className={classNames.error}>{error}</p> : null}
        {notice ? <p className={classNames.notice}>{notice}</p> : null}
        {result ? (
          <ResultSummary
            guestNameDisplay={result.guestNameDisplay}
            amount={result.amount}
            rarity={result.rarity}
          />
        ) : null}

        <div className={classNames.content}>
          <section className={classNames.mainPanel}>
            {!pendingSession ? (
              <CreateSessionPanel
                guestName={guestName}
                hostPin={hostPin}
                pinLength={PIN_LENGTH}
                loading={loading}
                onGuestNameChange={setGuestName}
                onHostPinChange={setHostPin}
                onCreate={handleCreateSession}
              />
            ) : (
              <PendingSessionPanel
                guestNameDisplay={pendingSession.guestNameDisplay}
                loading={loading}
                isRevealing={isRevealing}
                onEnterGuest={() => setGuestMode(true)}
                onCancel={handleCancelSession}
              />
            )}
          </section>

          <aside className={classNames.sidePanel}>
            <InventoryList items={stationState.budgetItems} />
            <RecentRedemptions items={stationState.recentRedemptions} />
          </aside>
        </div>
      </section>
    </HostShell>
  );
}
