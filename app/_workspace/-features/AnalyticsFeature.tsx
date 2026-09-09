"use client";

import type { DataGridColumn } from "@heroui-pro/react";

import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Chip, Description, Label, ProgressCircle, Tabs } from "@heroui/react";
import {
	BarChart,
	DataGrid,
	EmptyState,
	ItemCard,
	ItemCardGroup,
	KPI,
	KPIGroup,
	NativeSelect,
	NumberValue,
	Widget,
} from "@heroui-pro/react";
import { useQuery } from "convex/react";
import { BarChart3, FileText, Gamepad2, History, Link2, MonitorPlay, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { RARITY_LABELS, type Rarity } from "@/lib/lixiPolicy";
import { useOwnerSession } from "@/lib/useOwnerSession";

function formatDateTimeParts(timestamp: number) {
	const date = new Date(timestamp);

	return {
		date: date.toLocaleDateString("vi-VN", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		}),
		time: date.toLocaleTimeString("vi-VN", {
			hour: "2-digit",
			minute: "2-digit",
		}),
	};
}

function getRarityStatus(rarity: Rarity) {
	const variants: Record<Rarity, "default" | "danger" | "warning"> = {
		common: "default",
		rare: "danger",
		legend: "warning",
	};
	return variants[rarity];
}

function getRarityChartColor(rarity: Rarity) {
	const colors: Record<Rarity, string> = {
		common: "var(--chart-1)",
		rare: "var(--chart-3)",
		legend: "var(--chart-4)",
	};
	return colors[rarity];
}

