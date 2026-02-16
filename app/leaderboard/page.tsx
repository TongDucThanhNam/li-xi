"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Rarity } from "@/lib/lixiPolicy";
import { clearOwnerSession } from "@/lib/ownerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";
import styles from "./page.module.css";

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("vi-VN");
}

function rarityClass(rarity: Rarity) {
  return styles[`rarity_${rarity}`];
}

export default function LeaderboardPage() {
  const router = useRouter();
  const owner = useOwnerSession();

  useEffect(() => {
    if (owner === null) {
      router.replace("/auth");
    }
  }, [owner, router]);

  const leaderboard = useQuery(
    api.leaderboard.getOwnerLeaderboard,
    owner ? { ownerId: owner.userId, limit: 50 } : "skip"
  );
  const history = useQuery(api.leaderboard.getOwnerHistory, owner ? { ownerId: owner.userId, limit: 100 } : "skip");

  const handleLogout = () => {
    clearOwnerSession();
    router.replace("/auth");
  };

  if (!owner || leaderboard === undefined || history === undefined) {
    return <main className={styles.page}>Đang tải bảng thống kê...</main>;
  }

  return (
    <main className={styles.page}>
      <section className={styles.layout}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Leaderboard lì xì</h1>
            <p className={styles.subtitle}>Chủ ví: {owner.username}</p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={() => router.push("/draw")}>
              Trạm rút
            </button>
            <button type="button" className={styles.button} onClick={() => router.push("/setup")}>
              Setup
            </button>
            <button type="button" className={styles.button} onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Top theo số tiền</h2>
            {leaderboard.length === 0 ? (
              <p className={styles.empty}>Chưa có lượt rút nào.</p>
            ) : (
              <div className={styles.list}>
                {leaderboard.map((item) => (
                  <article key={item.id} className={styles.item}>
                    <div>
                      <strong>#{item.rank} {item.guestNameDisplay}</strong>
                      <span className={`${styles.rarityBadge} ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                    </div>
                    <div>
                      <span>{formatCurrency(item.amount)}</span>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Lịch sử gần đây</h2>
            {history.length === 0 ? (
              <p className={styles.empty}>Chưa có dữ liệu.</p>
            ) : (
              <div className={styles.list}>
                {history.map((item) => (
                  <article key={item.id} className={styles.item}>
                    <div>
                      <strong>{item.guestNameDisplay}</strong>
                      <span className={`${styles.rarityBadge} ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                    </div>
                    <div>
                      <span>{formatCurrency(item.amount)}</span>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
