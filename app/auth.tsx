"use client";

import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { clearOwnerSession } from "@/lib/ownerSession";


export const Route = createFileRoute("/auth")({
	component: AuthPage,
});

function AuthPage() {
	const navigate = useNavigate();
	const convex = useConvex();
	const { signIn } = useAuthActions();
	const { isAuthenticated } = useConvexAuth();

	const ensureCurrentHostProfile = useMutation(api.auth.ensureCurrentHostProfile);
	const currentUser = useQuery(
		api.auth.getCurrentUser,
		isAuthenticated ? {} : "skip",
	);

	const [oauthSubmitting, setOauthSubmitting] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!currentUser) {
			return;
		}

		let isCancelled = false;

		async function finishOAuthLogin() {
			try {
				clearOwnerSession();
				await ensureCurrentHostProfile({});
				const setupState = await convex.query(api.setup.getSetupState, {});

				if (!isCancelled) {
					void navigate({
						to: setupState.hasSetup ? "/campaigns" : "/setup",
						replace: true,
					});
				}
			} catch (unknownError) {
				if (!isCancelled) {
					setError(
						unknownError instanceof Error
							? unknownError.message
							: "Không thể hoàn tất đăng nhập Google",
					);
					setOauthSubmitting(false);
				}
			}
		}

		void finishOAuthLogin();

		return () => {
			isCancelled = true;
		};
	}, [convex, currentUser, ensureCurrentHostProfile, navigate]);

	const handleGoogleSignIn = async () => {
		setError("");
		setOauthSubmitting(true);

		try {
			await signIn("google", { redirectTo: "/auth" });
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể đăng nhập bằng Google",
			);
			setOauthSubmitting(false);
		}
	};

	return (
		<main className="min-h-screen grid place-items-center p-6 bg-black-ink overflow-hidden relative selection:bg-gold-base/30 selection:text-gold-shine">
			{/* Background atmosphere */}
			<div className="absolute inset-0 noise-overlay opacity-[0.03] pointer-events-none" />
			<div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-red-vivid opacity-[0.08] blur-[120px] pointer-events-none animate-pulse-slow" />
			<div className="absolute bottom-[-5%] right-[-5%] w-[35%] h-[35%] rounded-full bg-gold-base opacity-[0.05] blur-[100px] pointer-events-none animate-pulse-slow" />
			<div className="absolute top-[20%] right-[10%] w-[25%] h-[25%] rounded-full bg-red-deep opacity-[0.04] blur-[80px] pointer-events-none" />

			<section className="w-full max-w-[480px] relative z-10 rounded-2xl border border-gold-base/20 bg-linear-to-br from-red-deep/90 via-black-ink/95 to-black-ink shadow-2xl p-8 sm:p-10 animate-fade-in-up">
				{/* Inner stroke for premium feel */}
				<div className="absolute inset-[1px] rounded-[15px] border border-gold-base/5 pointer-events-none" />

				<header className="relative mb-10 text-center">
					<h1 className="font-cinzel text-4xl sm:text-5xl leading-tight mb-3 tracking-wide bg-linear-to-b from-gold-shine to-gold-base bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(212,175,55,0.25)]">
						Đăng nhập host chiến dịch
					</h1>
					<p className="font-playfair italic text-gold-shine/60 text-base sm:text-lg">
						Cổng quản lý chiến dịch may mắn
					</p>
					<div className="w-16 h-[1px] bg-linear-to-r from-transparent via-gold-base/40 to-transparent mx-auto mt-6" />
				</header>

				{error ? (
					<div className="mb-5 animate-shake rounded-xl border border-red-vivid/30 bg-red-deep/20 text-red-vivid px-4 py-3 text-sm font-vn italic text-center">
						{error}
					</div>
				) : null}

				<button
					type="button"
					disabled={oauthSubmitting}
					className="relative flex h-[56px] w-full items-center justify-center gap-3 rounded-full border border-gold-base/50 bg-linear-to-r from-gold-base to-gold-shine px-5 font-cinzel text-sm font-bold uppercase tracking-widest text-red-deep shadow-[0_14px_36px_rgba(212,175,55,0.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(212,175,55,0.26)] disabled:cursor-not-allowed disabled:opacity-45"
					onClick={handleGoogleSignIn}
				>
					<span className="grid h-7 w-7 place-items-center rounded-full bg-red-deep text-[15px] font-bold text-gold-shine shadow-[0_0_18px_rgba(94,10,10,0.22)]">
						G
					</span>
					{oauthSubmitting ? "Đang mở Google..." : "Tiếp tục với Google"}
				</button>
			</section>
		</main>
	);
}
