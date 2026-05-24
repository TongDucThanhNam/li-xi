"use client";

import type { DataGridColumn } from "@heroui-pro/react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Chip, Description, Label, ProgressCircle, Tabs } from "@heroui/react";
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
import { BarChart3, FileText, History, MonitorPlay, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import type { Rarity } from "@/lib/lixiPolicy";
import { useHostLogout } from "@/lib/useHostLogout";
import { useOwnerSession } from "@/lib/useOwnerSession";
import adminCss from "./styles/admin.css?url";

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

export const Route = createFileRoute("/leaderboard")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
	}),
	component: LeaderboardPage,
});

function LeaderboardPage() {
	const navigate = useNavigate();
	const owner = useOwnerSession();
	const logout = useHostLogout();
	const [selectedCampaignId, setSelectedCampaignId] =
		useState<Id<"campaigns"> | null>(null);
	const [recordsView, setRecordsView] = useState<"leaderboard" | "history">(
		"leaderboard",
	);

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	const workspace = useQuery(
		api.campaigns.getWorkspace,
		owner ? {} : "skip",
	);
	const ownerLeaderboard = useQuery(
		api.leaderboard.getOwnerLeaderboard,
		owner && !selectedCampaignId ? { limit: 50 } : "skip",
	);
	const campaignLeaderboard = useQuery(
		api.leaderboard.getCampaignLeaderboard,
		owner && selectedCampaignId
			? { campaignId: selectedCampaignId, limit: 50 }
			: "skip",
	);
	const ownerHistory = useQuery(
		api.leaderboard.getOwnerHistory,
		owner && !selectedCampaignId ? { limit: 100 } : "skip",
	);
	const campaignHistory = useQuery(
		api.leaderboard.getCampaignHistory,
		owner && selectedCampaignId
			? { campaignId: selectedCampaignId, limit: 100 }
			: "skip",
	);
	const leaderboard = selectedCampaignId
		? campaignLeaderboard
		: ownerLeaderboard;
	const history = selectedCampaignId ? campaignHistory : ownerHistory;
	const selectedCampaign = workspace?.campaigns.find(
		(campaign) => campaign.id === selectedCampaignId,
	);

	useEffect(() => {
		if (
			selectedCampaignId &&
			workspace &&
			!workspace.campaigns.some((campaign) => campaign.id === selectedCampaignId)
		) {
			setSelectedCampaignId(null);
		}
	}, [selectedCampaignId, workspace]);

	const handleLogout = async () => {
		await logout();
		void navigate({ to: "/auth", replace: true });
	};

	if (
		!owner ||
		workspace === undefined ||
		leaderboard === undefined ||
		history === undefined
	) {
		return (
			<AdminRouteStatus
				contractText="Loading leaderboard"
				description="Đang tải campaign scope, bảng xếp hạng và lịch sử trao thưởng."
				title="Đang tải Campaign Leaderboard"
			/>
		);
	}

	const totalRedeemed = history.reduce((sum, item) => sum + item.amount, 0);
	const legendCount = history.filter((item) => item.rarity === "legend").length;
	const selectedScopeLabel = selectedCampaign
		? selectedCampaign.name
		: "All campaigns";
	const rarityBreakdown = (["common", "rare", "legend"] as const).map(
		(rarity) => {
			const items = history.filter((item) => item.rarity === rarity);
			const amount = items.reduce((sum, item) => sum + item.amount, 0);

			return {
				amount,
				color: getRarityChartColor(rarity),
				label: rarity,
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
					<span className="text-xs tabular-nums text-muted">Rank #{item.rank}</span>
				</span>
			),
			header: "Guest",
			id: "guest",
			isRowHeader: true,
			minWidth: 180,
			sortFn: (a, b) => a.rank - b.rank,
		},
		{
			allowsSorting: true,
			cell: (item) => (
				<Chip color={getRarityStatus(item.rarity)} size="sm" variant="soft">
					{item.rarity}
				</Chip>
			),
			header: "Rarity",
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
			header: "Amount",
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
			header: "Time",
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
			header: "Guest",
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
						Mã quà {item.envelopeIndex + 1}
					</Chip>
				</span>
			),
			header: "Campaign",
			id: "campaign",
			minWidth: 220,
		},
		{
			allowsSorting: true,
			cell: (item) => (
				<Chip color={getRarityStatus(item.rarity)} size="sm" variant="soft">
					{item.rarity}
				</Chip>
			),
			header: "Rarity",
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
			header: "Amount",
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
			header: "Time",
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
						<Widget.Title>Campaign scope</Widget.Title>
						<Widget.Description>
							Chọn phạm vi để đối chiếu leaderboard và lịch sử redemption.
						</Widget.Description>
					</div>
					<Chip className="max-w-full" variant="soft">
						<Chip.Label className="truncate">{selectedScopeLabel}</Chip.Label>
					</Chip>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<NativeSelect fullWidth variant="secondary">
						<Label>Campaign</Label>
						<NativeSelect.Trigger
							aria-label="Campaign analytics scope"
							value={selectedCampaignId ?? "all"}
							onChange={(event) => {
								const nextValue = event.currentTarget.value;
								setSelectedCampaignId(
									nextValue === "all" ? null : (nextValue as Id<"campaigns">),
								);
							}}
						>
							<NativeSelect.Option value="all">All campaigns</NativeSelect.Option>
							{workspace.campaigns.map((campaign) => (
								<NativeSelect.Option key={campaign.id} value={campaign.id}>
									{campaign.name}
								</NativeSelect.Option>
							))}
							<NativeSelect.Indicator />
						</NativeSelect.Trigger>
						<Description>
							Chọn toàn workspace hoặc khoanh vùng một campaign cụ thể.
						</Description>
					</NativeSelect>
					<ItemCardGroup variant="secondary">
						<ItemCard variant="secondary">
							<ItemCard.Content>
								<ItemCard.Title>{selectedScopeLabel}</ItemCard.Title>
								<ItemCard.Description>
									{selectedCampaign
										? selectedCampaign.brandName || owner.username
										: `${workspace.campaigns.length.toLocaleString("vi-VN")} campaigns`}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip size="sm" variant="soft">
									{selectedCampaignId ? "Campaign" : "Workspace"}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
					</ItemCardGroup>
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Reward mix</Widget.Title>
						<Widget.Description>
							Phân bố rarity và giá trị thưởng trong phạm vi đang chọn.
						</Widget.Description>
					</div>
					<Widget.Legend>
						<Widget.LegendItem color="var(--chart-3)">
							Redemptions
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
								name="Redemptions"
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
						<ItemCardGroup variant="secondary">
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
								<EmptyState.Title>Chưa có dữ liệu reward mix</EmptyState.Title>
								<EmptyState.Description>
									Breakdown sẽ xuất hiện sau lượt redeem đầu tiên.
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
					: `All campaigns · ${owner.username}`
			}
			eyebrow="Analytics"
			onLogout={handleLogout}
			ownerUsername={owner.username}
			aside={leaderboardContextPanel}
			title="Campaign Leaderboard"
		>
			<KPIGroup className="admin-kpi-strip">
				<KPI>
					<KPI.Header>
						<KPI.Title>Redemptions</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={history.length} />
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Redeemed Value</KPI.Title>
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
						<KPI.Title>Legend Rewards</KPI.Title>
						<KPI.Trend trend={legendCount > 0 ? "up" : "neutral"}>
							{legendCount > 0 ? "hit" : "none"}
						</KPI.Trend>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={legendCount} />
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Title>Campaigns</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={workspace.campaigns.length} />
					</KPI.Content>
				</KPI>
			</KPIGroup>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Analytics command</Widget.Title>
						<Widget.Description>
							Tổng quan phạm vi đang xem và hành động vận hành gần nhất.
						</Widget.Description>
					</div>
					<Chip color={analyticsReadyCount === 3 ? "success" : "default"} variant="soft">
						{analyticsReadyCount}/3 signals
					</Chip>
				</Widget.Header>
				<Widget.Content className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
					<ItemCardGroup
						className="admin-card-grid--three"
						layout="grid"
						variant="secondary"
					>
						<ItemCard className="items-start" variant="secondary">
							<ItemCard.Icon className="text-accent">
								<FileText aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>Scope</ItemCard.Title>
								<ItemCard.Description className="whitespace-normal">
									{selectedScopeLabel}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip size="sm" variant="soft">
									{selectedCampaignId ? "Campaign" : "Workspace"}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
						<ItemCard className="items-start" variant="secondary">
							<ItemCard.Icon className={topReward ? "text-success" : "text-muted"}>
								<Trophy aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>Top reward</ItemCard.Title>
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
										Empty
									</Chip>
								)}
							</ItemCard.Action>
						</ItemCard>
						<ItemCard className="items-start" variant="secondary">
							<ItemCard.Icon className={hasRarityBreakdown ? "text-success" : "text-muted"}>
								<BarChart3 aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>Reward mix</ItemCard.Title>
								<ItemCard.Description className="whitespace-normal">
									{hasRarityBreakdown
										? "Rarity breakdown đã có dữ liệu."
										: "Đợi lượt redeem đầu tiên để có breakdown."}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip
									color={hasRarityBreakdown ? "success" : "default"}
									size="sm"
									variant="soft"
								>
									{hasRarityBreakdown ? "Ready" : "Pending"}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
					</ItemCardGroup>
					<div className="admin-command-summary">
						<div className="flex items-center gap-4">
							<ProgressCircle
								aria-label="Analytics signal readiness"
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
									Signals from history, top rewards, and rarity mix.
								</p>
							</div>
						</div>
						<div className="admin-command-summary__metric-list">
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Redemption history</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									value={history.length}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Legend hits</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									value={legendCount}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Average reward</span>
								<NumberValue
									className="font-medium tabular-nums text-foreground"
									currency="VND"
									maximumFractionDigits={0}
									style="currency"
									value={averageReward}
								/>
							</div>
							<div className="admin-command-summary__metric-row">
								<span className="text-muted">Dominant rarity</span>
								<Chip
									color={getRarityStatus(dominantRarity.rarity)}
									size="sm"
									variant="soft"
								>
									{dominantRarity.redemptions > 0 ? dominantRarity.label : "None"}
								</Chip>
							</div>
						</div>
						<div className="admin-command-summary__note">
							<p className="admin-command-summary__note-label">Latest redemption</p>
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
										Empty
									</Chip>
								)}
							</div>
							<p className="admin-command-summary__note-copy line-clamp-2">
								{latestRedemption
									? `${latestRedemption.campaignName ?? selectedScopeLabel} · ${
											formatDateTimeParts(latestRedemption.createdAt).date
										} ${formatDateTimeParts(latestRedemption.createdAt).time}`
									: "Các lượt redeem mới sẽ xuất hiện tại đây."}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onPress={() => void navigate({ to: "/campaigns" })}
							>
								<FileText aria-hidden="true" size={16} strokeWidth={2} />
								Campaigns
							</Button>
							<Button
								type="button"
								variant="secondary"
								onPress={() => void navigate({ to: "/draw" })}
							>
								<MonitorPlay aria-hidden="true" size={16} strokeWidth={2} />
								Station
							</Button>
						</div>
					</div>
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Redemption records</Widget.Title>
						<Widget.Description>
							Xem Top giá trị thưởng hoặc Lịch sử gần đây trong cùng một phạm vi.
						</Widget.Description>
					</div>
					<Tabs
						selectedKey={recordsView}
						variant="secondary"
						onSelectionChange={(key) =>
							setRecordsView(String(key) === "history" ? "history" : "leaderboard")
						}
					>
						<Tabs.ListContainer className="overflow-x-auto">
							<Tabs.List aria-label="Redemption records view" className="w-fit">
								<Tabs.Tab id="leaderboard">
									Top giá trị thưởng
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
								aria-label="Top reward leaderboard"
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
									Lịch sử redemption sẽ được ghi theo từng campaign.
								</EmptyState.Description>
							</EmptyState.Header>
						</EmptyState>
					</Widget.Content>
				) : (
					<Widget.Content className="p-0">
						<DataGrid
							allowsColumnResize
							aria-label="Recent redemptions"
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
