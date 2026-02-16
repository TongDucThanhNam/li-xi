"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import OtpPinInput from "@/app/components/OtpPinInput";
import { PIN_LENGTH } from "@/lib/lixiPolicy";
import { OwnerSession, writeOwnerSession } from "@/lib/ownerSession";
import styles from "./page.module.css";

type AuthMode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const convex = useConvex();

  const login = useMutation(api.auth.login);
  const register = useMutation(api.auth.register);

  const [mode, setMode] = useState<AuthMode>("register");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submitLabel = useMemo(() => {
    if (submitting) {
      return "Đang xử lý...";
    }
    return mode === "login" ? "Đăng nhập" : "Đăng ký";
  }, [mode, submitting]);

  const canSubmit = username.trim().length > 0 && pin.length === PIN_LENGTH && !submitting;

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = { username: username.trim(), pin };
      const result = mode === "login" ? await login(payload) : await register(payload);

      const session: OwnerSession = {
        userId: result.userId,
        username: result.username,
      };
      writeOwnerSession(session);

      const setupState = await convex.query(api.setup.getSetupState, { ownerId: result.userId });
      router.replace(setupState.hasSetup ? "/draw" : "/setup");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Không thể xử lý yêu cầu");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>{mode === "login" ? "Đăng nhập chủ ví" : "Đăng ký chủ ví"}</h1>
        <p className={styles.subtitle}>Tạo và quản lý hoạt động rút lì xì cho người tham gia.</p>

        <form className={styles.form} autoComplete="off" onSubmit={handleAuth}>
          <label className={styles.label} htmlFor="owner-username">
            Tên đăng nhập
          </label>
          <input
            id="owner-username"
            className={styles.input}
            type="text"
            value={username}
            autoComplete="off"
            onChange={(event) => setUsername(event.currentTarget.value)}
            placeholder="vd: chu_nha_2026"
            maxLength={32}
            required
          />

          <label className={styles.label}>PIN chủ ví ({PIN_LENGTH} chữ số)</label>
          <OtpPinInput value={pin} onChange={setPin} length={PIN_LENGTH} disabled={submitting} autoFocus />

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" disabled={!canSubmit} className={styles.primaryButton}>
            {submitLabel}
          </button>
        </form>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setPin("");
          }}
        >
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </section>
    </main>
  );
}