export function AnalyticsFeature() {
	const navigate = useNavigate();
	const search = useSearch({ from: "/_workspace/analytics" });
	const owner = useOwnerSession();
	const requestedCampaignId = search.campaign ?? null;
	const [recordsView, setRecordsView] = useState<"leaderboard" | "history">("leaderboard");

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	const workspace = useQuery(
		api.campaigns.getWorkspace,
		owner ? {} : "skip",
	);
	const selectedCampaign = workspace?.campaigns.find(
		(campaign) => campaign.id === requestedCampaignId,
	);
	const selectedCampaignId = selectedCampaign?.id ?? null;
	const operationCampaignGameId =
		selectedCampaign?.campaignGame.id ??
		workspace?.activeCampaign?.campaignGame.id ??
		null;
	const invalidCampaignScope = Boolean(requestedCampaignId && workspace && !selectedCampaign);
	const ownerLeaderboard = useQuery(
		api.leaderboard.getOwnerLeaderboard,
		owner && workspace && !requestedCampaignId ? { limit: 50 } : "skip",
	);
	const campaignLeaderboard = useQuery(
		api.leaderboard.getCampaignLeaderboard,
		owner && selectedCampaignId
			? { campaignId: selectedCampaignId, limit: 50 }
			: "skip",
	);
	const ownerHistory = useQuery(
		api.leaderboard.getOwnerHistory,
		owner && workspace && !requestedCampaignId ? { limit: 100 } : "skip",
	);
	const campaignHistory = useQuery(
		api.leaderboard.getCampaignHistory,
		owner && selectedCampaignId
			? { campaignId: selectedCampaignId, limit: 100 }
			: "skip",
	);
	const ownerAnalytics = useQuery(
		api.analytics.getOwnerAnalytics,
		owner && workspace && !requestedCampaignId ? {} : "skip",
	);
	const campaignAnalytics = useQuery(
		api.analytics.getCampaignAnalytics,
		owner && selectedCampaignId ? { campaignId: selectedCampaignId } : "skip",
	);
	const leaderboard = requestedCampaignId ? campaignLeaderboard : ownerLeaderboard;
	const history = requestedCampaignId ? campaignHistory : ownerHistory;
	const analytics = requestedCampaignId ? campaignAnalytics : ownerAnalytics;

	useEffect(() => {
		if (
			requestedCampaignId &&
			workspace &&
			!selectedCampaign
		) {
			void navigate({
				to: "/analytics",
				search: (previous) => ({
					campaign: undefined,
					view: previous.view ?? "overview",
				}),
				replace: true,
			});
		}
	}, [navigate, requestedCampaignId, selectedCampaign, workspace]);

	if (
		!owner ||
		workspace === undefined ||
		invalidCampaignScope ||
		leaderboard === undefined ||
		history === undefined ||
		analytics === undefined
	) {
		return (
			<AdminRouteStatus
				contractText="Đang tải phân tích"
				description="Đang tải phạm vi chiến dịch, bảng xếp hạng và lịch sử trao thưởng."
				title="Đang tải dữ liệu phân tích"
			/>
		);
	}

	const totalRedeemed = history.reduce((sum, item) => sum + item.amount, 0);
	const legendCount = history.filter((item) => item.rarity === "legend").length;
	const selectedScopeLabel = selectedCampaign
		? selectedCampaign.name
		: "Tất cả chiến dịch";
	const rarityBreakdown = (["common", "rare", "legend"] as const).map(
		(rarity) => {
			const items = history.filter((item) => item.rarity === rarity);
			const amount = items.reduce((sum, item) => sum + item.amount, 0);

			return {
				amount,
				color: getRarityChartColor(rarity),
				label: RARITY_LABELS[rarity],
				rarity,
				redemptions: items.length,
				share: history.length > 0 ? Math.round((items.length / history.length) * 100) : 0,
			};
		},
	);
	const hasRarityBreakdown = rarityBreakdown.some(
		(item) => item.redemptions > 0,
	);
	const topReward = leaderboard[0];
	const latestRedemption =
		history.length > 0
			? history.reduce((latest, item) =>
					item.createdAt > latest.createdAt ? item : latest,
				)
			: null;
	const averageReward =
		history.length > 0 ? Math.round(totalRedeemed / history.length) : 0;
	const dominantRarity = rarityBreakdown.reduce(
		(current, item) =>
			item.redemptions > current.redemptions ? item : current,
		rarityBreakdown[0],
	);
	const analyticsReadyCount = [
		history.length > 0,
		leaderboard.length > 0,
		hasRarityBreakdown,
	].filter(Boolean).length;
	const analyticsSignalPercent = Math.round((analyticsReadyCount / 3) * 100);
	const conversionPercent =
		analytics.gameMetrics.conversion === null
			? null
			: Math.round(analytics.gameMetrics.conversion * 100);
	const viewCopy = {
		overview: {
			description: "Tổng hợp lượt chơi, phần thưởng và hiệu quả trong phạm vi đã chọn.",
			title: "Tổng quan hiệu quả",
		},
		games: {
			description: "Theo dõi hành trình từ mở trò chơi đến hoàn tất lượt chơi.",
			title: "Hiệu quả trò chơi",
		},
		rewards: {
			description: "Phân tích kết quả phần thưởng, giá trị đã trao và lịch sử nhận thưởng.",
			title: "Hiệu quả phần thưởng",
		},
		channels: {
			description: "Đo hiệu quả liên kết chơi công khai và các kênh phân phối.",
			title: "Hiệu quả kênh chia sẻ",
		},
	}[search.view];
	type LeaderboardRow = (typeof leaderboard)[number];
	type HistoryRow = (typeof history)[number];
	const leaderboardColumns: DataGridColumn<LeaderboardRow>[] = [
		{
			allowsSorting: true,
			cell: (item) => (
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-foreground">
						{item.guestNameDisplay}
					</span>
					<span className="text-xs tabular-nums text-muted">Hạng #{item.rank}</span>
				</span>
			),
			header: "Người tham gia",
			id: "guest",
			isRowHeader: true,
			minWidth: 180,
			sortFn: (a, b) => a.rank - b.rank,
		},
		{
			allowsSorting: true,
			cell: (item) => (
				<Chip color={getRarityStatus(item.rarity)} size="sm" variant="soft">
					{RARITY_LABELS[item.rarity]}
				</Chip>
			),
			header: "Độ hiếm",
			id: "rarity",
			minWidth: 120,
		},
		{
			align: "end",
			allowsSorting: true,
			cell: (item) => (
				<NumberValue
					className="font-medium tabular-nums text-foreground"
					currency="VND"
					maximumFractionDigits={0}
					style="currency"
					value={item.amount}
				/>
			),
			header: "Giá trị",
			id: "amount",
			minWidth: 140,
			sortFn: (a, b) => a.amount - b.amount,
		},
		{
			allowsSorting: true,
			cell: (item) => {
				const redeemedAt = formatDateTimeParts(item.createdAt);

				return (
					<span className="flex flex-col text-sm">
						<span className="tabular-nums text-foreground">{redeemedAt.date}</span>
						<span className="tabular-nums text-muted">{redeemedAt.time}</span>
					</span>
				);
			},
			header: "Thời gian",
			id: "time",
			minWidth: 120,
			sortFn: (a, b) => a.createdAt - b.createdAt,
		},
	];
	const historyColumns: DataGridColumn<HistoryRow>[] = [
		{
			allowsSorting: true,
			cell: (item) => (
				<span className="truncate font-medium text-foreground">
					{item.guestNameDisplay}
				</span>
			),
			header: "Người tham gia",
			id: "guest",
			isRowHeader: true,
			minWidth: 170,
		},
		{
			cell: (item) => (
				<span className="flex min-w-0 flex-col gap-1">
					<span className="truncate text-muted">
						{item.campaignName ?? "Chiến dịch chưa xác định"}
					</span>
					<Chip className="w-fit" size="sm" variant="soft">
						Kết quả {item.envelopeIndex + 1}
					</Chip>
				</span>
			),
			header: "Chiến dịch",
			id: "campaign",
			minWidth: 220,
		},
		{
			allowsSorting: true,
			cell: (item) => (
				<Chip color={getRarityStatus(item.rarity)} size="sm" variant="soft">
					{RARITY_LABELS[item.rarity]}
				</Chip>
			),
			header: "Độ hiếm",
			id: "rarity",
			minWidth: 120,
		},
		{
			align: "end",
			allowsSorting: true,
			cell: (item) => (
				<NumberValue
					className="font-medium tabular-nums text-foreground"
					currency="VND"
					maximumFractionDigits={0}
					style="currency"
					value={item.amount}
				/>
			),
			header: "Giá trị",
			id: "amount",
			minWidth: 140,
			sortFn: (a, b) => a.amount - b.amount,
		},
		{
			allowsSorting: true,
			cell: (item) => {
				const redeemedAt = formatDateTimeParts(item.createdAt);

				return (
					<span className="flex flex-col text-sm">
						<span className="tabular-nums text-foreground">{redeemedAt.date}</span>
						<span className="tabular-nums text-muted">{redeemedAt.time}</span>
					</span>
				);
			},
			header: "Thời gian",
			id: "time",
			minWidth: 120,
			sortFn: (a, b) => a.createdAt - b.createdAt,
		},
	];
	const leaderboardContextPanel = (
		<div className="admin-aside">
			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Phạm vi chiến dịch</Widget.Title>
						<Widget.Description>
							Chọn phạm vi để đối chiếu bảng xếp hạng và lịch sử nhận thưởng.
						</Widget.Description>
					</div>
					<Chip className="max-w-full" variant="soft">
						<Chip.Label className="truncate">{selectedScopeLabel}</Chip.Label>
					</Chip>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<NativeSelect fullWidth variant="secondary">
						<Label>Chiến dịch</Label>
						<NativeSelect.Trigger
							aria-label="Phạm vi phân tích chiến dịch"
							value={selectedCampaignId ?? "all"}
							onChange={(event) => {
								const nextValue = event.currentTarget.value;
								void navigate({
									to: "/analytics",
									search: (previous) => ({
										campaign: nextValue === "all" ? undefined : nextValue,
										view: previous.view ?? "overview",
									}),
								});
							}}
						>
							<NativeSelect.Option value="all">Tất cả chiến dịch</NativeSelect.Option>
							{workspace.campaigns.map((campaign) => (
								<NativeSelect.Option key={campaign.id} value={campaign.id}>
									{campaign.name}
								</NativeSelect.Option>
							))}
							<NativeSelect.Indicator />
						</NativeSelect.Trigger>
						<Description>
							Chọn toàn bộ không gian làm việc hoặc khoanh vùng một chiến dịch cụ thể.
						</Description>
					</NativeSelect>
					<ItemCardGroup aria-label="Phạm vi phân tích" variant="secondary">
						<ItemCard variant="secondary">
							<ItemCard.Content>
								<ItemCard.Title>{selectedScopeLabel}</ItemCard.Title>
								<ItemCard.Description>
									{selectedCampaign
										? selectedCampaign.brandName || owner.username
										: `${workspace.campaigns.length.toLocaleString("vi-VN")} chiến dịch`}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip size="sm" variant="soft">
									{selectedCampaignId ? "Chiến dịch" : "Toàn bộ"}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
					</ItemCardGroup>
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Cơ cấu phần thưởng</Widget.Title>
						<Widget.Description>
							Phân bố độ hiếm và giá trị thưởng trong phạm vi đang chọn.
						</Widget.Description>
					</div>
					<Widget.Legend>
						<Widget.LegendItem color="var(--chart-3)">
							Lượt trao thưởng
						</Widget.LegendItem>
					</Widget.Legend>
				</Widget.Header>
				{hasRarityBreakdown ? (
					<Widget.Content className="gap-5">
						<BarChart data={rarityBreakdown} height={200}>
							<BarChart.Grid vertical={false} />
							<BarChart.XAxis dataKey="label" tickMargin={8} />
							<BarChart.YAxis width={36} />
							<BarChart.Bar
								barSize={26}
								dataKey="redemptions"
								fill="var(--chart-3)"
								name="Lượt trao thưởng"
								radius={[4, 4, 0, 0]}
							/>
							<BarChart.Tooltip
								content={
									<BarChart.TooltipContent
										valueFormatter={(value) =>
											`${Number(value).toLocaleString("vi-VN")} lượt`
										}
									/>
								}
							/>
						</BarChart>
						<ItemCardGroup aria-label="Cơ cấu phần thưởng theo độ hiếm" variant="secondary">
							{rarityBreakdown.map((item) => (
								<ItemCard className="items-start" key={item.rarity} variant="secondary">
									<ItemCard.Content className="gap-2">
										<div className="flex items-center justify-between gap-3">
											<ItemCard.Title>{item.label}</ItemCard.Title>
											<span className="text-sm tabular-nums text-muted">
												{item.share}%
											</span>
										</div>
										<div className="flex items-end justify-between gap-3">
											<NumberValue
												className="text-lg font-semibold tabular-nums text-foreground"
												maximumFractionDigits={0}
												value={item.redemptions}
											>
												<NumberValue.Suffix>
													<span className="ml-1 text-xs font-normal text-muted">
														lượt
													</span>
												</NumberValue.Suffix>
											</NumberValue>
											<NumberValue
												className="text-sm tabular-nums text-muted"
												currency="VND"
												maximumFractionDigits={0}
												style="currency"
												value={item.amount}
											/>
										</div>
									</ItemCard.Content>
								</ItemCard>
							))}
						</ItemCardGroup>
					</Widget.Content>
				) : (
					<Widget.Content>
						<EmptyState size="sm">
							<EmptyState.Header>
								<EmptyState.Media variant="icon">
									<BarChart3 aria-hidden="true" size={22} strokeWidth={2} />
								</EmptyState.Media>
								<EmptyState.Title>Chưa có dữ liệu cơ cấu phần thưởng</EmptyState.Title>
								<EmptyState.Description>
									Cơ cấu sẽ xuất hiện sau lượt nhận thưởng đầu tiên.
								</EmptyState.Description>
							</EmptyState.Header>
						</EmptyState>
					</Widget.Content>
				)}
			</Widget>
		</div>
	);

	return (
		<AdminPageShell
			description={
				selectedCampaign
					? `${selectedCampaign.name} · ${selectedCampaign.brandName || owner.username}`
					: `Tất cả chiến dịch · ${owner.username}`
			}
			aside={leaderboardContextPanel}
			title={viewCopy.title}
		>
			<Tabs
				className="mb-6"
				selectedKey={search.view}
				variant="secondary"
				onSelectionChange={(key) => void navigate({ to: "/analytics", search: (previous) => ({ ...previous, view: String(key) as "overview" | "games" | "rewards" | "channels" }) })}
			>
				<Tabs.ListContainer className="overflow-x-auto"><Tabs.List aria-label="Góc nhìn phân tích" className="w-fit"><Tabs.Tab id="overview">Tổng quan<Tabs.Indicator /></Tabs.Tab><Tabs.Tab id="games">Trò chơi<Tabs.Indicator /></Tabs.Tab><Tabs.Tab id="rewards">Phần thưởng<Tabs.Indicator /></Tabs.Tab><Tabs.Tab id="channels">Kênh chia sẻ<Tabs.Indicator /></Tabs.Tab></Tabs.List></Tabs.ListContainer>
			</Tabs>
			<Widget>
				<Widget.Header>
					<div>
						<Widget.Title>{viewCopy.title}</Widget.Title>
						<Widget.Description>{viewCopy.description}</Widget.Description>
					</div>
				</Widget.Header>
				<Widget.Content>
					{search.view === "games" ? (
						<ItemCardGroup aria-label="Chỉ số hiệu quả trò chơi" className="admin-card-grid--three" layout="grid" variant="secondary">
							<ItemCard variant="secondary"><ItemCard.Icon><Gamepad2 aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Lượt mở trò chơi</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.opens.toLocaleString("vi-VN")} lượt</ItemCard.Description></ItemCard.Content></ItemCard>
							<ItemCard variant="secondary"><ItemCard.Icon><MonitorPlay aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Lượt bắt đầu</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.starts.toLocaleString("vi-VN")} lượt</ItemCard.Description></ItemCard.Content></ItemCard>
							<ItemCard variant="secondary"><ItemCard.Icon><Trophy aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Lượt hoàn tất</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.completions.toLocaleString("vi-VN")} lượt</ItemCard.Description></ItemCard.Content></ItemCard>
						</ItemCardGroup>
					) : search.view === "channels" ? (
						<ItemCardGroup aria-label="Chỉ số hiệu quả kênh chia sẻ" className="admin-card-grid--three" layout="grid" variant="secondary">
							<ItemCard variant="secondary"><ItemCard.Icon><Link2 aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Lượt mở liên kết công khai</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.channelSharePerformance.publicPlayLinkOpens.toLocaleString("vi-VN")} lượt</ItemCard.Description></ItemCard.Content></ItemCard>
							<ItemCard variant="secondary"><ItemCard.Icon><Trophy aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Lượt nhận thưởng</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.claims.toLocaleString("vi-VN")} lượt</ItemCard.Description></ItemCard.Content></ItemCard>
							<ItemCard variant="secondary"><ItemCard.Icon><BarChart3 aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Tỷ lệ chuyển đổi</ItemCard.Title><ItemCard.Description>{conversionPercent === null ? "Chưa đủ dữ liệu" : `${conversionPercent}%`}</ItemCard.Description></ItemCard.Content></ItemCard>
						</ItemCardGroup>
					) : search.view === "rewards" ? (
						<ItemCardGroup aria-label="Chỉ số hiệu quả phần thưởng" className="admin-card-grid--three" layout="grid" variant="secondary">
							<ItemCard variant="secondary"><ItemCard.Icon><Trophy aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Kết quả phần thưởng</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.rewardOutcomes.toLocaleString("vi-VN")} kết quả</ItemCard.Description></ItemCard.Content></ItemCard>
							<ItemCard variant="secondary"><ItemCard.Icon><History aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Lượt nhận thưởng</ItemCard.Title><ItemCard.Description>{analytics.gameMetrics.claims.toLocaleString("vi-VN")} lượt</ItemCard.Description></ItemCard.Content></ItemCard>
							<ItemCard variant="secondary"><ItemCard.Icon><BarChart3 aria-hidden="true" /></ItemCard.Icon><ItemCard.Content><ItemCard.Title>Tỷ lệ nhận thưởng</ItemCard.Title><ItemCard.Description>{conversionPercent === null ? "Chưa đủ dữ liệu" : `${conversionPercent}%`}</ItemCard.Description></ItemCard.Content></ItemCard>
						</ItemCardGroup>
					) : (
						<p className="text-sm text-muted">Dữ liệu tổng quan bên dưới kết hợp hiệu quả trò chơi, phần thưởng và phân phối trong {selectedScopeLabel.toLocaleLowerCase()}.</p>
					)}
				</Widget.Content>
			</Widget>
			<KPIGroup className="admin-kpi-strip">
				<KPI>
					<KPI.Header>
						<KPI.Title>Lượt trao thưởng</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={history.length} />
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Giá trị đã trao</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value
							currency="VND"
							maximumFractionDigits={0}
							style="currency"
							value={totalRedeemed}
						/>
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Phần thưởng huyền thoại</KPI.Title>
						<KPI.Trend trend={legendCount > 0 ? "up" : "neutral"}>
							{legendCount > 0 ? "Đã có" : "Chưa có"}
						</KPI.Trend>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={legendCount} />
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Chiến dịch</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={workspace.campaigns.length} />
					</KPI.Content>
				</KPI>
			</KPIGroup>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Tóm tắt phân tích</Widget.Title>
						<Widget.Description>
							Tổng quan phạm vi đang xem và hành động vận hành gần nhất.
						</Widget.Description>
					</div>
					<Chip color={analyticsReadyCount === 3 ? "success" : "default"} variant="soft">
						{analyticsReadyCount}/3 tín hiệu
					</Chip>
				</Widget.Header>
				<Widget.Content className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
					<ItemCardGroup
						aria-label="Tóm tắt tín hiệu phân tích"
						className="admin-card-grid--three"
						layout="grid"
						variant="secondary"
					>
						<ItemCard className="items-start" variant="secondary">
							<ItemCard.Icon className="text-accent">
								<FileText aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>Phạm vi</ItemCard.Title>
								<ItemCard.Description className="whitespace-normal">
									{selectedScopeLabel}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip size="sm" variant="soft">
									{selectedCampaignId ? "Chiến dịch" : "Toàn bộ"}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
						<ItemCard className="items-start" variant="secondary">
							<ItemCard.Icon className={topReward ? "text-success" : "text-muted"}>
								<Trophy aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>Phần thưởng cao nhất</ItemCard.Title>
								<ItemCard.Description className="whitespace-normal">
									{topReward ? topReward.guestNameDisplay : "Chưa có người nhận"}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								{topReward ? (
									<NumberValue
										className="text-sm font-medium tabular-nums text-foreground"
										currency="VND"
										maximumFractionDigits={0}
										style="currency"
										value={topReward.amount}
									/>
								) : (
									<Chip size="sm" variant="soft">
										Chưa có
									</Chip>
								)}
							</ItemCard.Action>
						</ItemCard>
						<ItemCard className="items-start" variant="secondary">
							<ItemCard.Icon className={hasRarityBreakdown ? "text-success" : "text-muted"}>
								<BarChart3 aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>Cơ cấu phần thưởng</ItemCard.Title>
								<ItemCard.Description className="whitespace-normal">
									{hasRarityBreakdown
										? "Cơ cấu độ hiếm đã có dữ liệu."
										: "Đợi lượt nhận thưởng đầu tiên để có cơ cấu."}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip
									color={hasRarityBreakdown ? "success" : "default"}
									size="sm"
									variant="soft"
								>
									{hasRarityBreakdown ? "Sẵn sàng" : "Đang chờ"}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
					</ItemCardGroup>
					<div className="admin-command-summary">
						<div className="flex items-center gap-4">
							<ProgressCircle
								aria-label="Mức độ sẵn sàng của dữ liệu phân tích"
								color={analyticsReadyCount === 3 ? "success" : "accent"}
								value={analyticsSignalPercent}
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
										value={analyticsSignalPercent}
									>
										<NumberValue.Suffix>
											<span className="ml-0.5 text-sm font-medium text-muted">%</span>
										</NumberValue.Suffix>
									</NumberValue>
									<Chip
										color={analyticsReadyCount === 3 ? "success" : "accent"}
										size="sm"
										variant="soft"
									>
										{analyticsReadyCount}/3
									</Chip>
								</div>
								<p className="mt-1 text-xs leading-5 text-muted">
									Tín hiệu từ lịch sử, phần thưởng cao nhất và cơ cấu độ hiếm.
								</p>
							</div>
						</div>
						<div className="admin-command-summary__metric-list">
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Lịch sử trao thưởng</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									value={history.length}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Lượt huyền thoại</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									value={legendCount}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Giá trị trung bình</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									currency="VND"
									maximumFractionDigits={0}
									style="currency"
									value={averageReward}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Độ hiếm phổ biến</span>
								<Chip
									color={getRarityStatus(dominantRarity.rarity)}
									size="sm"
									variant="soft"
								>
									{dominantRarity.redemptions > 0 ? dominantRarity.label : "Chưa có"}
								</Chip>
							</div>
						</div>
						<div className="admin-command-summary__note">
							<p className="admin-command-summary__note-label">Lượt trao thưởng mới nhất</p>
							<div className="admin-command-summary__note-header">
								<p className="admin-command-summary__note-title">
									{latestRedemption
										? latestRedemption.guestNameDisplay
										: "Chưa có lượt trao thưởng"}
								</p>
								{latestRedemption ? (
									<NumberValue
										className="text-sm font-medium tabular-nums text-foreground"
										currency="VND"
										maximumFractionDigits={0}
										style="currency"
										value={latestRedemption.amount}
									/>
								) : (
									<Chip size="sm" variant="soft">
										Trống
									</Chip>
								)}
							</div>
							<p className="admin-command-summary__note-copy line-clamp-2">
								{latestRedemption
									? `${latestRedemption.campaignName ?? selectedScopeLabel} · ${
											formatDateTimeParts(latestRedemption.createdAt).date
										} ${formatDateTimeParts(latestRedemption.createdAt).time}`
									: "Các lượt nhận thưởng mới sẽ xuất hiện tại đây."}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Link
								className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground"
								to="/campaigns"
							>
								<FileText aria-hidden="true" size={16} strokeWidth={2} />
								Chiến dịch
							</Link>
							{operationCampaignGameId ? (
								<Link
									className="inline-flex items-center gap-2 rounded-xl bg-surface-secondary px-3 py-2 text-sm font-medium text-foreground"
									params={{ campaignGameId: operationCampaignGameId }}
									to="/operate/$campaignGameId"
								>
									<MonitorPlay aria-hidden="true" size={16} strokeWidth={2} />
									Vận hành trò chơi
								</Link>
							) : null}
						</div>
					</div>
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Dữ liệu trao thưởng</Widget.Title>
						<Widget.Description>
							Xem Giá trị thưởng cao nhất hoặc Lịch sử gần đây trong cùng một phạm vi.
						</Widget.Description>
					</div>
					<Tabs
						selectedKey={recordsView}
						variant="secondary"
						onSelectionChange={(key) => setRecordsView(String(key) === "history" ? "history" : "leaderboard")}
					>
						<Tabs.ListContainer className="overflow-x-auto">
							<Tabs.List aria-label="Cách xem dữ liệu trao thưởng" className="w-fit">
								<Tabs.Tab id="leaderboard">
									Giá trị thưởng cao nhất
									<Tabs.Indicator />
								</Tabs.Tab>
								<Tabs.Tab id="history">
									Lịch sử gần đây
									<Tabs.Indicator />
								</Tabs.Tab>
							</Tabs.List>
						</Tabs.ListContainer>
					</Tabs>
				</Widget.Header>
				{recordsView === "leaderboard" ? (
					leaderboard.length === 0 ? (
						<Widget.Content>
							<EmptyState size="sm">
								<EmptyState.Header>
									<EmptyState.Media variant="icon">
										<Trophy aria-hidden="true" size={22} strokeWidth={2} />
									</EmptyState.Media>
									<EmptyState.Title>Chưa có lượt nhận thưởng nào.</EmptyState.Title>
									<EmptyState.Description>
										Dữ liệu sẽ xuất hiện sau khi khách nhận thưởng.
									</EmptyState.Description>
								</EmptyState.Header>
							</EmptyState>
						</Widget.Content>
					) : (
						<Widget.Content className="p-0">
							<DataGrid
								allowsColumnResize
								aria-label="Bảng phần thưởng cao nhất"
								columns={leaderboardColumns}
								contentClassName="min-w-[620px]"
								data={leaderboard}
								defaultSortDescriptor={{ column: "amount", direction: "descending" }}
								getRowId={(item) => item.id}
								scrollContainerClassName="max-h-[560px] overflow-auto"
								variant="secondary"
							/>
						</Widget.Content>
					)
				) : history.length === 0 ? (
					<Widget.Content>
						<EmptyState size="sm">
							<EmptyState.Header>
								<EmptyState.Media variant="icon">
									<History aria-hidden="true" size={22} strokeWidth={2} />
								</EmptyState.Media>
								<EmptyState.Title>Chưa có lịch sử trao thưởng</EmptyState.Title>
								<EmptyState.Description>
									Lịch sử nhận thưởng sẽ được ghi theo từng chiến dịch.
								</EmptyState.Description>
							</EmptyState.Header>
						</EmptyState>
					</Widget.Content>
				) : (
					<Widget.Content className="p-0">
						<DataGrid
							allowsColumnResize
							aria-label="Lịch sử trao thưởng gần đây"
							columns={historyColumns}
							contentClassName="min-w-[820px]"
							data={history}
							defaultSortDescriptor={{ column: "time", direction: "descending" }}
							getRowId={(item) => item.id}
							scrollContainerClassName="max-h-[560px] overflow-auto"
							variant="secondary"
						/>
					</Widget.Content>
				)}
			</Widget>
		</AdminPageShell>
	);
}
