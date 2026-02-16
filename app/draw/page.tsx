"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import OtpPinInput from "@/app/components/OtpPinInput";
import FortuneStage from "@/app/draw/FortuneStage";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PIN_LENGTH, Rarity } from "@/lib/lixiPolicy";
import { clearOwnerSession } from "@/lib/ownerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";
import styles from "./page.module.css";

type PrizeResult = {
  amount: number;
  rarity: Rarity;
};

type DrawSessionView = {
  id: Id<"drawSessions">;
  guestNameDisplay: string;
};

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("vi-VN");
}

function rarityClass(rarity: Rarity) {
  return styles[`rarity_${rarity}`];
}

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
  const [result, setResult] = useState<{ guestNameDisplay: string; amount: number; rarity: Rarity } | null>(null);
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

  const stationState = useQuery(api.draw.getStationState, owner?.userId ? { ownerId: owner.userId } : "skip");
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
      setError(unknownError instanceof Error ? unknownError.message : "Không thể tạo lượt rút");
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
      setError(unknownError instanceof Error ? unknownError.message : "Không thể hủy lượt rút");
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
      const message = unknownError instanceof Error ? unknownError.message : "Không thể rút phong bao";
      setError(message);
      setIsRevealing(false);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!owner || stationState === undefined) {
    return <main className={styles.page}>Đang tải trạm rút...</main>;
  }

  if (guestMode) {
    return (
      <main className={styles.guestPage}>
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
    <main className={styles.page}>
      <section className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Host Station</h1>
            <p className={styles.subtitle}>Chủ ví: {owner.username}</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerButton} onClick={() => router.push("/setup")}>
              Setup
            </button>
            <button type="button" className={styles.headerButton} onClick={() => router.push("/leaderboard")}>
              Leaderboard
            </button>
            <button type="button" className={styles.headerButton} onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        {stationState.budget ? (
          <div className={styles.budgetBar}>
            <span>Tổng ngân sách: {formatCurrency(stationState.budget.totalBudget)}</span>
            <span>Còn lại: {formatCurrency(stationState.budget.remainingBudget)}</span>
            <span>Số tờ còn lại: {stationState.availableUnits}</span>
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}
        {result ? (
          <div className={styles.resultBox}>
            <span>{result.guestNameDisplay} nhận:</span>
            <strong>{formatCurrency(result.amount)}</strong>
            <span className={`${styles.rarityBadge} ${rarityClass(result.rarity)}`}>{result.rarity.toUpperCase()}</span>
          </div>
        ) : null}

        <div className={styles.content}>
          <section className={styles.mainPanel}>
            {!pendingSession ? (
              <div className={styles.block}>
                <h2 className={styles.blockTitle}>Tạo lượt rút mới</h2>
                <label className={styles.label} htmlFor="guest-name">
                  Tên người rút
                </label>
                <input
                  id="guest-name"
                  className={styles.input}
                  value={guestName}
                  onChange={(event) => setGuestName(event.currentTarget.value)}
                  placeholder="vd: Nguyen Van A"
                />
                <label className={styles.label}>PIN chủ ví</label>
                <OtpPinInput value={hostPin} onChange={setHostPin} length={PIN_LENGTH} disabled={loading} />
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={loading || guestName.trim().length < 2 || hostPin.length !== PIN_LENGTH}
                  onClick={handleCreateSession}
                >
                  {loading ? "Đang tạo..." : "Tạo phiên"}
                </button>
              </div>
            ) : (
              <div className={styles.block}>
                <h2 className={styles.blockTitle}>Phiên đang chờ: {pendingSession.guestNameDisplay}</h2>
                <button type="button" className={styles.primaryButton} disabled={loading} onClick={() => setGuestMode(true)}>
                  Vào giao diện người rút
                </button>

                <button type="button" className={styles.secondaryButton} disabled={loading || isRevealing} onClick={handleCancelSession}>
                  Hủy phiên hiện tại
                </button>
              </div>
            )}
          </section>

          <aside className={styles.sidePanel}>
            <section className={styles.block}>
              <h2 className={styles.sideTitle}>Tồn kho hiện tại</h2>
              <div className={styles.inventoryList}>
                {stationState.budgetItems.map((item) => (
                  <div key={item.id} className={styles.inventoryItem}>
                    <div>
                      <strong>{formatCurrency(item.amount)}</strong>
                      <span className={`${styles.rarityBadge} ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                    </div>
                    <span>
                      {item.remainingQuantity} / {item.initialQuantity} tờ
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.block}>
              <h2 className={styles.sideTitle}>Lượt rút gần đây</h2>
              <div className={styles.historyList}>
                {stationState.recentRedemptions.length === 0 ? (
                  <p className={styles.empty}>Chưa có lượt rút nào.</p>
                ) : (
                  stationState.recentRedemptions.map((item) => (
                    <div key={item.id} className={styles.historyItem}>
                      <div>
                        <strong>{item.guestNameDisplay}</strong>
                        <span className={`${styles.rarityBadge} ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                      </div>
                      <div>
                        <span>{formatCurrency(item.amount)}</span>
                        <span>{formatTime(item.createdAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
