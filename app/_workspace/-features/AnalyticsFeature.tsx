"use client";

import type { DataGridColumn } from "@heroui-pro/react";

import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button, Chip, Tabs, buttonVariants } from "@heroui/react";
import {
	DataGrid,
	EmptyState,
	NativeSelect,
	NumberValue,
	Widget,
} from "@heroui-pro/react";
import { useQuery } from "convex/react";
import { ArrowRight, BarChart3, Gamepad2, History, Link2, MoveHorizontal, Ticket, Trophy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import { GameTemplateIcon } from "@/app/_workspace/-components/GameTemplateIcon";
import { PerformanceSummary } from "@/app/_workspace/-components/PerformanceSummary";
import { RateBar, ShareBars, type ShareBarRow } from "@/app/_workspace/-components/ShareBars";
import { api } from "@/convex/_generated/api";
import {
	conversionRate,
	formatPercent,
	groupRowsByCampaign,
	sumFunnelRows,
} from "@/lib/campaignMetrics";
import { gameTemplates, type GameTemplateId } from "@/lib/gameTemplates";
import { RARITY_LABELS, type Rarity } from "@/lib/lixiPolicy";
import { useOwnerSession } from "@/lib/useOwnerSession";
import { RewardClaimsPanel } from "./RewardClaimsPanel";

const viNumberFormat = new Intl.NumberFormat("vi-VN");

const sectionActionLinkClass =
	"inline-flex items-center gap-1 rounded-sm text-sm font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-focus";

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

/** Legacy li xi delivery channel label for read-only redemption rows. */
function deliveryModeLabel(mode: "station" | "link") {
	return mode === "station" ? "Trạm chơi" : "Liên kết công khai";
}

/** Backend keeps the key "legacy" + label "li xi (legacy)"; the UI names it
 * in Vietnamese instead (§10.5) while convex and the fixture keep the key. */
const channelLabel = (row: { key: string; label: string }) =>
	row.key === "legacy" ? "Li xì chưa gắn kênh" : row.label;

/** Narrow-screen affordance for data grids that scroll horizontally. */
function TableScrollHint({ inset = false }: { inset?: boolean }) {
	return (
		<p
			className={
				inset
					? "flex items-center gap-1.5 px-4 pb-3 text-xs text-muted lg:hidden"
					: "flex items-center gap-1.5 text-xs text-muted lg:hidden"
			}
		>
			<MoveHorizontal aria-hidden="true" size={14} />
			Vuốt ngang bảng để xem các cột còn lại
		</p>
	);
}

/** One overview ranked card (§11.5.2): title, optional "Xem chi tiết" link,
 * and a share-bar list — or the shared empty sentence when no rows. */
function RankCard({
	label,
	linkView,
	rows,
	title,
}: {
	label: string;
	linkView?: "games" | "channels";
	rows: ShareBarRow[];
	title: string;
}) {
	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>{title}</Widget.Title>
				{linkView ? (
					<Link
						className={sectionActionLinkClass}
						search={(previous) => ({ ...previous, view: linkView })}
						to="/analytics"
					>
						Xem chi tiết
						<ArrowRight aria-hidden="true" size={14} />
					</Link>
				) : null}
			</Widget.Header>
			<Widget.Content>
				{rows.length === 0 ? (
					<p className="text-sm leading-5 text-muted">Chưa có dữ liệu.</p>
				) : (
					<ShareBars label={label} rateLabel="Chuyển đổi" rows={rows} valueLabel="Lượt mở" />
				)}
			</Widget.Content>
		</Widget>
	);
}

