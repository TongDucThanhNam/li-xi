"use client";

import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Alert, Button, Chip, ProgressCircle, Spinner } from "@heroui/react";
import { ItemCard, ItemCardGroup, Stepper, Widget } from "@heroui-pro/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useConvex, useQuery } from "convex/react";
import {
	BarChart3,
	FileText,
	Gift,
	Link2,
	MonitorPlay,
	ShieldCheck,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { clearOwnerSession } from "@/lib/ownerSession";
import adminCss from "./styles/admin.css?url";

const authFeatureItems = [
	{
		icon: Gift,
		label: "Studio",
		text: "Copy, assets, public links",
	},
	{
		icon: MonitorPlay,
		label: "Station",
		text: "PIN guard, guest sessions",
	},
	{
		icon: BarChart3,
		label: "Analytics",
		text: "Leaderboard, redemption history",
	},
];

const authFlowSteps = [
	{
		description: "Google OAuth tạo host profile và workspace quản trị.",
		icon: ShieldCheck,
		title: "Authenticate",
	},
	{
		description: "Thiết lập ngân sách thưởng và PIN vận hành tại trạm.",
		icon: FileText,
		title: "Setup",
	},
	{
		description: "Chỉnh campaign copy, hero asset, public link và billing.",
		icon: Link2,
		title: "Campaign Studio",
	},
	{
		description: "Mở station mode và theo dõi leaderboard sau mỗi lượt nhận.",
		icon: MonitorPlay,
		title: "Operate",
	},
];

export const Route = createFileRoute("/auth")({
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
	}),
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
	const isCompletingOAuth = oauthSubmitting || (isAuthenticated && !currentUser);
	const authStep = currentUser ? 2 : isCompletingOAuth ? 1 : 0;
	const authCommandRows = [
		{
			icon: ShieldCheck,
			title: "Google OAuth",
			description: isAuthenticated
				? "Session Google đã được xác thực."
				: "Yêu cầu host xác thực trước khi vào workspace.",
			chip: isAuthenticated ? "Connected" : "Required",
			color: isAuthenticated ? "success" : "accent",
		},
		{
			icon: FileText,
			title: "Host profile",
			description: currentUser
				? "Host profile đã sẵn sàng."
				: isCompletingOAuth
					? "Đang tạo hoặc đồng bộ host profile."
					: "Sẽ được tạo sau OAuth.",
			chip: currentUser ? "Ready" : isCompletingOAuth ? "Syncing" : "Pending",
			color: currentUser ? "success" : isCompletingOAuth ? "accent" : "default",
		},
		{
			icon: Link2,
			title: "Next route",
			description: "Đi tới Budget Setup hoặc Campaign Studio tùy trạng thái workspace.",
			chip: currentUser ? "Routing" : "Guarded",
			color: currentUser ? "success" : "default",
		},
	] as const;
	const authReadyCount = authCommandRows.filter(
		(item) => item.color === "success",
	).length;
	const authProgress = Math.round(
		(authReadyCount / authCommandRows.length) * 100,
	);

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
		<main className="grid min-h-dvh items-start justify-items-center bg-background px-4 pb-10 pt-8 text-foreground sm:px-6 sm:pt-10 lg:px-8 lg:pt-14">
			<div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[430px_minmax(0,1fr)] lg:items-start">
				<div className="grid gap-4">
					<div className="flex min-w-0 items-start gap-4">
						<span className="mt-1 grid size-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-accent">
							<Gift aria-hidden="true" size={20} strokeWidth={2} />
						</span>
						<div className="min-w-0">
							<Chip color="accent" variant="soft">
								Prize Draw Platform
							</Chip>
							<h1 className="mt-4 text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
								Li Xi Station
							</h1>
							<p className="mt-3 max-w-md text-sm leading-6 text-muted">
								Workspace điều phối campaign, ngân sách thưởng, public claim và
								station operations.
							</p>
						</div>
					</div>
					<Widget>
						<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
							<div>
								<Widget.Title>Đăng nhập host chiến dịch</Widget.Title>
								<Widget.Description>
									Mở Campaign Studio bằng Google OAuth.
								</Widget.Description>
							</div>
							<Chip color="accent" variant="soft">
								Secure
							</Chip>
						</Widget.Header>
							<Widget.Content className="gap-5">
								<div className="flex items-center gap-4">
									{authProgress > 0 ? (
										<ProgressCircle
											aria-label="Authentication progress"
											color={authStep >= 2 ? "success" : "accent"}
											size="sm"
											value={authProgress}
										>
											<ProgressCircle.Track>
												<ProgressCircle.TrackCircle />
												<ProgressCircle.FillCircle />
											</ProgressCircle.Track>
										</ProgressCircle>
									) : (
										<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-accent">
											<ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
										</span>
									)}
								<div className="min-w-0">
									<div className="flex items-baseline gap-2">
										<p className="text-2xl font-semibold tabular-nums text-foreground">
											{authProgress}%
										</p>
										<Chip
											color={authStep >= 2 ? "success" : "accent"}
											size="sm"
											variant="soft"
										>
											{authReadyCount}/{authCommandRows.length} ready
										</Chip>
									</div>
									<p className="mt-1 text-sm leading-6 text-muted">
										OAuth, host profile, and workspace routing readiness.
									</p>
								</div>
							</div>
							{error ? (
								<Alert status="danger">
									<Alert.Indicator />
									<Alert.Content>
										<Alert.Title>{error}</Alert.Title>
									</Alert.Content>
								</Alert>
							) : null}
							{isCompletingOAuth ? (
								<Alert status="accent" aria-live="polite">
									<Alert.Indicator>
										<Spinner size="sm" />
									</Alert.Indicator>
									<Alert.Content>
										<Alert.Title>Đang hoàn tất đăng nhập</Alert.Title>
										<Alert.Description>
											App đang tạo host profile và chọn đúng workspace tiếp theo.
										</Alert.Description>
									</Alert.Content>
								</Alert>
							) : null}

							<ItemCardGroup className="admin-auth-checklist" variant="transparent">
								{authCommandRows.map((item) => {
									const Icon = item.icon;

									return (
										<ItemCard className="items-start" key={item.title} variant="transparent">
											<ItemCard.Icon
												className={
													item.color === "success"
														? "text-success"
														: item.color === "accent"
															? "text-accent"
															: "text-muted"
												}
											>
												<Icon aria-hidden="true" size={18} strokeWidth={2} />
											</ItemCard.Icon>
											<ItemCard.Content>
												<ItemCard.Title>{item.title}</ItemCard.Title>
												<ItemCard.Description className="hidden whitespace-normal sm:line-clamp-2 sm:block">
													{item.description}
												</ItemCard.Description>
											</ItemCard.Content>
											<ItemCard.Action>
												<Chip color={item.color} size="sm" variant="soft">
													{item.chip}
												</Chip>
											</ItemCard.Action>
										</ItemCard>
									);
								})}
							</ItemCardGroup>

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
										{isPending ? "Đang hoàn tất Google OAuth" : "Tiếp tục với Google"}
									</>
								)}
							</Button>
						</Widget.Content>
					</Widget>
				</div>

				<section className="grid gap-4">
					<Widget>
						<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
							<div>
								<Widget.Title>Workspace path</Widget.Title>
								<Widget.Description>
									Flow chuẩn sau khi host xác thực thành công.
								</Widget.Description>
							</div>
							<Chip color="success" variant="soft">
								SaaS ready
							</Chip>
						</Widget.Header>
						<Widget.Content>
							<AuthFlowStepper currentStep={authStep} />
						</Widget.Content>
					</Widget>

					<Widget>
						<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
							<div>
								<Widget.Title>Operations surface</Widget.Title>
								<Widget.Description>
									Các workspace module mở ra sau khi đăng nhập.
								</Widget.Description>
							</div>
							<Chip variant="soft">{authFeatureItems.length} modules</Chip>
						</Widget.Header>
						<Widget.Content>
							<ItemCardGroup
								className="admin-card-grid--feature"
								layout="grid"
								variant="secondary"
							>
								{authFeatureItems.map((item) => {
									const Icon = item.icon;

									return (
										<ItemCard className="items-start" key={item.label} variant="secondary">
											<ItemCard.Icon>
												<Icon aria-hidden="true" size={18} strokeWidth={2} />
											</ItemCard.Icon>
											<ItemCard.Content>
												<ItemCard.Title>{item.label}</ItemCard.Title>
												<ItemCard.Description className="hidden whitespace-normal sm:block">
													{item.text}
												</ItemCard.Description>
											</ItemCard.Content>
										</ItemCard>
									);
								})}
							</ItemCardGroup>
						</Widget.Content>
					</Widget>
				</section>
			</div>
		</main>
	);
}

function AuthFlowStepper({ currentStep }: { currentStep: number }) {
	return (
		<Stepper currentStep={currentStep} orientation="vertical" size="sm">
			{authFlowSteps.map((step) => {
				const Icon = step.icon;

				return (
					<Stepper.Step key={step.title}>
						<Stepper.Indicator>
							<Stepper.Icon>
								<Icon aria-hidden="true" size={14} strokeWidth={2} />
							</Stepper.Icon>
						</Stepper.Indicator>
						<Stepper.Content>
							<Stepper.Title>{step.title}</Stepper.Title>
							<Stepper.Description>{step.description}</Stepper.Description>
						</Stepper.Content>
						<Stepper.Separator />
					</Stepper.Step>
				);
			})}
		</Stepper>
	);
}
