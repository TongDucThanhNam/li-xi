"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { RARITY_LABELS, RARITY_VALUES, Rarity } from "@/lib/lixiPolicy";
import { clearOwnerSession } from "@/lib/ownerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";
import styles from "./page.module.css";

type BudgetRow = {
  id: string;
  amount: string;
  quantity: string;
  rarity: Rarity;
};

function createBudgetRow(partial?: Partial<BudgetRow>): BudgetRow {
  return {
    id: crypto.randomUUID(),
    amount: partial?.amount ?? "",
    quantity: partial?.quantity ?? "",
    rarity: partial?.rarity ?? "common",
  };
}

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

export default function SetupPage() {
  const router = useRouter();
  const configureBudget = useMutation(api.setup.configureBudget);
  const owner = useOwnerSession();

  const [rows, setRows] = useState<BudgetRow[]>([
    createBudgetRow({ amount: "100000", quantity: "15", rarity: "common" }),
    createBudgetRow({ amount: "200000", quantity: "20", rarity: "legend" }),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (owner === null) {
      router.replace("/auth");
    }
  }, [owner, router]);

  const ownerId = owner?.userId;
  const ownerName = owner?.username ?? "";

  const setupState = useQuery(api.setup.getSetupState, ownerId ? { ownerId } : "skip");

  useEffect(() => {
    if (!setupState?.hasSetup || !setupState.canConfigure) {
      return;
    }

    setRows(
      setupState.items.map((item) =>
        createBudgetRow({
          amount: String(item.amount),
          quantity: String(item.initialQuantity),
          rarity: item.rarity,
        })
      )
    );
  }, [setupState]);

  const estimatedTotalBudget = useMemo(() => {
    return rows.reduce((sum, row) => {
      const amount = Number(row.amount);
      const quantity = Number(row.quantity);
      if (!Number.isInteger(amount) || !Number.isInteger(quantity)) {
        return sum;
      }
      if (amount <= 0 || quantity <= 0) {
        return sum;
      }
      return sum + amount * quantity;
    }, 0);
  }, [rows]);

  const handleLogout = () => {
    clearOwnerSession();
    router.replace("/auth");
  };

  const handleSubmit = async () => {
    if (!ownerId) {
      return;
    }

    setError("");
    setInfo("");
    setSubmitting(true);

    try {
      const payload = rows.map((row) => {
        const amount = Number(row.amount);
        const quantity = Number(row.quantity);

        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error("Mỗi mệnh giá phải là số nguyên dương");
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error("Số lượng tờ phải là số nguyên dương");
        }

        return {
          amount,
          quantity,
          rarity: row.rarity,
        };
      });

      await configureBudget({
        ownerId,
        items: payload,
      });

      setInfo("Đã cấu hình ngân sách thành công.");
      router.replace("/draw");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Không thể lưu cấu hình");
    } finally {
      setSubmitting(false);
    }
  };

  if (owner === undefined || setupState === undefined) {
    return <main className={styles.page}>Đang tải cấu hình...</main>;
  }

  const hasSetup = setupState.hasSetup;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Thiết lập ngân sách</h1>
            <p className={styles.subtitle}>Chủ ví: {ownerName}</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerButton} onClick={() => router.push("/draw")}>
              Trạm rút
            </button>
            <button type="button" className={styles.headerButton} onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        {setupState.budget ? (
          <div className={styles.summaryRow}>
            <div>
              <span className={styles.summaryLabel}>Tổng ngân sách:</span> {formatCurrency(setupState.budget.totalBudget)}
            </div>
            <div>
              <span className={styles.summaryLabel}>Còn lại:</span> {formatCurrency(setupState.budget.remainingBudget)}
            </div>
          </div>
        ) : null}

        {hasSetup && !setupState.canConfigure ? (
          <div className={styles.lockedBox}>
            Đã có lượt rút phát sinh nên cấu hình ngân sách bị khóa để bảo toàn lịch sử.
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span>Mệnh giá</span>
              <span>Số lượng tờ</span>
              <span>Độ hiếm</span>
              <span></span>
            </div>

            <div className={styles.rows}>
              {rows.map((row) => (
                <div className={styles.row} key={row.id}>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={row.amount}
                    onChange={(event) => {
                      const amount = event.currentTarget.value;
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, amount } : item))
                      );
                    }}
                    placeholder="100000"
                  />
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(event) => {
                      const quantity = event.currentTarget.value;
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, quantity } : item))
                      );
                    }}
                    placeholder="15"
                  />
                  <select
                    className={styles.select}
                    value={row.rarity}
                    onChange={(event) => {
                      const rarity = event.currentTarget.value as Rarity;
                      setRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, rarity } : item))
                      );
                    }}
                  >
                    {RARITY_VALUES.map((rarity) => (
                      <option key={rarity} value={rarity}>
                        {RARITY_LABELS[rarity]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.removeButton}
                    disabled={rows.length <= 1}
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.controls}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setRows((current) => [...current, createBudgetRow()])}
              >
                Thêm mệnh giá
              </button>

              <div className={styles.total}>Tổng dự kiến: {formatCurrency(estimatedTotalBudget)}</div>
            </div>
          </>
        )}

        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.info}>{info}</p> : null}

        {!hasSetup || setupState.canConfigure ? (
          <button type="button" className={styles.primaryButton} disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Đang lưu..." : "Lưu cấu hình ngân sách"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
