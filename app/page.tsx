"use client";

import { useRouter } from "next/navigation";
import { useOwnerSession } from "@/lib/useOwnerSession";
import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const owner = useOwnerSession();

  return (
    <main className={styles.page}>
      <div className={styles.noiseOverlay} />
      <div className={`${styles.ambientLight} ${styles.lightOne}`} />
      <div className={`${styles.ambientLight} ${styles.lightTwo}`} />
      <div className={`${styles.ambientLight} ${styles.lightThree}`} />

      <section className={styles.hero}>
        <h1 className={styles.title}>Lunar Fortune</h1>
        <p className={styles.subtitle}>Premium Gacha Experience</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => router.push(owner ? "/draw" : "/auth")}
          >
            {owner ? "Vào Trạm Rút" : "Đăng Nhập Chủ Ví"}
          </button>
          <button type="button" className={styles.buttonAlt} onClick={() => router.push("/leaderboard")}>
            Leaderboard
          </button>
        </div>
      </section>
    </main>
  );
}
