"use client";

import { useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Alert, Button, Chip, ProgressCircle, Spinner } from "@heroui/react";
import { ItemCard, ItemCardGroup, Stepper, Widget } from "@heroui-pro/react";
import { useNavigate } from "@tanstack/react-router";
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

const authFeatureItems = [
	{
		icon: Gift,
		label: "Chiến dịch",
		text: "Nhận diện, mẫu trò chơi và tài sản",
	},
	{
		icon: MonitorPlay,
		label: "Vận hành lượt chơi",
		text: "Chế độ trạm và liên kết chơi công khai",
	},
	{
		icon: BarChart3,
		label: "Phân tích",
		text: "Hiệu quả, lượt nhận thưởng và kênh",
	},
];

const authFlowSteps = [
	{
		description: "Google OAuth tạo hồ sơ host cho không gian làm việc.",
		icon: ShieldCheck,
		title: "Xác thực",
	},
	{
		description: "Cấu hình kho phần thưởng theo chiến dịch và Host PIN.",
		icon: FileText,
		title: "Thiết lập",
	},
	{
		description: "Chọn mẫu trò chơi, nội dung, tài sản và gói dịch vụ.",
		icon: Link2,
		title: "Campaign Studio",
	},
	{
		description: "Vận hành trạm hoặc chia sẻ liên kết chơi, sau đó theo dõi kết quả.",
		icon: MonitorPlay,
		title: "Vận hành",
	},
];

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
	const authStep = currentUser ? 2 : isCompletingOAuth ? 1 : 0;
	const authCommandRows = [
		{
			icon: ShieldCheck,
			title: "Google OAuth",
			description: isAuthenticated
				? "Phiên Google đã được xác thực."
				: "Yêu cầu host xác thực trước khi vào không gian làm việc.",
			chip: isAuthenticated ? "Đã kết nối" : "Bắt buộc",
			color: isAuthenticated ? "success" : "accent",
		},
		{
			icon: FileText,
			title: "Hồ sơ host",
			description: currentUser
				? "Hồ sơ host đã sẵn sàng."
				: isCompletingOAuth
					? "Đang tạo hoặc đồng bộ hồ sơ host."
					: "Sẽ được tạo sau OAuth.",
			chip: currentUser ? "Sẵn sàng" : isCompletingOAuth ? "Đang đồng bộ" : "Chờ xử lý",
			color: currentUser ? "success" : isCompletingOAuth ? "accent" : "default",
		},
		{
			icon: Link2,
			title: "Trang tiếp theo",
			description: "Đi tới phần thiết lập hoặc Campaign Studio tùy trạng thái không gian làm việc.",
			chip: currentUser ? "Đang chuyển" : "Được bảo vệ",
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
		<main className="grid min-h-dvh items-start justify-items-center bg-background px-4 pb-10 pt-8 text-foreground sm:px-6 sm:pt-10 lg:px-8 lg:pt-14">
			<div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[430px_minmax(0,1fr)] lg:items-start">
				<div className="grid gap-4">
					<div className="flex min-w-0 items-start gap-4">
						<span className="mt-1 grid size-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-accent">
							<Gift aria-hidden="true" size={20} strokeWidth={2} />
						</span>
						<div className="min-w-0">
							<Chip color="accent" variant="soft">
								Nền tảng trò chơi marketing
							</Chip>
							<h1 className="mt-4 text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
								Campaign Game Studio
							</h1>
							<p className="mt-3 max-w-md text-sm leading-6 text-muted">
								Không gian làm việc cho trò chơi chiến dịch có thương hiệu, vận hành phần thưởng,
								liên kết chơi công khai và kích hoạt tại trạm.
							</p>
						</div>
					</div>
					<Widget>
						<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
							<div>
								<Widget.Title>Đăng nhập dành cho host</Widget.Title>
								<Widget.Description>
									Mở Campaign Studio bằng Google OAuth.
								</Widget.Description>
							</div>
							<Chip color="accent" variant="soft">
								Bảo mật
							</Chip>
						</Widget.Header>
							<Widget.Content className="gap-5">
								<div className="flex items-center gap-4">
									{authProgress > 0 ? (
										<ProgressCircle
											aria-label="Tiến độ xác thực"
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
											{authReadyCount}/{authCommandRows.length} sẵn sàng
										</Chip>
									</div>
									<p className="mt-1 text-sm leading-6 text-muted">
									Mức độ sẵn sàng của OAuth, hồ sơ host và điều hướng.
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
											Hệ thống đang tạo hồ sơ host và chọn trang tiếp theo.
										</Alert.Description>
									</Alert.Content>
								</Alert>
							) : null}

							<ItemCardGroup aria-label="Trạng thái đăng nhập" className="admin-auth-checklist" variant="transparent">
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
								<Widget.Title>Luồng làm việc</Widget.Title>
								<Widget.Description>
									Luồng mặc định sau khi host đăng nhập.
								</Widget.Description>
							</div>
							<Chip color="success" variant="soft">
								Sẵn sàng
							</Chip>
						</Widget.Header>
						<Widget.Content>
							<AuthFlowStepper currentStep={authStep} />
						</Widget.Content>
					</Widget>

					<Widget>
						<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
							<div>
								<Widget.Title>Khu vực vận hành</Widget.Title>
								<Widget.Description>
									Các mô-đun có sẵn sau khi đăng nhập.
								</Widget.Description>
							</div>
							<Chip variant="soft">{authFeatureItems.length} mô-đun</Chip>
						</Widget.Header>
						<Widget.Content>
							<ItemCardGroup
								aria-label="Các mô-đun trong không gian làm việc"
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
		<>
			<ol aria-label="Tiến độ đăng nhập" className="sr-only">
				{authFlowSteps.map((step, index) => (
					<li aria-current={index === currentStep ? "step" : undefined} key={step.title}>
						{step.title}: {step.description}
					</li>
				))}
			</ol>
			<Stepper aria-hidden="true" currentStep={currentStep} orientation="vertical" size="sm">
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
		</>
	);
}