/** One stat in an `.admin-stats` row, with an optional muted step note. */
function StatItem({ label, note, value }: { label: string; note?: string; value: ReactNode }) {
	return (
		<div>
			<dt>{label}</dt>
			<dd>{value}</dd>
			{note ? <dd className="admin-stats__note">{note}</dd> : null}
		</div>
	);
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

	// Deep links (e.g. /analytics?view=claims on a phone) must land with the
	// active tab scrolled into the tab strip's horizontal overflow. The strip
	// may not be scrollable on the first frames (late stylesheet/font layout),
	// so retry until the overflow container exists.
	useEffect(() => {
		let raf = 0;
		let attempts = 0;
		const alignSelectedTab = () => {
			const tab = document.querySelector<HTMLElement>('[role="tab"][data-selected="true"]');
			const list = tab?.closest<HTMLElement>('[role="tablist"]');
			if (list && tab) {
				if (list.scrollWidth > list.clientWidth) {
					list.scrollLeft = Math.min(
						Math.max(0, tab.offsetLeft - list.clientLeft),
						list.scrollWidth - list.clientWidth,
					);
					return;
				}
				if (attempts++ < 20) {
					raf = requestAnimationFrame(alignSelectedTab);
				}
			}
		};
		raf = requestAnimationFrame(alignSelectedTab);
		return () => cancelAnimationFrame(raf);
	}, [search.view]);

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
	const campaignGameBreakdown = useQuery(
		api.analytics.getCampaignGameBreakdown,
		owner ? (selectedCampaignId ? { campaignId: selectedCampaignId } : {}) : "skip",
	);
	const campaignChannelBreakdown = useQuery(
		api.analytics.getCampaignChannelBreakdown,
		owner ? (selectedCampaignId ? { campaignId: selectedCampaignId } : {}) : "skip",
	);
	const campaignShareLinkBreakdown = useQuery(
		api.analytics.getCampaignShareLinkBreakdown,
		owner ? (selectedCampaignId ? { campaignId: selectedCampaignId } : {}) : "skip",
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
	const averageReward =
		history.length > 0 ? Math.round(totalRedeemed / history.length) : 0;
	const rarityBreakdown = (["common", "rare", "legend"] as const).map(
		(rarity) => {
			const items = history.filter((item) => item.rarity === rarity);

			return {
				label: RARITY_LABELS[rarity],
				rarity,
				redemptions: items.length,
			};
		},
	);
	const hasRarityBreakdown = rarityBreakdown.some(
		(item) => item.redemptions > 0,
	);
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
			description: "Phân tích kết quả phần thưởng, giá trị và lịch sử trao thưởng.",
			title: "Hiệu quả phần thưởng",
		},
		channels: {
			description: "Đo hiệu quả liên kết chơi công khai và các kênh phân phối.",
			title: "Hiệu quả kênh chia sẻ",
		},
		claims: {
			description: "Theo dõi và trao phần thưởng cho người chơi theo từng chiến dịch.",
			title: "Hàng đợi trao thưởng",
		},
	}[search.view];
	/** Sorted nulls first, so "—" rows group below every measured row. */
	const rateSortValue = (rate: number | null) => (rate === null ? -1 : rate);
	const gameTemplateBadgeLabel = (templateId: string | null) =>
		templateId
			? gameTemplates[templateId as keyof typeof gameTemplates]?.name ?? templateId
			: "Không rõ mẫu";
	type GameBreakdownRow = NonNullable<typeof campaignGameBreakdown>["rows"][number];
	type ChannelBreakdownRow = NonNullable<typeof campaignChannelBreakdown>["rows"][number];
	type ShareLinkBreakdownRow = NonNullable<typeof campaignShareLinkBreakdown>["rows"][number];
	const allScope = !selectedCampaignId;
	const campaignNameById = new Map(
		workspace.campaigns.map((campaign) => [campaign.id, campaign.name]),
	);
	/** Meta line under a game name: template label (when renamed) and, in
	 * the all-campaign scope, the owning campaign. */
	const gameMeta = (row: GameBreakdownRow) => {
		const label = gameTemplateBadgeLabel(row.gameTemplateId);
		const name = row.gameName ?? "Trò chơi";
		return (
			[
				label !== name ? label : null,
				allScope ? campaignNameById.get(row.campaignId) ?? null : null,
			]
				.filter((part): part is string => part !== null)
				.join(" · ") || null
		);
	};
	const funnelColumns = <Row extends { opens: number; claims: number }>(
		labels: Array<{ id: keyof Row & string; header: string }>,
	): DataGridColumn<Row>[] => [
		...labels.map<DataGridColumn<Row>>((label) => ({
			align: "end",
			allowsSorting: true,
			cell: (item) => (
				<NumberValue
					className="tabular-nums text-foreground"
					maximumFractionDigits={0}
					value={item[label.id] as number}
				/>
			),
			header: label.header,
			id: label.id,
			minWidth: 88,
			sortFn: (a, b) => (a[label.id] as number) - (b[label.id] as number),
		})),
		{
			align: "end",
			allowsSorting: true,
			cell: (item) => <RateBar rate={conversionRate(item)} />,
			header: "Chuyển đổi",
			id: "conversion",
			minWidth: 132,
			sortFn: (a, b) => rateSortValue(conversionRate(a)) - rateSortValue(conversionRate(b)),
		},
	];
	const gameBreakdownColumns: DataGridColumn<GameBreakdownRow>[] = [
		{
			cell: (item) => {
				const name = item.gameName ?? "Trò chơi";
				const meta = gameMeta(item);
				const known = Boolean(
					item.gameTemplateId && gameTemplates[item.gameTemplateId as GameTemplateId],
				);
				return (
					<span className="flex min-w-0 items-center gap-3">
						<span className="admin-icon-tile">
							{known && item.gameTemplateId ? (
								<GameTemplateIcon templateId={item.gameTemplateId as GameTemplateId} />
							) : (
								<Gamepad2 aria-hidden="true" size={20} />
							)}
						</span>
						<span className="flex min-w-0 flex-col">
							<span className="truncate font-medium text-foreground">{name}</span>
							{meta ? <span className="truncate text-xs text-muted">{meta}</span> : null}
						</span>
					</span>
				);
			},
			header: "Trò chơi",
			id: "game",
			isRowHeader: true,
			minWidth: 220,
			// Names share the flexible rest three-to-one against the number
			// columns, so nothing truncates at 1440 (§11.6.6/Q11).
			width: "3fr",
		},
		...funnelColumns<GameBreakdownRow>([
			{ header: "Mở", id: "opens" },
			{ header: "Bắt đầu", id: "starts" },
			{ header: "Hoàn tất", id: "completions" },
			{ header: "Kết quả", id: "rewardOutcomes" },
			{ header: "Nhận thưởng", id: "claims" },
		]),
	];
	const channelBreakdownColumns: DataGridColumn<ChannelBreakdownRow>[] = [
		{
			cell: (item) => (
				<span className="truncate font-medium text-foreground">{channelLabel(item)}</span>
			),
			header: "Kênh",
			id: "channel",
			isRowHeader: true,
			minWidth: 160,
		},
		...funnelColumns<ChannelBreakdownRow>([
			{ header: "Mở", id: "opens" },
			{ header: "Bắt đầu", id: "starts" },
			{ header: "Hoàn tất", id: "completions" },
			{ header: "Kết quả", id: "rewardOutcomes" },
			{ header: "Nhận thưởng", id: "claims" },
		]),
	];
	const shareLinkBreakdownColumns: DataGridColumn<ShareLinkBreakdownRow>[] = [
		{
			cell: (item) => (
				<span className="flex min-w-0 flex-col items-start gap-1">
					<span className="truncate font-medium text-foreground">{item.label ?? "Liên kết"}</span>
					<span className="truncate text-xs text-muted">Kênh: {item.channel}</span>
				</span>
			),
			header: "Liên kết",
			id: "link",
			isRowHeader: true,
			minWidth: 160,
		},
		{
			align: "end",
			allowsSorting: true,
			cell: (item) => (
				<NumberValue
					className="tabular-nums text-foreground"
					maximumFractionDigits={0}
					value={item.linkOpens}
				/>
			),
			header: "Lượt truy cập",
			id: "linkOpens",
			minWidth: 88,
			sortFn: (a, b) => a.linkOpens - b.linkOpens,
		},
		...funnelColumns<ShareLinkBreakdownRow>([
			{ header: "Mở trò chơi", id: "opens" },
			{ header: "Bắt đầu", id: "starts" },
			{ header: "Hoàn tất", id: "completions" },
			{ header: "Kết quả", id: "rewardOutcomes" },
			{ header: "Nhận thưởng", id: "claims" },
		]),
	];
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
					{item.deliveryMode ? (
						<Chip className="w-fit" size="sm" variant="soft">
							{deliveryModeLabel(item.deliveryMode)}
						</Chip>
					) : null}
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
			minWidth: 150,
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
					{item.deliveryMode ? (
						<Chip className="w-fit" size="sm" variant="soft">
							{deliveryModeLabel(item.deliveryMode)}
						</Chip>
					) : null}
				</span>
			),
			header: "Chiến dịch",
			id: "campaign",
			minWidth: 170,
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
			minWidth: 100,
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
			minWidth: 110,
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
			minWidth: 100,
			sortFn: (a, b) => a.createdAt - b.createdAt,
		},
	];
	const gameMetrics = analytics.gameMetrics;
	/** Overview rank rows (§11.5.2): one ShareBars row per campaign, summed
	 * from the game breakdown; callers sort by opens and cap the list. */
	const rowsByCampaign = groupRowsByCampaign(campaignGameBreakdown?.rows ?? []);
	const campaignShareRows =
		campaignGameBreakdown && campaignChannelBreakdown && allScope
			? workspace.campaigns
					.map((campaign) => {
						const rows = rowsByCampaign.get(campaign.id) ?? [];
						const totals = sumFunnelRows(rows);
						return {
							key: campaign.id,
							meta: `${rows.length} trò chơi`,
							name: campaign.name,
							rate: conversionRate(totals),
							value: totals.opens,
						};
					})
					.sort((a, b) => b.value - a.value)
					.slice(0, 5)
			: [];
	const gameShareRows = [...(campaignGameBreakdown?.rows ?? [])]
		.sort((a, b) => b.opens - a.opens)
		.slice(0, 5)
		.map((row) => ({
			key: row.campaignGameId,
			meta: gameMeta(row),
			name: row.gameName ?? "Trò chơi",
			rate: conversionRate(row),
			value: row.opens,
		}));
	const channelShareRows = [...(campaignChannelBreakdown?.rows ?? [])]
		.sort((a, b) => b.opens - a.opens)
		.map((row) => ({
			key: row.key,
			name: channelLabel(row),
			rate: conversionRate(row),
			value: row.opens,
		}));
	const rarityShareRows = rarityBreakdown.map((item) => ({
		key: item.rarity,
		name: item.label,
		rate: history.length > 0 ? item.redemptions / history.length : 0,
		value: item.redemptions,
	}));

	return (
		<AdminPageShell
			actions={
				<NativeSelect className="admin-control--sm" variant="secondary">
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
				</NativeSelect>
			}
			description={viewCopy.description}
			tabs={
				<Tabs
					className="admin-view-tabs"
					selectedKey={search.view}
					variant="secondary"
					onSelectionChange={(key) => void navigate({ to: "/analytics", search: (previous) => ({ ...previous, view: String(key) as "overview" | "games" | "rewards" | "channels" | "claims" }) })}
				>
						<Tabs.ListContainer>
							<Tabs.List aria-label="Góc nhìn phân tích">
								<Tabs.Tab className="min-w-max" id="overview">Tổng quan<Tabs.Indicator /></Tabs.Tab>
								<Tabs.Tab className="min-w-max" id="games">Trò chơi<Tabs.Indicator /></Tabs.Tab>
								<Tabs.Tab className="min-w-max" id="rewards">Phần thưởng<Tabs.Indicator /></Tabs.Tab>
								<Tabs.Tab className="min-w-max" id="channels">Kênh chia sẻ<Tabs.Indicator /></Tabs.Tab>
								<Tabs.Tab className="min-w-max" id="claims">Trao thưởng<Tabs.Indicator /></Tabs.Tab>
							</Tabs.List>
						</Tabs.ListContainer>
				</Tabs>
			}
			title={viewCopy.title}
		>
			{search.view === "claims" ? (
				selectedCampaign ? (
					<RewardClaimsPanel campaignId={selectedCampaign.id} />
				) : (
					<EmptyState size="sm">
						<EmptyState.Header>
							<EmptyState.Media variant="icon">
								<Ticket aria-hidden="true" size={22} strokeWidth={2} />
							</EmptyState.Media>
							<EmptyState.Title>Chọn một chiến dịch để xem hàng đợi</EmptyState.Title>
							<EmptyState.Description>
								Hàng đợi trao thưởng được xem theo từng chiến dịch.
							</EmptyState.Description>
						</EmptyState.Header>
						<EmptyState.Content>
							<div className="flex flex-wrap justify-center gap-2">
								{workspace.campaigns.slice(0, 6).map((campaign) => (
									<Button
										key={campaign.id}
										size="sm"
										variant="secondary"
										onPress={() =>
											void navigate({
												to: "/analytics",
												search: { campaign: campaign.id, view: "claims" },
											})
										}
									>
										{campaign.name}
									</Button>
								))}
							</div>
						</EmptyState.Content>
					</EmptyState>
				)
			) : (
				<>
					{search.view === "overview" ? (
						<>
							<Widget>
								<Widget.Header>
									<div>
										<Widget.Title>Phễu chuyển đổi</Widget.Title>
										<Widget.Description>
											{selectedCampaign?.name ?? "Tất cả chiến dịch"}
										</Widget.Description>
									</div>
								</Widget.Header>
								<Widget.Content>
									{gameMetrics.opens === 0 && gameMetrics.starts === 0 ? (
										<p className="text-sm leading-5 text-muted">
											Chưa có lượt chơi nào trong phạm vi này.
										</p>
									) : (
										<PerformanceSummary funnelLabel="Phễu chuyển đổi" metrics={gameMetrics} />
									)}
								</Widget.Content>
							</Widget>
							{campaignGameBreakdown && campaignChannelBreakdown ? (
								<div className={allScope ? "admin-rank-grid admin-rank-grid--3" : "admin-rank-grid"}>
									{allScope ? (
										<RankCard
											label="Chiến dịch theo lượt mở"
											rows={campaignShareRows}
											title="Chiến dịch"
										/>
									) : null}
									<RankCard
										label="Trò chơi theo lượt mở"
										linkView="games"
										rows={gameShareRows}
										title="Trò chơi"
									/>
									<RankCard
										label="Kênh theo lượt mở"
										linkView="channels"
										rows={channelShareRows}
										title="Kênh"
									/>
								</div>
							) : null}
						</>
					) : null}
					{search.view === "games" && campaignGameBreakdown ? (
						<Widget>
							<Widget.Header>
								<div>
									<Widget.Title>Phân tích theo trò chơi</Widget.Title>
									<Widget.Description>
										Phễu chơi và chuyển đổi của từng trò chơi trong phạm vi đang chọn.
									</Widget.Description>
								</div>
							</Widget.Header>
							{campaignGameBreakdown.rows.length === 0 ? (
								<Widget.Content>
									<EmptyState size="sm">
										<EmptyState.Header>
											<EmptyState.Media variant="icon">
												<Gamepad2 aria-hidden="true" size={22} strokeWidth={2} />
											</EmptyState.Media>
											<EmptyState.Title>Chưa có trò chơi nào</EmptyState.Title>
											<EmptyState.Description>
												Thêm trò chơi vào chiến dịch để xem phân tích theo trò chơi.
											</EmptyState.Description>
										</EmptyState.Header>
									</EmptyState>
								</Widget.Content>
								) : (
									<Widget.Content className="admin-grid-section">
									<DataGrid
										allowsColumnResize
										aria-label="Bảng phân tích theo trò chơi"
										columns={gameBreakdownColumns}
										contentClassName="min-w-[760px]"
										data={campaignGameBreakdown.rows}
										defaultSortDescriptor={{ column: "opens", direction: "descending" }}
										getRowId={(item) => item.campaignGameId}
										scrollContainerClassName="max-h-[560px] overflow-auto"
										variant="secondary"
									/>
										<TableScrollHint inset />
									</Widget.Content>
								)}
						</Widget>
					) : null}
					{search.view === "channels" && campaignChannelBreakdown ? (
						<Widget>
							<Widget.Header>
								<div>
									<Widget.Title>Phân tích theo kênh</Widget.Title>
									<Widget.Description>
										So sánh liên kết công khai và trạm chơi; lượt li xì chưa gắn kênh được hiển thị riêng.
									</Widget.Description>
								</div>
							</Widget.Header>
							<Widget.Content className="admin-grid-section">
								<DataGrid
									allowsColumnResize
									aria-label="Bảng phân tích theo kênh"
									columns={channelBreakdownColumns}
									contentClassName="min-w-[700px]"
									data={campaignChannelBreakdown.rows}
									defaultSortDescriptor={{ column: "opens", direction: "descending" }}
									getRowId={(item) => item.key}
									scrollContainerClassName="max-h-[420px] overflow-auto"
									variant="secondary"
								/>
								<TableScrollHint inset />
							</Widget.Content>
						</Widget>
					) : null}
					{search.view === "channels" && campaignShareLinkBreakdown ? (
						<Widget>
							<Widget.Header>
								<div>
									<Widget.Title>Liên kết chia sẻ</Widget.Title>
									<Widget.Description>
										{`${viNumberFormat.format(gameMetrics.channelSharePerformance.publicPlayLinkOpens)} lượt truy cập qua liên kết công khai. Lượt li xì chưa gắn kênh không nằm trong bảng này.`}
									</Widget.Description>
								</div>
							</Widget.Header>
							{campaignShareLinkBreakdown.rows.length === 0 ? (
								<Widget.Content>
									<EmptyState size="sm">
										<EmptyState.Header>
											<EmptyState.Media variant="icon">
												<Link2 aria-hidden="true" size={22} strokeWidth={2} />
											</EmptyState.Media>
											<EmptyState.Title>Chưa có liên kết chia sẻ</EmptyState.Title>
											<EmptyState.Description>
												Tạo liên kết chơi trong chiến dịch để theo dõi hiệu quả từng kênh phân phối.
											</EmptyState.Description>
										</EmptyState.Header>
									</EmptyState>
								</Widget.Content>
							) : (
								<Widget.Content className="admin-grid-section">
									<DataGrid
										allowsColumnResize
										aria-label="Bảng liên kết chia sẻ"
										columns={shareLinkBreakdownColumns}
										contentClassName="min-w-[840px]"
										data={campaignShareLinkBreakdown.rows}
										defaultSortDescriptor={{ column: "opens", direction: "descending" }}
										getRowId={(item) => item.shareLinkId}
										scrollContainerClassName="max-h-[420px] overflow-auto"
										variant="secondary"
									/>
									<TableScrollHint inset />
								</Widget.Content>
							)}
						</Widget>
					) : null}
					{search.view === "rewards" ? (
						<>
							<Widget>
								<Widget.Content>
									<dl className="admin-stats">
										<StatItem label="Kết quả phần thưởng" value={viNumberFormat.format(gameMetrics.rewardOutcomes)} />
										<StatItem label="Lượt nhận thưởng" value={viNumberFormat.format(gameMetrics.claims)} />
										<StatItem
											label="Tỉ lệ nhận thưởng"
											note="Nhận thưởng / kết quả phần thưởng"
											value={formatPercent(
												gameMetrics.rewardOutcomes > 0
													? gameMetrics.claims / gameMetrics.rewardOutcomes
													: null,
											)}
										/>
									</dl>
								</Widget.Content>
							</Widget>
							<Widget>
								<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
									<div>
										<Widget.Title>Trao thưởng {gameTemplates["li-xi"].name}</Widget.Title>
									<Widget.Description>
										Chỉ gồm lượt trao từ trò chơi dùng ngân sách tiền mặt.
									</Widget.Description>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Link
										className={buttonVariants({ size: "sm", variant: "secondary" })}
										to="/campaigns"
									>
										Chiến dịch
									</Link>
									{operationCampaignGameId ? (
										<Link
											className={buttonVariants({ size: "sm", variant: "secondary" })}
											params={{ campaignGameId: operationCampaignGameId }}
											to="/operate/$campaignGameId"
										>
											Vận hành trò chơi
										</Link>
									) : null}
								</div>
							</Widget.Header>
							<Widget.Content className="admin-stack">
								<dl className="admin-stats">
									<StatItem label="Lượt trao thưởng" value={viNumberFormat.format(history.length)} />
									<StatItem
										label="Giá trị đã trao"
										value={
											<NumberValue
												currency="VND"
												maximumFractionDigits={0}
												style="currency"
												value={totalRedeemed}
											/>
										}
									/>
									<StatItem
										label="Giá trị trung bình"
										value={
											<NumberValue
												currency="VND"
												maximumFractionDigits={0}
												style="currency"
												value={averageReward}
											/>
										}
									/>
									<StatItem label="Phần thưởng huyền thoại" value={viNumberFormat.format(legendCount)} />
								</dl>
								<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
									<div className="min-w-0">
										<Tabs
											selectedKey={recordsView}
											variant="secondary"
											onSelectionChange={(key) => setRecordsView(String(key) === "history" ? "history" : "leaderboard")}
										>
											<Tabs.ListContainer>
												<Tabs.List aria-label="Cách xem dữ liệu trao thưởng">
													<Tabs.Tab className="min-w-max" id="leaderboard">
														Giá trị thưởng cao nhất
														<Tabs.Indicator />
													</Tabs.Tab>
													<Tabs.Tab className="min-w-max" id="history">
														Lịch sử gần đây
														<Tabs.Indicator />
													</Tabs.Tab>
												</Tabs.List>
											</Tabs.ListContainer>
										</Tabs>
										{recordsView === "leaderboard" ? (
											leaderboard.length === 0 ? (
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
											) : (
												<div>
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
													<TableScrollHint inset />
												</div>
											)
										) : history.length === 0 ? (
											<EmptyState size="sm">
												<EmptyState.Header>
													<EmptyState.Media variant="icon">
														<History aria-hidden="true" size={22} strokeWidth={2} />
													</EmptyState.Media>
													<EmptyState.Title>Chưa có lịch sử trao thưởng</EmptyState.Title>
													<EmptyState.Description>
														Lịch sử trao thưởng sẽ được ghi theo từng chiến dịch.
													</EmptyState.Description>
												</EmptyState.Header>
											</EmptyState>
										) : (
											<div>
												<DataGrid
													allowsColumnResize
													aria-label="Lịch sử trao thưởng gần đây"
													columns={historyColumns}
													contentClassName="min-w-[660px]"
													data={history}
													defaultSortDescriptor={{ column: "time", direction: "descending" }}
													getRowId={(item) => item.id}
													scrollContainerClassName="max-h-[560px] overflow-auto"
													variant="secondary"
												/>
												<TableScrollHint inset />
											</div>
										)}
									</div>
									<div className="flex min-w-0 flex-col gap-3">
										<h2 className="text-base font-semibold leading-6">Cơ cấu phần thưởng</h2>
										{hasRarityBreakdown ? (
											<ShareBars
												label="Cơ cấu phần thưởng theo độ hiếm"
												rateLabel="Tỉ trọng"
												rows={rarityShareRows}
												valueLabel="Lượt trao"
											/>
										) : (
											<EmptyState size="sm">
												<EmptyState.Header>
													<EmptyState.Media variant="icon">
														<BarChart3 aria-hidden="true" size={22} strokeWidth={2} />
													</EmptyState.Media>
													<EmptyState.Title>Chưa có dữ liệu cơ cấu phần thưởng</EmptyState.Title>
													<EmptyState.Description>
														Cơ cấu sẽ xuất hiện sau lượt trao thưởng đầu tiên.
													</EmptyState.Description>
												</EmptyState.Header>
											</EmptyState>
										)}
									</div>
								</div>
							</Widget.Content>
						</Widget>
						</>
					) : null}
				</>
			)}
		</AdminPageShell>
	);
}
