"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Button,
	Chip,
	CloseButton,
	Label,
	NumberField,
} from "@heroui/react";
import {
	EmptyState,
	NativeSelect,
	NumberValue,
	Widget,
} from "@heroui-pro/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileQuestion, Plus } from "lucide-react";
import { AdminDisclosure } from "@/app/components/AdminDisclosure";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import { BudgetMeter, StockMeter } from "@/app/_workspace/-components/StockMeter";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { RewardInventoryPanel } from "@/app/_workspace/-features/RewardInventoryPanel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPercent } from "@/lib/campaignMetrics";
import { configRewardSource, gameTemplates } from "@/lib/gameTemplates";
import { RARITY_LABELS, RARITY_VALUES, Rarity } from "@/lib/lixiPolicy";
import { rewardReadiness } from "@/lib/rewardReadiness";
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

const vndFormat = new Intl.NumberFormat("vi-VN", {
	currency: "VND",
	maximumFractionDigits: 0,
	style: "currency",
});

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
	const gamesContext = useQuery(
		api.campaigns.getCampaignGamesRouteContext,
		owner && campaign ? { campaignId } : "skip",
	);
	const inventory = useQuery(
		api.rewardInventory.getRewardInventory,
		owner && campaign ? { campaignId } : "skip",
	);

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
	const campaignGames = gamesContext?.campaignGames ?? null;
	const inventoryCount = inventory?.items.length ?? null;
	const readiness =
		campaignGames && inventoryCount !== null
			? rewardReadiness(campaignGames, {
					hasBudget: hasSetup,
					inventoryCount,
				})
			: null;
	const budgetGames =
		campaignGames?.filter(
			(game) => configRewardSource(game.config) === "campaign-budget",
		) ?? null;
	const inventoryGames =
		campaignGames?.filter(
			(game) => configRewardSource(game.config) === "campaign-inventory",
		) ?? null;
	const budgetLocked = hasSetup && !setupState.canConfigure;
	// Budget meter figures (§11.4.4): remaining over total with the spent note.
	const budgetTotal = setupState.budget?.totalBudget ?? 0;
	const budgetRemaining = setupState.budget?.remainingBudget ?? 0;
	const budgetPercent = budgetTotal > 0 ? (budgetRemaining / budgetTotal) * 100 : 0;
	// Quiet-until-dirty save (§11.4.4/R6): the first configuration of an empty
	// budget and any draft drift from the stored tiers turn the save primary.
	const budgetDirty =
		!hasSetup ||
		rows.length !== setupState.items.length ||
		rows.some((row, index) => {
			const item = setupState.items[index];
			return (
				item !== undefined &&
				`${row.amount}|${row.quantity}|${row.rarity}` !==
					`${item.amount}|${item.initialQuantity}|${item.rarity}`
			);
		});
	const budgetChip = !hasSetup
		? { color: "warning" as const, label: "Chưa cấu hình" }
		: budgetLocked
			? { color: "default" as const, label: "Đã khoá" }
			: { color: "success" as const, label: "Đã cấu hình" };
	// A source with at least one game or saved data opens as a section; the
	// unused-and-empty ones fold to the end so the page never shows two
	// stretched empty states (§8.2).
	const inventoryOpen =
		inventoryGames === null || inventoryCount === null
			? true
			: inventoryGames.length > 0 || inventoryCount > 0;
	const budgetOpen = budgetGames === null ? true : budgetGames.length > 0 || hasSetup;

	const usedByNode = (games: NonNullable<typeof campaignGames>) => {
		if (games.length === 0) {
			return <p className="admin-usedby">Chưa có trò chơi nào dùng nguồn thưởng này.</p>;
		}
		return (
			<p className="admin-usedby">
				<span>Dùng cho:</span>
				{games.map((game, index) => (
					<Fragment key={game.id}>
						{index > 0 ? <span aria-hidden="true">·</span> : null}
						<Link
							params={{ campaignGameId: game.id, campaignId }}
							to="/campaigns/$campaignId/games/$campaignGameId"
						>
							{game.name}
						</Link>
					</Fragment>
				))}
			</p>
		);
	};

	const budgetSection = (
		<Widget>
			<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
				<div>
					<Widget.Title>
						Ngân sách tiền mặt {gameTemplates["li-xi"].name}
					</Widget.Title>
					<Widget.Description>
						Các mức tiền mặt trao qua trò chơi dùng ngân sách, có Host PIN xác nhận.
					</Widget.Description>
				</div>
				<Chip color={budgetChip.color} size="sm" variant="soft">
					{budgetChip.label}
				</Chip>
			</Widget.Header>
			<Widget.Content className="admin-stack">
				{error || info ? (
					<Alert status={error ? "danger" : "success"}>
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Title>{error || info}</Alert.Title>
						</Alert.Content>
					</Alert>
				) : null}
				{usedByNode(budgetGames ?? [])}
				{hasSetup ? (
					<BudgetMeter
						label="Ngân sách còn lại"
						note={
							budgetTotal > 0 ? (
								<>
									Đã trao {vndFormat.format(budgetTotal - budgetRemaining)} (
									{formatPercent(1 - budgetRemaining / budgetTotal)})
								</>
							) : undefined
						}
						percent={budgetPercent}
						progressLabel="Ngân sách còn lại"
						remaining={
							<NumberValue
								currency="VND"
								maximumFractionDigits={0}
								style="currency"
								value={budgetRemaining}
							/>
						}
						total={
							<NumberValue
								currency="VND"
								maximumFractionDigits={0}
								style="currency"
								value={budgetTotal}
							/>
						}
					/>
				) : null}
				{budgetLocked ? (
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
						<ul aria-label="Tồn kho theo mệnh giá" className="admin-stock-list">
							{setupState.items.map((item) => (
								<li className="admin-stock-list__row" key={item.amount}>
									<span className="admin-stock-list__name">
										{vndFormat.format(item.amount)}
										<span className="text-muted"> · {RARITY_LABELS[item.rarity]}</span>
									</span>
									<StockMeter
										ariaLabel={`Tồn kho mức ${vndFormat.format(item.amount)}`}
										remaining={item.remainingQuantity}
										total={item.initialQuantity}
									/>
								</li>
							))}
						</ul>
					</>
				) : (
					<>
						<div>
							<div aria-hidden="true" className="admin-tier-head">
								<span>Giá trị</span>
								<span>Số lượng</span>
								<span>Độ hiếm</span>
								<span className="md:text-right">Tạm tính</span>
								<span />
							</div>
							<ul aria-label="Các bậc phần thưởng">
								{rows.map((row, index) => {
									const amount = getNumberFieldValue(row.amount);
									const quantity = getNumberFieldValue(row.quantity);
									const subtotal = amount && quantity ? amount * quantity : 0;

									return (
										<li className="admin-tier-row" key={row.id}>
											<div className="admin-field col-span-2 md:col-span-1">
												<NumberField
													aria-label={`Giá trị mức thưởng ${index + 1}`}
													fullWidth
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
													<Label className="md:sr-only">Giá trị phần thưởng</Label>
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
											</div>
											<div className="admin-field">
												<NumberField
													aria-label={`Số lượng mức thưởng ${index + 1}`}
													fullWidth
													minValue={1}
													value={quantity}
													variant="secondary"
													onChange={(value) => {
														setRows((current) =>
															current.map((item) =>
																item.id === row.id
																	? { ...item, quantity: value ? String(value) : "" }
																	: item,
															),
														);
													}}
												>
													<Label className="md:sr-only">Số lượng</Label>
													<NumberField.Group>
														<NumberField.DecrementButton
															aria-label={`Giảm số lượng mức thưởng ${index + 1}`}
														/>
														<NumberField.Input className="w-full tabular-nums" />
														<NumberField.IncrementButton
															aria-label={`Tăng số lượng mức thưởng ${index + 1}`}
														/>
													</NumberField.Group>
												</NumberField>
											</div>
											<div className="admin-field">
												<NativeSelect fullWidth variant="secondary">
													<Label className="md:sr-only">Độ hiếm</Label>
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
												</NativeSelect>
											</div>
											<div className="col-span-2 flex items-center justify-between gap-3 md:contents">
												<p className="text-sm tabular-nums text-muted md:self-center md:text-right">
													<span className="md:sr-only">Tạm tính </span>
													{vndFormat.format(subtotal)}
												</p>
												<CloseButton
													aria-label={`Xóa mức thưởng ${index + 1}`}
													className="md:self-center"
													isDisabled={rows.length <= 1}
													onPress={() =>
														setRows((current) =>
															current.filter((item) => item.id !== row.id),
														)
													}
												/>
											</div>
										</li>
									);
								})}
							</ul>
							<p className="admin-field__hint">
								Ảnh hưởng nhãn hiển thị trong kết quả.
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-3">
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
							{hasSetup && budgetDirty ? (
								<p className="text-sm text-warning" role="status">
									Có thay đổi chưa lưu.
								</p>
							) : null}
							<p className="ml-auto text-sm tabular-nums text-muted">
								{estimatedEnvelopeCount.toLocaleString("vi-VN")} lượt · Trung bình{" "}
								{vndFormat.format(averageEnvelopeValue)} · Tổng{" "}
								{vndFormat.format(estimatedTotalBudget)}
							</p>
							<Button
								isDisabled={!canSaveBudget}
								isPending={submitting}
								type="button"
								variant={budgetDirty ? "primary" : "secondary"}
								onPress={handleSubmit}
							>
								Lưu cấu hình ngân sách
							</Button>
						</div>
					</>
				)}
			</Widget.Content>
		</Widget>
	);

	const inventorySection = (
		<RewardInventoryPanel campaignId={campaignId} usedBy={usedByNode(inventoryGames ?? [])} />
	);

	return (
		<AdminPageShell
			breadcrumbContext={selectedCampaignName}
			description="Phần thưởng mà các trò chơi trong chiến dịch này có thể trao."
			status={
				readiness ? (
					readiness.ready ? (
						<Chip color="success" size="sm" variant="soft">
							Sẵn sàng
						</Chip>
					) : (
						<Chip color="warning" size="sm" variant="soft">
							Cần thiết lập
						</Chip>
					)
				) : undefined
			}
			tabs={<CampaignContextNav campaignId={campaignId} />}
			title="Kho phần thưởng"
		>
			{inventoryOpen ? inventorySection : null}
			{!inventoryOpen ? (
				<AdminDisclosure bare summary="Chưa có trò chơi nào dùng" title="Kho phần thưởng dùng chung">
					{inventorySection}
				</AdminDisclosure>
			) : null}
			{budgetOpen ? budgetSection : null}
			{!budgetOpen ? (
				<AdminDisclosure
					bare
					summary="Chưa có trò chơi nào dùng"
					title={`Ngân sách tiền mặt ${gameTemplates["li-xi"].name}`}
				>
					{budgetSection}
				</AdminDisclosure>
			) : null}
		</AdminPageShell>
	);
}
