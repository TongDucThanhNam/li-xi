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
	ProgressCircle,
} from "@heroui/react";
import {
	EmptyState,
	ItemCard,
	ItemCardGroup,
	KPI,
	KPIGroup,
	NativeSelect,
	NumberStepper,
	NumberValue,
	Widget,
} from "@heroui-pro/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ClipboardCheck,
	FileQuestion,
	LockKeyhole,
	Plus,
	Save,
	ShieldCheck,
	WalletCards,
} from "lucide-react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { RewardInventoryPanel } from "@/app/_workspace/-features/RewardInventoryPanel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RARITY_LABELS, RARITY_VALUES, Rarity } from "@/lib/lixiPolicy";
import { useOwnerSession } from "@/lib/useOwnerSession";

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

export function RewardsSetupFeature({
	campaignId,
}: {
	campaignId: Id<"campaigns">;
}) {
	const navigate = useNavigate();
	const configureBudget = useMutation(api.setup.configureBudget);
	const owner = useOwnerSession();
	const campaign = useQuery(api.campaigns.getCampaignRouteContext, {
		campaignId,
	});

	const [rows, setRows] = useState<BudgetRow[]>([
		createBudgetRow({ amount: "100000", quantity: "15", rarity: "common" }),
		createBudgetRow({ amount: "200000", quantity: "20", rarity: "legend" }),
	]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [info, setInfo] = useState("");

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	const setupState = useQuery(
		api.setup.getSetupState,
		owner && campaign ? { campaignId } : "skip",
	);

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
					throw new Error("Số lượng phải là số nguyên dương");
				}

				return {
					amount,
					quantity,
					rarity: row.rarity,
				};
			});

			await configureBudget({
				campaignId,
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

	if (
		owner === undefined ||
		campaign === undefined ||
		(owner && campaign && setupState === undefined)
	) {
		return (
			<AdminRouteStatus
				contractText="Đang tải kho phần thưởng"
				description="Đang kiểm tra host, kho phần thưởng và trạng thái PIN vận hành."
				title="Đang tải kho phần thưởng"
			/>
		);
	}
	if (!campaign) {
		return (
			<AdminPageShell title="Không tìm thấy chiến dịch">
				<EmptyState>
					<EmptyState.Header>
						<EmptyState.Media variant="icon">
							<FileQuestion aria-hidden="true" />
						</EmptyState.Media>
						<EmptyState.Title>Không thể mở kho phần thưởng</EmptyState.Title>
						<EmptyState.Description>
							Chiến dịch không tồn tại hoặc bạn không có quyền truy cập.
						</EmptyState.Description>
					</EmptyState.Header>
					<EmptyState.Content>
						<Link to="/campaigns">Quay lại danh sách chiến dịch</Link>
					</EmptyState.Content>
				</EmptyState>
			</AdminPageShell>
		);
	}
	if (!owner || !setupState) {
		return (
			<AdminRouteStatus
				contractText="Đang xác minh quyền truy cập"
				description="Đang xác minh tài khoản trước khi mở kho phần thưởng."
				title="Đang mở kho phần thưởng"
			/>
		);
	}

	const hasSetup = setupState.hasSetup;
	const selectedCampaignName = campaign.name;
	const canSaveBudget = !submitting;
	const setupReadinessRows = [
		{
			icon: WalletCards,
			title: "Kho phần thưởng",
			description: hasSetup
				? "Kho phần thưởng đã sẵn sàng cho chiến dịch."
				: "Lưu kho trước khi vận hành chiến dịch.",
			chip: hasSetup ? "Đã cấu hình" : "Bản nháp",
			color: hasSetup ? "success" : "warning",
		},
		{
			icon: LockKeyhole,
			title: "Khóa chỉnh sửa",
			description: setupState.canConfigure
				? "Có thể chỉnh sửa kho an toàn."
				: "Kho đã khóa để bảo toàn lịch sử chơi.",
			chip: setupState.canConfigure ? "Có thể sửa" : "Đã khóa",
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
			title: "Tổng phần thưởng",
			description: "Số kết quả phần thưởng có trong kho hiện tại.",
			value: estimatedEnvelopeCount,
			valueProps: { maximumFractionDigits: 0 },
			suffix: "lượt",
			chip: `${rows.length} mức`,
		},
		{
			icon: ClipboardCheck,
			title: "Giá trị trung bình",
			description: "Giá trị trung bình của mỗi kết quả trong bản nháp.",
			value: averageEnvelopeValue,
			valueProps: {
				currency: "VND",
				maximumFractionDigits: 0,
				style: "currency",
			},
			suffix: "",
			chip: "Mỗi lượt",
		},
		{
			icon: ShieldCheck,
			title: "Mức cao nhất",
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
			chip: highestRewardTier ? "Giải cao nhất" : "Chưa có",
		},
	] as const;
	return (
		<AdminPageShell
			actions={
				<Link
					className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
					to="/campaigns"
				>
					<ClipboardCheck aria-hidden="true" size={16} strokeWidth={2} />
					Campaign Studio
				</Link>
			}
			breadcrumbContext={selectedCampaignName}
			description="Cấu hình ngân sách và tồn kho phần thưởng riêng cho chiến dịch."
			eyebrow="Phần thưởng chiến dịch"
			title="Kho phần thưởng"
		>
			<CampaignContextNav campaignId={campaignId} />
			<KPIGroup className="admin-kpi-strip">
				<KPI>
					<KPI.Header>
						<KPI.Title>Ngân sách dự kiến</KPI.Title>
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
						<KPI.Title>Ngân sách đã cấu hình</KPI.Title>
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
						<KPI.Title>Còn lại</KPI.Title>
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
			</KPIGroup>

			{setupFeedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{setupFeedback}</Alert.Title>
						<Alert.Description>
							{error
								? "Kiểm tra lại mệnh giá và số lượng trước khi lưu."
								: "Kho phần thưởng đã được cập nhật."}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			) : null}

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Trạng thái cấu hình</Widget.Title>
						<Widget.Description>
							Mức độ sẵn sàng của kho phần thưởng trong chiến dịch đã chọn.
						</Widget.Description>
					</div>
					<Chip
						color={setupProgress === 100 ? "success" : "warning"}
						variant="soft"
					>
						{setupProgress === 100 ? "Sẵn sàng" : "Cần cấu hình"}
					</Chip>
				</Widget.Header>
				<Widget.Content className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
					<ItemCardGroup
						aria-label="Mức độ sẵn sàng của kho phần thưởng"
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
						{setupState.campaigns.length === 0 ? (
							<ItemCard variant="secondary">
								<ItemCard.Icon>
									<ClipboardCheck aria-hidden="true" size={18} strokeWidth={2} />
								</ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>Chiến dịch mặc định</ItemCard.Title>
									<ItemCard.Description>
										Lưu kho phần thưởng sẽ tạo chiến dịch mặc định đầu tiên.
									</ItemCard.Description>
								</ItemCard.Content>
							</ItemCard>
						) : <p className="text-sm text-muted">Kho này thuộc chiến dịch {selectedCampaignName}.</p>}
						<div className="flex items-center gap-4">
							<ProgressCircle
								aria-label="Tiến độ cấu hình kho phần thưởng"
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
									Trạng thái tồn kho và khóa chỉnh sửa.
								</p>
							</div>
						</div>
						<div className="admin-command-summary__note">
							<p className="admin-command-summary__note-label">
								{setupProgress === 100 ? "Sẵn sàng vận hành" : "Bước tiếp theo"}
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
								<span className="text-muted">Chiến dịch ngân sách</span>
								<span className="truncate font-medium text-foreground">
									{selectedCampaignName}
								</span>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Số mức thưởng</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									value={rows.length}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Ngân sách dự kiến</span>
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
						<Widget.Title>Kho phần thưởng</Widget.Title>
						<Widget.Description>
							Cấu hình giá trị, số lượng và độ hiếm cho từng mức kết quả phần thưởng.
						</Widget.Description>
					</div>
					<Chip size="sm" variant="soft">
						{rows.length} mức
					</Chip>
				</Widget.Header>
				<Widget.Content className="gap-5">
					<ItemCardGroup
						aria-label="Tóm tắt kho phần thưởng"
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
									<Alert.Title>Ngân sách đã khóa</Alert.Title>
									<Alert.Description>
										Đã có lượt chơi đang chờ hoặc đã hoàn tất, nên kho phần thưởng
										được khóa để bảo toàn lịch sử.
									</Alert.Description>
								</Alert.Content>
							</Alert>
							<ItemCardGroup aria-label="Trạng thái khóa kho phần thưởng" className="admin-card-grid--two" layout="grid" variant="secondary">
								<ItemCard variant="secondary">
									<ItemCard.Icon>
										<WalletCards aria-hidden="true" size={18} strokeWidth={2} />
									</ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>Ngân sách đã cấu hình</ItemCard.Title>
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
										<ItemCard.Title>Trạng thái kho</ItemCard.Title>
										<ItemCard.Description>
											Kho đã khóa; hoạt động vận hành lượt chơi vẫn có thể tiếp tục.
										</ItemCard.Description>
									</ItemCard.Content>
									<ItemCard.Action>
										<Link
											className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground"
											to="/campaigns"
										>
											Campaign Studio
										</Link>
									</ItemCard.Action>
								</ItemCard>
							</ItemCardGroup>
						</>
					) : (
						<>
							<ItemCardGroup aria-label="Các bậc phần thưởng" variant="secondary">
								{rows.map((row, index) => {
									const amount = getNumberFieldValue(row.amount);
									const quantity = getNumberFieldValue(row.quantity);
									const subtotal = amount && quantity ? amount * quantity : 0;

									return (
										<ItemCard className="items-start" key={row.id} variant="secondary">
											<ItemCard.Content className="min-w-0 gap-4">
												<div className="flex flex-wrap items-start justify-between gap-4">
													<div className="min-w-0">
														<ItemCard.Title>Mức thưởng {index + 1}</ItemCard.Title>
														<ItemCard.Description>
															Tạm tính được cập nhật theo giá trị và số lượng.
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
												aria-label={`Xóa mức thưởng ${index + 1}`}
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
											aria-label={`Giá trị mức thưởng ${index + 1}`}
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
												<Label>Giá trị phần thưởng</Label>
														<NumberField.Group>
															<NumberField.DecrementButton
																aria-label={`Giảm giá trị mức thưởng ${index + 1}`}
															/>
															<NumberField.Input className="w-full tabular-nums" />
															<NumberField.IncrementButton
																aria-label={`Tăng giá trị mức thưởng ${index + 1}`}
															/>
														</NumberField.Group>
													</NumberField>
													<NumberStepper
											aria-label={`Số lượng mức thưởng ${index + 1}`}
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
															<NumberStepper.DecrementButton
																aria-label={`Giảm số lượng mức thưởng ${index + 1}`}
															/>
															<NumberStepper.Value />
															<NumberStepper.IncrementButton
																aria-label={`Tăng số lượng mức thưởng ${index + 1}`}
															/>
														</NumberStepper.Group>
													</NumberStepper>
													<NativeSelect fullWidth variant="secondary">
												<Label>Độ hiếm</Label>
														<NativeSelect.Trigger
													aria-label={`Độ hiếm mức thưởng ${index + 1}`}
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
										{estimatedEnvelopeCount.toLocaleString("vi-VN")} đơn vị phần thưởng
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

			<RewardInventoryPanel campaignId={campaignId} />
		</AdminPageShell>
	);
}
