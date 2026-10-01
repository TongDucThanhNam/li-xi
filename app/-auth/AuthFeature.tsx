"use client";

import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Alert, Button, Spinner } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useConvex, useQuery } from "convex/react";
import { BarChart3, Gift, Link2, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { clearOwnerSession } from "@/lib/ownerSession";

export function AuthFeature() {
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
	const isCompletingOAuth = oauthSubmitting || (isAuthenticated && !currentUser);

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
						to: setupState.hasSetup ? "/campaigns" : "/onboarding",
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
		<main className="admin-standalone">
			<div className="admin-standalone__inner">
				<div className="admin-standalone__brand">
					<span className="admin-sidebar-brand__mark"><Sparkles aria-hidden="true" size={18} /></span>
					<span className="text-base font-semibold text-foreground">Campaign Game Studio</span>
				</div>
				<section className="admin-standalone__card">
					<div className="flex flex-col gap-2">
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Đăng nhập dành cho host</h1>
						<p className="text-sm leading-6 text-muted">Tạo chiến dịch trò chơi có thương hiệu, phát phần thưởng và theo dõi kết quả trong một không gian làm việc.</p>
					</div>
					{error ? (
						<Alert status="danger">
							<Alert.Indicator />
							<Alert.Content>
								<Alert.Title>{error}</Alert.Title>
							</Alert.Content>
						</Alert>
					) : null}
					<div className="flex flex-col gap-3">
						<Button
							fullWidth
							isDisabled={isCompletingOAuth}
							isPending={isCompletingOAuth}
							size="lg"
							type="button"
							onPress={handleGoogleSignIn}
						>
							{({ isPending }) => (
								<>
									{isPending ? (
										<Spinner color="current" size="sm" />
									) : (
										<span className="grid size-6 place-items-center rounded-full bg-background text-xs font-semibold text-foreground">
											G
										</span>
									)}
									{isPending ? "Đang đăng nhập…" : "Tiếp tục với Google"}
								</>
							)}
						</Button>
						<p aria-live="polite" className="text-xs leading-5 text-muted" role="status">
							{isCompletingOAuth
								? "Đang tạo hồ sơ host và mở không gian làm việc…"
								: "Lần đăng nhập đầu tiên sẽ tạo không gian làm việc cho tài khoản Google của bạn."}
						</p>
					</div>
				</section>
				<ul className="admin-standalone__points">
					<li><Gift aria-hidden="true" size={16} />Trò chơi có thương hiệu cho từng chiến dịch</li>
					<li><Link2 aria-hidden="true" size={16} />Liên kết công khai, mã QR và trạm chơi</li>
					<li><BarChart3 aria-hidden="true" size={16} />Phân tích lượt chơi và phần thưởng</li>
				</ul>
			</div>
		</main>
	);
}
