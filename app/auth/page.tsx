"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import OtpPinInput from "@/app/components/OtpPinInput";
import { PIN_LENGTH } from "@/lib/lixiPolicy";
import { OwnerSession, writeOwnerSession } from "@/lib/ownerSession";

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

	const canSubmit =
		username.trim().length > 0 && pin.length === PIN_LENGTH && !submitting;

	const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError("");
		setSubmitting(true);

		try {
			const payload = { username: username.trim(), pin };
			const result =
				mode === "login" ? await login(payload) : await register(payload);

			const session: OwnerSession = {
				userId: result.userId,
				username: result.username,
			};
			writeOwnerSession(session);

			const setupState = await convex.query(api.setup.getSetupState, {
				ownerId: result.userId,
			});
			router.replace(setupState.hasSetup ? "/draw" : "/setup");
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể xử lý yêu cầu",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<main
			className="min-h-screen grid place-items-center p-5 bg-[var(--color-black-ink)]"
			style={{
				backgroundImage: [
					"radial-gradient(circle at 20% 20%, rgba(185, 39, 39, 0.35), transparent 42%)",
					"radial-gradient(circle at 80% 8%, rgba(224, 167, 56, 0.2), transparent 36%)",
					"linear-gradient(145deg, #160404 0%, #290808 58%, #1a0606 100%)",
				].join(", "),
			}}
		>
			<section className="w-full max-w-[540px] rounded-[18px] border border-[rgba(242,194,86,0.4)] bg-[linear-gradient(160deg,rgba(39,11,11,0.92),rgba(22,4,4,0.88))] shadow-[0_20px_64px_rgba(0,0,0,0.45)] p-[28px] sm:p-[32px]">
				<h1 className="text-[#ffe8b0] text-[32px] leading-[1.15] mb-2 font-cinzel">
					{mode === "login" ? "Đăng nhập chủ ví" : "Đăng ký chủ ví"}
				</h1>
				<p className="text-[rgba(255,240,194,0.8)] text-[15px] mb-6">
					Tạo và quản lý hoạt động rút lì xì cho người tham gia.
				</p>

				<form
					className="grid gap-[14px]"
					autoComplete="off"
					onSubmit={handleAuth}
				>
					<label
						className="text-[#ffe1a2] text-sm font-semibold"
						htmlFor="owner-username"
					>
						Tên đăng nhập
					</label>
					<input
						id="owner-username"
						className="w-full h-12 rounded-xl border-2 border-[rgba(212,175,55,0.35)] bg-[rgba(16,3,3,0.82)] text-[#f9e3af] px-3.5 text-base outline-none focus:border-[rgba(255,224,130,0.95)] focus:shadow-[0_0_0_3px_rgba(255,224,130,0.2)]"
						type="text"
						value={username}
						autoComplete="off"
						onChange={(event) => setUsername(event.currentTarget.value)}
						placeholder="vd: chu_nha_2026"
						maxLength={32}
						required
					/>

					<label className="text-[#ffe1a2] text-sm font-semibold">
						PIN chủ ví ({PIN_LENGTH} chữ số)
					</label>
					<OtpPinInput
						value={pin}
						onChange={setPin}
						length={PIN_LENGTH}
						disabled={submitting}
						autoFocus
					/>

					{error ? (
						<p className="rounded-xl border border-[rgba(255,118,118,0.55)] bg-[rgba(88,12,12,0.65)] text-[#ffbaba] px-3 py-2.5 text-sm">
							{error}
						</p>
					) : null}

					<button
						type="submit"
						disabled={!canSubmit}
						className="h-[50px] rounded-xl bg-[linear-gradient(135deg,#f0b54a_0%,#cd8f2b_100%)] text-[#2a1201] font-bold text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{submitLabel}
					</button>
				</form>

				<button
					type="button"
					className="w-full mt-3.5 border border-[rgba(244,199,94,0.45)] rounded-xl bg-transparent text-[#ffd88b] text-sm p-3 cursor-pointer hover:bg-[rgba(244,199,94,0.1)] transition-colors"
					onClick={() => {
						setMode(mode === "login" ? "register" : "login");
						setError("");
						setPin("");
					}}
				>
					{mode === "login"
						? "Chưa có tài khoản? Đăng ký"
						: "Đã có tài khoản? Đăng nhập"}
				</button>
			</section>
		</main>
	);
}
