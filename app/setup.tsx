"use client";

import { useEffect, useMemo, useState } from "react";
import {
	Alert,
	Button,
	Chip,
	CloseButton,
	Description,
	Label,
	NumberField,
	ProgressBar,
	ProgressCircle,
} from "@heroui/react";
import {
	ItemCard,
	ItemCardGroup,
	KPI,
	KPIGroup,
	NativeSelect,
	NumberStepper,
	NumberValue,
	Widget,
} from "@heroui-pro/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ClipboardCheck,
	LockKeyhole,
	Plus,
	Save,
	ShieldCheck,
	WalletCards,
} from "lucide-react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import OtpPinInput from "@/app/components/OtpPinInput";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { PIN_LENGTH, RARITY_LABELS, RARITY_VALUES, Rarity } from "@/lib/lixiPolicy";
import { useHostLogout } from "@/lib/useHostLogout";
import { useOwnerSession } from "@/lib/useOwnerSession";
import adminCss from "./styles/admin.css?url";

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

function getNumberFieldValue(value: string) {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
}

export const Route = createFileRoute("/setup")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
	}),
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const configureBudget = useMutation(api.setup.configureBudget);
	const setHostPinMutation = useMutation(api.auth.setHostPin);
	const owner = useOwnerSession();
	const logout = useHostLogout();

	const [rows, setRows] = useState<BudgetRow[]>([
		createBudgetRow({ amount: "100000", quantity: "15", rarity: "common" }),
		createBudgetRow({ amount: "200000", quantity: "20", rarity: "legend" }),
	]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [info, setInfo] = useState("");
	const [hostPin, setHostPin] = useState("");
	const [selectedCampaignId, setSelectedCampaignId] =
		useState<Id<"campaigns"> | undefined>();

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	const ownerName = owner?.username ?? "";

	const setupState = useQuery(
		api.setup.getSetupState,
		owner ? (selectedCampaignId ? { campaignId: selectedCampaignId } : {}) : "skip",
	);

	useEffect(() => {
		const scopedCampaignId = setupState?.budgetScope.campaignId;
		if (!selectedCampaignId && scopedCampaignId) {
			setSelectedCampaignId(scopedCampaignId);
		}
	}, [selectedCampaignId, setupState?.budgetScope.campaignId]);

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
				}),
			),
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
	const estimatedEnvelopeCount = useMemo(() => {
		return rows.reduce((sum, row) => {
			const quantity = Number(row.quantity);
			return Number.isInteger(quantity) && quantity > 0 ? sum + quantity : sum;
		}, 0);
	}, [rows]);
	const highestRewardTier = useMemo(() => {
		return rows.reduce<BudgetRow | null>((highest, row) => {
			const amount = Number(row.amount);
			if (!Number.isInteger(amount) || amount <= 0) {
				return highest;
			}
			if (!highest || amount > Number(highest.amount)) {
				return row;
			}
			return highest;
		}, null);
	}, [rows]);
	const averageEnvelopeValue =
		estimatedEnvelopeCount > 0
			? Math.round(estimatedTotalBudget / estimatedEnvelopeCount)
			: 0;

	const handleLogout = async () => {
		await logout();
		void navigate({ to: "/auth", replace: true });
	};

	const handleSubmit = async () => {
		if (!owner || !setupState) {
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
				campaignId: selectedCampaignId ?? setupState.budgetScope.campaignId,
				hostPin: setupState.hasHostPin ? undefined : hostPin,
				items: payload,
			});

			setInfo("Đã cấu hình ngân sách thành công.");
			void navigate({ to: "/campaigns", replace: true });
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể lưu cấu hình",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleSetHostPin = async () => {
		if (owner?.authSource !== "convexAuth") {
			setError("Cần đăng nhập bằng Google để thiết lập PIN host.");
			return;
		}

		setError("");
		setInfo("");
		setSubmitting(true);

		try {
			await setHostPinMutation({ pin: hostPin });
			setHostPin("");
			setInfo("Đã thiết lập PIN host.");
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể thiết lập PIN host",
			);
		} finally {
			setSubmitting(false);
		}
	};

	if (owner === undefined || setupState === undefined) {
		return (
			<AdminRouteStatus
				contractText="Loading setup"
				description="Đang kiểm tra host, reward inventory và trạng thái PIN vận hành."
				title="Đang tải Budget Setup"
			/>
		);
	}

	const hasSetup = setupState.hasSetup;
	const selectedCampaignName =
		setupState.selectedCampaign?.name ??
		setupState.campaigns.find((campaign) => campaign.id === selectedCampaignId)?.name ??
		"Default campaign";
	const canSaveBudget =
		!submitting && (setupState.hasHostPin || hostPin.length === PIN_LENGTH);
	const canSaveHostPin =
		!submitting &&
		!setupState.hasHostPin &&
		hostPin.length === PIN_LENGTH &&
		owner?.authSource === "convexAuth";
	const hostPinCompletion = (hostPin.length / PIN_LENGTH) * 100;
	const setupReadinessRows = [
		{
			icon: WalletCards,
			title: "Reward inventory",
			description: hasSetup
				? "Budget inventory đã được cấu hình cho station."
				: "Cần lưu inventory trước khi vận hành campaign.",
			chip: hasSetup ? "Configured" : "Draft",
			color: hasSetup ? "success" : "warning",
		},
		{
			icon: ShieldCheck,
			title: "Host PIN",
			description: setupState.hasHostPin
				? "PIN vận hành đã sẵn sàng cho trạm rút."
				: "Cần thiết lập PIN để host tạo lượt rút.",
			chip: setupState.hasHostPin ? "Ready" : "Pending",
			color: setupState.hasHostPin ? "success" : "warning",
		},
		{
			icon: LockKeyhole,
			title: "Edit lock",
			description: setupState.canConfigure
				? "Inventory hiện có thể chỉnh sửa an toàn."
				: "Inventory đang khóa để bảo toàn lịch sử lượt rút.",
			chip: setupState.canConfigure ? "Editable" : "Locked",
			color: setupState.canConfigure ? "success" : "default",
		},
	] as const;
	const setupReadyCount = setupReadinessRows.filter(
		(row) => row.color === "success",
	).length;
	const setupProgress = Math.round(
		(setupReadyCount / setupReadinessRows.length) * 100,
	);
	const setupFeedback = error || info;
	const nextSetupReadinessRow =
		setupReadinessRows.find((row) => row.color !== "success") ??
		setupReadinessRows[0];
	const inventorySummaryRows = [
		{
			icon: WalletCards,
			title: "Envelope pool",
			description: "Tổng số lượt rút dự kiến trong inventory.",
			value: estimatedEnvelopeCount,
			valueProps: { maximumFractionDigits: 0 },
			suffix: "envelopes",
			chip: `${rows.length} tiers`,
		},
		{
			icon: ClipboardCheck,
			title: "Average value",
			description: "Giá trị trung bình mỗi envelope theo draft hiện tại.",
			value: averageEnvelopeValue,
			valueProps: {
				currency: "VND",
				maximumFractionDigits: 0,
				style: "currency",
			},
			suffix: "",
			chip: "Per draw",
		},
		{
			icon: ShieldCheck,
			title: "Highest tier",
			description: highestRewardTier
				? RARITY_LABELS[highestRewardTier.rarity]
				: "Chưa có mệnh giá hợp lệ.",
			value: highestRewardTier ? Number(highestRewardTier.amount) : 0,
			valueProps: {
				currency: "VND",
				maximumFractionDigits: 0,
				style: "currency",
			},
			suffix: "",
			chip: highestRewardTier ? "Top prize" : "Missing",
		},
	] as const;
	const setupContextPanel = (
		<div className="admin-aside">
			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Operational Guard</Widget.Title>
						<Widget.Description>Host PIN cho thao tác tại trạm.</Widget.Description>
					</div>
					<Chip color={setupState.hasHostPin ? "success" : "default"} variant="soft">
						{setupState.hasHostPin ? "Ready" : "Pending"}
					</Chip>
				</Widget.Header>
				<Widget.Content className="gap-4">
					{!setupState.hasHostPin ? (
						<>
							<div>
								<Label className="block">Host PIN ({PIN_LENGTH} digits)</Label>
								<p className="mt-1 text-sm text-muted">
									PIN này xác nhận khi host tạo lượt rút tại trạm.
								</p>
							</div>
							<OtpPinInput
								disabled={submitting}
								length={PIN_LENGTH}
								value={hostPin}
								variant="admin"
								onChange={setHostPin}
							/>
							<div className="grid gap-2">
								<div className="flex items-center justify-between gap-3 text-xs text-muted">
									<span>PIN completion</span>
									<span className="tabular-nums">
										{hostPin.length}/{PIN_LENGTH}
									</span>
								</div>
								<ProgressBar
									aria-label="Host PIN completion"
									color="accent"
									value={hostPinCompletion}
								>
									<ProgressBar.Track>
										<ProgressBar.Fill />
									</ProgressBar.Track>
								</ProgressBar>
							</div>
							{hasSetup && !setupState.canConfigure ? (
								<Button
									isDisabled={!canSaveHostPin}
									isPending={submitting}
									type="button"
									onPress={() => void handleSetHostPin()}
								>
									<ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
									Lưu PIN host
								</Button>
							) : null}
						</>
					) : (
						<ItemCard variant="secondary">
							<ItemCard.Icon>
								<ShieldCheck aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>PIN host đã sẵn sàng</ItemCard.Title>
								<ItemCard.Description>
									Các phiên station có thể dùng PIN vận hành để tạo lượt rút.
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip color="success" size="sm" variant="soft">
									Ready
								</Chip>
							</ItemCard.Action>
						</ItemCard>
					)}
				</Widget.Content>
			</Widget>
		</div>
	);

	return (
		<AdminPageShell
			actions={
				<Button
					type="button"
					variant="outline"
					onPress={() => void navigate({ to: "/campaigns" })}
				>
					<ClipboardCheck aria-hidden="true" size={16} strokeWidth={2} />
					Campaign Studio
				</Button>
			}
			description="Configure the reward inventory and operational host PIN used by station sessions."
			eyebrow="Workspace Setup"
			onLogout={handleLogout}
			ownerUsername={ownerName}
			aside={setupContextPanel}
			title="Budget Setup"
		>
			<KPIGroup className="admin-kpi-strip">
				<KPI>
					<KPI.Header>
						<KPI.Title>Estimated Budget</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value
							currency="VND"
							maximumFractionDigits={0}
							style="currency"
							value={estimatedTotalBudget}
						/>
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Configured Budget</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value
							currency="VND"
							maximumFractionDigits={0}
							style="currency"
							value={setupState.budget?.totalBudget ?? 0}
						/>
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Remaining</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value
							currency="VND"
							maximumFractionDigits={0}
							style="currency"
							value={setupState.budget?.remainingBudget ?? 0}
						/>
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Host PIN</KPI.Title>
						<KPI.Trend trend={setupState.hasHostPin ? "up" : "neutral"}>
							{setupState.hasHostPin ? "ready" : "pending"}
						</KPI.Trend>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value
							maximumFractionDigits={0}
							value={setupState.hasHostPin ? PIN_LENGTH : hostPin.length}
						>
							{(formatted) =>
								setupState.hasHostPin ? "Ready" : `${formatted}/${PIN_LENGTH}`
							}
						</KPI.Value>
					</KPI.Content>
				</KPI>
			</KPIGroup>

			{setupFeedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{setupFeedback}</Alert.Title>
						<Alert.Description>
							{error
								? "Kiểm tra lại PIN host, mệnh giá và số lượng trước khi lưu."
								: "Budget Setup đã cập nhật và station có thể đọc trạng thái mới."}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			) : null}

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Setup command</Widget.Title>
						<Widget.Description>
							Trạng thái vận hành cho budget scope của campaign đang chọn.
						</Widget.Description>
					</div>
					<Chip
						color={setupProgress === 100 ? "success" : "warning"}
						variant="soft"
					>
						{setupProgress === 100 ? "Ready" : "Needs setup"}
					</Chip>
				</Widget.Header>
				<Widget.Content className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
					<ItemCardGroup
						className="admin-card-grid--three"
						layout="grid"
						variant="secondary"
					>
						{setupReadinessRows.map((row) => (
							<ItemCard className="items-start" key={row.title} variant="secondary">
								<ItemCard.Icon
									className={
										row.color === "success"
											? "text-success"
											: row.color === "warning"
												? "text-warning"
												: "text-muted"
									}
								>
									<row.icon
										aria-hidden="true"
										size={18}
										strokeWidth={2}
									/>
								</ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>{row.title}</ItemCard.Title>
									<ItemCard.Description className="line-clamp-2 whitespace-normal">
										{row.description}
									</ItemCard.Description>
								</ItemCard.Content>
								<ItemCard.Action>
									<Chip color={row.color} size="sm" variant="soft">
										{row.chip}
									</Chip>
								</ItemCard.Action>
							</ItemCard>
						))}
					</ItemCardGroup>
					<div className="admin-command-summary">
						{setupState.campaigns.length > 0 ? (
							<NativeSelect fullWidth variant="secondary">
								<Label>Campaign budget scope</Label>
								<NativeSelect.Trigger
									value={selectedCampaignId ?? setupState.budgetScope.campaignId ?? ""}
									onChange={(event) => {
										const campaignId = event.currentTarget.value;
										setSelectedCampaignId(
											campaignId ? (campaignId as Id<"campaigns">) : undefined,
										);
										setError("");
										setInfo("");
									}}
								>
									{setupState.campaigns.map((campaign) => (
										<NativeSelect.Option key={campaign.id} value={campaign.id}>
											{campaign.name} ·{" "}
											{campaign.status === "active" ? "Active" : "Draft"}
										</NativeSelect.Option>
									))}
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
								<Description>
									Inventory được lưu riêng cho campaign đã chọn.
								</Description>
							</NativeSelect>
						) : (
							<ItemCard variant="secondary">
								<ItemCard.Icon>
									<ClipboardCheck aria-hidden="true" size={18} strokeWidth={2} />
								</ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>Default campaign</ItemCard.Title>
									<ItemCard.Description>
										Lưu budget sẽ tạo campaign mặc định đầu tiên.
									</ItemCard.Description>
								</ItemCard.Content>
							</ItemCard>
						)}
						<div className="flex items-center gap-4">
							<ProgressCircle
								aria-label="Workspace setup progress"
								color={setupProgress === 100 ? "success" : "accent"}
								value={setupProgress}
							>
								<ProgressCircle.Track>
									<ProgressCircle.TrackCircle />
									<ProgressCircle.FillCircle />
								</ProgressCircle.Track>
							</ProgressCircle>
							<div className="min-w-0">
								<div className="flex items-baseline gap-2">
									<NumberValue
										className="text-2xl font-semibold tabular-nums text-foreground"
										maximumFractionDigits={0}
										value={setupProgress}
									>
										<NumberValue.Suffix>
											<span className="ml-0.5 text-sm font-medium text-muted">%</span>
										</NumberValue.Suffix>
									</NumberValue>
									<Chip
										color={setupProgress === 100 ? "success" : "warning"}
										size="sm"
										variant="soft"
									>
										{setupReadyCount}/{setupReadinessRows.length}
									</Chip>
								</div>
								<p className="mt-1 text-xs leading-5 text-muted">
									Operational readiness across inventory, PIN, and edit lock.
								</p>
							</div>
						</div>
						<div className="admin-command-summary__note">
							<p className="admin-command-summary__note-label">
								{setupProgress === 100 ? "Ready for station" : "Next setup"}
							</p>
							<div className="admin-command-summary__note-header">
								<p className="admin-command-summary__note-title">
									{nextSetupReadinessRow.title}
								</p>
								<Chip color={nextSetupReadinessRow.color} size="sm" variant="soft">
									{nextSetupReadinessRow.chip}
								</Chip>
							</div>
							<p className="admin-command-summary__note-copy line-clamp-2">
								{nextSetupReadinessRow.description}
							</p>
						</div>
						<div className="admin-command-summary__metric-list">
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Budget campaign</span>
								<span className="truncate font-medium text-foreground">
									{selectedCampaignName}
								</span>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Reward rows</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									value={rows.length}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Estimated budget</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									currency="VND"
									maximumFractionDigits={0}
									style="currency"
									value={estimatedTotalBudget}
								/>
							</div>
						</div>
					</div>
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Reward Inventory</Widget.Title>
						<Widget.Description>
							Cấu hình mệnh giá, số lượng và độ hiếm cho mỗi envelope.
						</Widget.Description>
					</div>
					<Chip size="sm" variant="soft">
						{rows.length} tiers
					</Chip>
				</Widget.Header>
				<Widget.Content className="gap-5">
					<ItemCardGroup
						className="admin-card-grid--three"
						layout="grid"
						variant="secondary"
					>
						{inventorySummaryRows.map((row) => (
							<ItemCard className="items-start" key={row.title} variant="secondary">
								<ItemCard.Icon>
									<row.icon aria-hidden="true" size={18} strokeWidth={2} />
								</ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Description>{row.title}</ItemCard.Description>
									<ItemCard.Title>
										<NumberValue
											className="tabular-nums"
											value={row.value}
											{...row.valueProps}
										/>
										{row.suffix ? (
											<span className="ml-1 text-xs font-medium text-muted">
												{row.suffix}
											</span>
										) : null}
									</ItemCard.Title>
									<ItemCard.Description className="line-clamp-2 whitespace-normal">
										{row.description}
									</ItemCard.Description>
								</ItemCard.Content>
								<ItemCard.Action>
									<Chip size="sm" variant="soft">
										{row.chip}
									</Chip>
								</ItemCard.Action>
							</ItemCard>
						))}
					</ItemCardGroup>

					{hasSetup && !setupState.canConfigure ? (
						<>
							<Alert status="warning">
								<Alert.Indicator />
								<Alert.Content>
									<Alert.Title>Budget locked</Alert.Title>
									<Alert.Description>
										Đã có lượt rút đang chờ hoặc đã phát sinh nên cấu hình ngân
										sách bị khóa để bảo toàn lịch sử.
									</Alert.Description>
								</Alert.Content>
							</Alert>
							<ItemCardGroup className="admin-card-grid--two" layout="grid" variant="secondary">
								<ItemCard variant="secondary">
									<ItemCard.Icon>
										<WalletCards aria-hidden="true" size={18} strokeWidth={2} />
									</ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>Configured budget</ItemCard.Title>
										<ItemCard.Description>
											<NumberValue
												className="tabular-nums"
												currency="VND"
												maximumFractionDigits={0}
												style="currency"
												value={setupState.budget?.totalBudget ?? 0}
											/>
										</ItemCard.Description>
									</ItemCard.Content>
								</ItemCard>
								<ItemCard variant="secondary">
									<ItemCard.Icon>
										<ShieldCheck aria-hidden="true" size={18} strokeWidth={2} />
									</ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>Operational state</ItemCard.Title>
										<ItemCard.Description>
											Inventory đã khóa, station có thể tiếp tục vận hành.
										</ItemCard.Description>
									</ItemCard.Content>
									<ItemCard.Action>
										<Button
											size="sm"
											type="button"
											variant="outline"
											onPress={() => void navigate({ to: "/campaigns" })}
										>
											Campaign Studio
										</Button>
									</ItemCard.Action>
								</ItemCard>
							</ItemCardGroup>
						</>
					) : (
						<>
							<ItemCardGroup variant="secondary">
								{rows.map((row, index) => {
									const amount = getNumberFieldValue(row.amount);
									const quantity = getNumberFieldValue(row.quantity);
									const subtotal = amount && quantity ? amount * quantity : 0;

									return (
										<ItemCard className="items-start" key={row.id} variant="secondary">
											<ItemCard.Content className="min-w-0 gap-4">
												<div className="flex flex-wrap items-start justify-between gap-4">
													<div className="min-w-0">
														<ItemCard.Title>Envelope tier {index + 1}</ItemCard.Title>
														<ItemCard.Description>
															Subtotal updates from amount and quantity.
														</ItemCard.Description>
													</div>
													<div className="flex min-w-0 items-start gap-3">
														<div className="min-w-24 text-right">
															<p className="text-xs text-muted">Tạm tính</p>
															<NumberValue
																className="text-sm font-medium tabular-nums text-foreground"
																currency="VND"
																maximumFractionDigits={0}
																style="currency"
																value={subtotal}
															/>
														</div>
														<CloseButton
															aria-label={`Xóa envelope tier ${index + 1}`}
															isDisabled={rows.length <= 1}
															onPress={() =>
																setRows((current) =>
																	current.filter((item) => item.id !== row.id),
																)
															}
														/>
													</div>
												</div>
												<div className="grid items-end gap-3 lg:grid-cols-[minmax(180px,1fr)_auto_minmax(150px,0.8fr)]">
													<NumberField
														fullWidth
														aria-label={`Mệnh giá tier ${index + 1}`}
														minValue={1}
														value={amount}
														variant="secondary"
														onChange={(value) => {
															setRows((current) =>
																current.map((item) =>
																	item.id === row.id
																		? { ...item, amount: value ? String(value) : "" }
																		: item,
																),
															);
														}}
													>
														<Label>Mệnh giá</Label>
														<NumberField.Group>
															<NumberField.DecrementButton />
															<NumberField.Input className="w-full tabular-nums" />
															<NumberField.IncrementButton />
														</NumberField.Group>
													</NumberField>
													<NumberStepper
														aria-label={`Số lượng tier ${index + 1}`}
														className="flex-col items-start gap-1.5"
														minValue={1}
														value={quantity ?? 1}
														onChange={(value) => {
															setRows((current) =>
																current.map((item) =>
																	item.id === row.id
																		? { ...item, quantity: String(value ?? 1) }
																		: item,
																),
															);
														}}
													>
														<Label>Số lượng</Label>
														<NumberStepper.Group>
															<NumberStepper.DecrementButton />
															<NumberStepper.Value />
															<NumberStepper.IncrementButton />
														</NumberStepper.Group>
													</NumberStepper>
													<NativeSelect fullWidth variant="secondary">
														<Label>Độ hiếm</Label>
														<NativeSelect.Trigger
															aria-label={`Độ hiếm tier ${index + 1}`}
															value={row.rarity}
															onChange={(event) => {
																const rarity = event.currentTarget.value as Rarity;
																setRows((current) =>
																	current.map((item) =>
																		item.id === row.id ? { ...item, rarity } : item,
																	),
																);
															}}
														>
															{RARITY_VALUES.map((rarity) => (
																<NativeSelect.Option key={rarity} value={rarity}>
																	{RARITY_LABELS[rarity]}
																</NativeSelect.Option>
															))}
															<NativeSelect.Indicator />
														</NativeSelect.Trigger>
														<Description>Ảnh hưởng nhãn hiển thị trong kết quả.</Description>
													</NativeSelect>
												</div>
											</ItemCard.Content>
										</ItemCard>
									);
								})}
							</ItemCardGroup>

							<div className="flex flex-wrap items-center justify-between gap-3">
								<Button
									type="button"
									variant="outline"
									onPress={() =>
										setRows((current) => [
											...current,
											createBudgetRow({ quantity: "1" }),
										])
									}
								>
									<Plus aria-hidden="true" size={16} strokeWidth={2} />
									Thêm mệnh giá
								</Button>

								<div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm tabular-nums text-muted">
									<span>
										{estimatedEnvelopeCount.toLocaleString("vi-VN")} envelopes
									</span>
									<span>
										Tổng dự kiến:{" "}
										<NumberValue
											currency="VND"
											maximumFractionDigits={0}
											style="currency"
											value={estimatedTotalBudget}
										/>
									</span>
								</div>
							</div>
						</>
					)}

					{!hasSetup || setupState.canConfigure ? (
						<Button
							fullWidth
							isDisabled={!canSaveBudget}
							isPending={submitting}
							type="button"
							onPress={handleSubmit}
						>
							<Save aria-hidden="true" size={16} strokeWidth={2} />
							Lưu cấu hình ngân sách
						</Button>
					) : null}
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
