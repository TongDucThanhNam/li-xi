"use client";

import { Chip, ProgressBar, buttonVariants } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Circle, CircleCheck } from "lucide-react";
import { GameStatusChip } from "@/app/_workspace/-components/GameStatusChip";
import { GameTemplateIcon } from "@/app/_workspace/-components/GameTemplateIcon";
import { PerformanceSummary } from "@/app/_workspace/-components/PerformanceSummary";
import { api } from "@/convex/_generated/api";
import {
	gameTemplates as gameTemplateCatalog,
	configRewardSource,
	supportsSelfServeStationGame,
	type GameTemplateId,
} from "@/lib/gameTemplates";
import { conversionRate, formatPercent } from "@/lib/campaignMetrics";
import { resolveEffectiveGameStatus } from "@/lib/gameStatus";
import { rewardReadiness } from "@/lib/rewardReadiness";
import { campaignAudienceTagLabels, type CampaignAudienceTag } from "@/lib/brandIdentity";

export type CampaignOverviewCampaign = NonNullable<
	FunctionReturnType<typeof api.campaigns.getCampaignRouteContext>
>;
type CampaignGamesContext = NonNullable<
	FunctionReturnType<typeof api.campaigns.getCampaignGamesRouteContext>
>;
type CampaignGameEntry = CampaignGamesContext["campaignGames"][number];
type GameBreakdownRow = FunctionReturnType<
	typeof api.analytics.getCampaignGameBreakdown
>["rows"][number];
type SetupState = FunctionReturnType<typeof api.setup.getSetupState>;

const statusLabels = {
	active: "Đang chạy",
	archived: "Đã lưu trữ",
	draft: "Bản nháp",
} as const;

const viNumberFormat = new Intl.NumberFormat("vi-VN");
const vndFormat = new Intl.NumberFormat("vi-VN", {
	currency: "VND",
	maximumFractionDigits: 0,
	style: "currency",
});

const sectionActionLinkClass =
	"inline-flex items-center gap-1 rounded-sm text-sm font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * Campaign dashboard (workspace UX redesign §11.2.2): launch checklist with
 * a meter, a conversion KPI with funnel bars, per-game metrics and side
 * cards for rewards, distribution and brand. Each block renders only after
 * its data has loaded.
 */
export function CampaignOverviewSummary({
	campaign,
}: {
	campaign: CampaignOverviewCampaign;
}) {
	const campaignId = campaign.id;
	const gamesContext = useQuery(api.campaigns.getCampaignGamesRouteContext, { campaignId });
	const setupState = useQuery(api.setup.getSetupState, { campaignId });
	const inventory = useQuery(api.rewardInventory.getRewardInventory, { campaignId });
	const shareLinks = useQuery(api.shareLinks.listShareLinks, { campaignId });
	const analytics = useQuery(api.analytics.getCampaignAnalytics, { campaignId });
	const breakdown = useQuery(api.analytics.getCampaignGameBreakdown, { campaignId });

	const campaignGames = gamesContext?.campaignGames;
	const metrics = analytics?.gameMetrics;
	const checklistLoaded =
		gamesContext !== undefined &&
		setupState !== undefined &&
		inventory !== undefined &&
		shareLinks !== undefined &&
		analytics !== undefined;
	const rowsByGameId = new Map(
		(breakdown?.rows ?? []).map((row) => [row.campaignGameId, row]),
	);

	return (
		<>
			{checklistLoaded && campaignGames ? (
				<LaunchChecklist
					activeLinkCount={shareLinks.links.filter((link) => link.status === "active").length}
					campaign={campaign}
					campaignGames={campaignGames}
					hasSetup={setupState.hasSetup}
					inventoryCount={inventory.items.length}
					opens={metrics!.opens}
				/>
			) : null}
			{metrics ? (
				<Widget>
					<Widget.Header>
						<Widget.Title>Hiệu quả</Widget.Title>
						<Link
							className={sectionActionLinkClass}
							search={{ campaign: campaignId, view: "overview" }}
							to="/analytics"
						>
							Xem phân tích
							<ArrowRight aria-hidden="true" size={14} />
						</Link>
					</Widget.Header>
					<Widget.Content>
						{metrics.opens === 0 && metrics.starts === 0 ? (
							<p className="text-sm leading-5 text-muted">
								Chưa có lượt chơi. Dữ liệu xuất hiện sau khi người chơi mở liên kết hoặc trạm.
							</p>
						) : (
							<PerformanceSummary funnelLabel="Phễu chiến dịch" metrics={metrics} />
						)}
					</Widget.Content>
				</Widget>
			) : null}
			{campaignGames ? (
				<div className="admin-split admin-split--rail">
					<div className="admin-split__main">
						<Widget>
							<Widget.Header>
								<Widget.Title>Trò chơi</Widget.Title>
								<Link
									className={sectionActionLinkClass}
									params={{ campaignId }}
									to="/campaigns/$campaignId/games"
								>
									Quản lý trò chơi
									<ArrowRight aria-hidden="true" size={14} />
								</Link>
							</Widget.Header>
							<Widget.Content className="admin-stack">
								{campaignGames.length === 0 ? (
									<p className="text-sm leading-5 text-muted">Chưa có trò chơi.</p>
								) : (
									<>
										<p aria-hidden="true" className="admin-metric-head">
											<span>Trò chơi</span>
											<span>Lượt mở</span>
											<span>Hoàn tất</span>
											<span>Chuyển đổi</span>
										</p>
										<ul aria-label="Trò chơi của chiến dịch" className="admin-rows">
											{campaignGames.slice(0, 5).map((game) => (
												<CampaignGameMetricRow
													campaignGame={game}
													campaignId={campaignId}
													key={game.id}
													row={rowsByGameId.get(game.id)}
												/>
											))}
										</ul>
										{campaignGames.length > 5 ? (
											<p>
												<Link
													className={sectionActionLinkClass}
													params={{ campaignId }}
													to="/campaigns/$campaignId/games"
												>
													Xem tất cả {campaignGames.length} trò chơi
												</Link>
											</p>
										) : null}
									</>
								)}
							</Widget.Content>
						</Widget>
					</div>
					<div className="admin-split__side admin-split__side--cards">
						{setupState !== undefined && inventory !== undefined ? (
							<RewardsSideCard
								budget={setupState.budget}
								campaignId={campaignId}
								hasSetup={setupState.hasSetup}
								inventoryItems={inventory.items}
							/>
						) : null}
						{shareLinks !== undefined && metrics !== undefined ? (
							<DistributionSideCard
								activeLinkCount={shareLinks.links.filter((link) => link.status === "active").length}
								campaignGames={campaignGames}
								campaignId={campaignId}
								publicPlayLinkOpens={metrics.channelSharePerformance.publicPlayLinkOpens}
							/>
						) : null}
						<BrandSideCard campaign={campaign} />
					</div>
				</div>
			) : null}
		</>
	);
}

/** Overview game row (§11.2.2): name + one computed status chip, meta line
 * with the template name (when renamed) and window detail, per-game metrics
 * joined from the campaign game breakdown. Operating links live on the games
 * tab and distribution, not here. */
function CampaignGameMetricRow({
	campaignGame,
	campaignId,
	row,
}: {
	campaignGame: CampaignGameEntry;
	campaignId: string;
	row: GameBreakdownRow | undefined;
}) {
	const templateId = campaignGame.templateId as GameTemplateId;
	const status = resolveEffectiveGameStatus(campaignGame, Date.now());
	const metaParts = [
		gameTemplateCatalog[templateId].name !== campaignGame.name
			? gameTemplateCatalog[templateId].name
			: null,
		status.detail,
	].filter((part): part is string => part !== null);
	return (
		<li className="admin-metric-row">
			<Link
				className="admin-metric-row__link"
				params={{ campaignGameId: campaignGame.id, campaignId }}
				to="/campaigns/$campaignId/games/$campaignGameId"
			>
				<span className="admin-metric-row__name">
					<span className="admin-icon-tile">
						<GameTemplateIcon templateId={templateId} />
					</span>
					<span className="min-w-0">
						<span className="flex items-center gap-1.5">
							<span className="truncate text-sm font-medium text-foreground">{campaignGame.name}</span>
							<GameStatusChip status={status} />
						</span>
						{metaParts.length > 0 ? (
							<span className="block truncate text-xs text-muted">{metaParts.join(" · ")}</span>
						) : null}
					</span>
				</span>
				<span className="admin-metric-row__metrics">
					<span className="admin-metric-row__metric">
						<span className="admin-metric-row__metric-label">Lượt mở</span>
						<span className="admin-metric-row__metric-value">{viNumberFormat.format(row?.opens ?? 0)}</span>
					</span>
					<span className="admin-metric-row__metric">
						<span className="admin-metric-row__metric-label">Hoàn tất</span>
						<span className="admin-metric-row__metric-value">{viNumberFormat.format(row?.completions ?? 0)}</span>
					</span>
					<span className="admin-metric-row__metric">
						<span className="admin-metric-row__metric-label">Chuyển đổi</span>
						<span className="admin-metric-row__metric-value">
							{formatPercent(conversionRate({ opens: row?.opens ?? 0, claims: row?.claims ?? 0 }))}
						</span>
					</span>
				</span>
			</Link>
		</li>
	);
}

function RewardsSideCard({
	budget,
	campaignId,
	hasSetup,
	inventoryItems,
}: {
	budget: SetupState["budget"];
	campaignId: string;
	hasSetup: boolean;
	inventoryItems: Array<{ isActive: boolean; quantityRemaining: number; quantityTotal: number }>;
}) {
	const activeItems = inventoryItems.filter((item) => item.isActive);
	const remaining = activeItems.reduce((sum, item) => sum + item.quantityRemaining, 0);
	const total = activeItems.reduce((sum, item) => sum + item.quantityTotal, 0);
	const showStock = activeItems.length > 0;
	const showBudget = hasSetup && budget !== null;
	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>Phần thưởng</Widget.Title>
				<Link
					className={sectionActionLinkClass}
					params={{ campaignId }}
					to="/campaigns/$campaignId/rewards"
				>
					Quản lý
					<ArrowRight aria-hidden="true" size={14} />
				</Link>
			</Widget.Header>
			<Widget.Content className="flex flex-col gap-4">
				{showStock || showBudget ? null : (
					<p className="text-sm leading-5 text-muted">Chưa có phần thưởng.</p>
				)}
				{showStock ? (
					<div className="admin-usage__row">
						<div className="admin-usage__head">
							<span className="admin-usage__label">Kho quà</span>
							<span className="admin-usage__value">
								<strong>{viNumberFormat.format(remaining)}</strong> / {viNumberFormat.format(total)} còn lại
							</span>
						</div>
						<ProgressBar
							aria-label="Kho quà còn lại"
							color="accent"
							size="sm"
							value={total > 0 ? Math.round((remaining / total) * 100) : 0}
						>
							<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
						</ProgressBar>
						<p className="text-xs leading-4 text-muted">{viNumberFormat.format(activeItems.length)} loại phần thưởng</p>
					</div>
				) : null}
				{showBudget ? (
					<div className="admin-usage__row">
						<div className="admin-usage__head">
							<span className="admin-usage__label">Ngân sách lì xì</span>
							<span className="admin-usage__value">
								<strong>{vndFormat.format(budget.remainingBudget)}</strong> / {vndFormat.format(budget.totalBudget)}
							</span>
						</div>
						<ProgressBar
							aria-label="Ngân sách còn lại"
							color="accent"
							size="sm"
							value={budget.totalBudget > 0 ? Math.round((budget.remainingBudget / budget.totalBudget) * 100) : 0}
						>
							<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
						</ProgressBar>
					</div>
				) : null}
			</Widget.Content>
		</Widget>
	);
}

function DistributionSideCard({
	activeLinkCount,
	campaignGames,
	campaignId,
	publicPlayLinkOpens,
}: {
	activeLinkCount: number;
	campaignGames: CampaignGameEntry[];
	campaignId: string;
	publicPlayLinkOpens: number;
}) {
	const stationCount = campaignGames.filter(
		(game) =>
			(game.templateId === "li-xi" && configRewardSource(game.config) === "campaign-budget") ||
			supportsSelfServeStationGame(game.templateId, game.config),
	).length;
	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>Phân phối</Widget.Title>
				<Link
					className={sectionActionLinkClass}
					params={{ campaignId }}
					to="/campaigns/$campaignId/distribution"
				>
					Quản lý
					<ArrowRight aria-hidden="true" size={14} />
				</Link>
			</Widget.Header>
			<Widget.Content>
				<dl className="admin-kv">
					<div>
						<dt>Liên kết đang hoạt động</dt>
						<dd>{viNumberFormat.format(activeLinkCount)}</dd>
					</div>
					<div>
						<dt>Trò chơi tại quầy</dt>
						<dd>{viNumberFormat.format(stationCount)}</dd>
					</div>
					<div>
						<dt>Lượt mở qua liên kết</dt>
						<dd>{viNumberFormat.format(publicPlayLinkOpens)}</dd>
					</div>
				</dl>
			</Widget.Content>
		</Widget>
	);
}

function BrandSideCard({ campaign }: { campaign: CampaignOverviewCampaign }) {
	const hasMetadata =
		Boolean(campaign.logoAsset?.url) || Boolean(campaign.brandColor) || campaign.audienceTags.length > 0;
	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>Thương hiệu</Widget.Title>
				<Link
					className={sectionActionLinkClass}
					params={{ campaignId: campaign.id }}
					to="/campaigns/$campaignId/settings"
				>
					Chỉnh sửa
					<ArrowRight aria-hidden="true" size={14} />
				</Link>
			</Widget.Header>
			<Widget.Content>
				<div className="flex flex-col gap-3" data-testid="campaign-brand-metadata">
					{hasMetadata ? (
						<>
							<div className="flex items-center gap-3">
								{campaign.logoAsset?.url ? (
									<img
										alt="Logo chiến dịch"
										className="size-12 rounded-xl object-cover"
										src={campaign.logoAsset.url}
									/>
								) : null}
								{campaign.brandName || campaign.brandColor ? (
									<span className="flex min-w-0 flex-wrap items-center gap-2">
										{campaign.brandName ? (
											<span className="truncate text-sm font-medium text-foreground">{campaign.brandName}</span>
										) : null}
										{campaign.brandColor ? (
											<Chip variant="soft">
												<span
													aria-hidden="true"
													className="mr-1 inline-block size-3 rounded-full border border-border align-middle"
													style={{ background: campaign.brandColor }}
												/>
												Màu {campaign.brandColor.toUpperCase()}
											</Chip>
										) : null}
									</span>
								) : null}
							</div>
							{campaign.audienceTags.length > 0 ? (
								<span className="flex flex-wrap gap-1.5">
									{campaign.audienceTags.map((tag) => (
										<Chip key={tag} size="sm" variant="soft">
											{campaignAudienceTagLabels[tag as CampaignAudienceTag] ?? tag}
										</Chip>
									))}
								</span>
							) : null}
							{campaign.audienceNote ? (
								<p className="line-clamp-2 text-xs leading-4 text-muted">{campaign.audienceNote}</p>
							) : null}
						</>
					) : (
						<p className="text-sm leading-5 text-muted">Chưa có nhận diện thương hiệu nào được đặt.</p>
					)}
				</div>
			</Widget.Content>
		</Widget>
	);
}

function LaunchChecklist({
	activeLinkCount,
	campaign,
	campaignGames,
	hasSetup,
	inventoryCount,
	opens,
}: {
	activeLinkCount: number;
	campaign: CampaignOverviewCampaign;
	campaignGames: CampaignGameEntry[];
	hasSetup: boolean;
	inventoryCount: number;
	opens: number;
}) {
	const activeGames = campaignGames.filter((game) => game.status === "active");
	const readiness = rewardReadiness(campaignGames, { hasBudget: hasSetup, inventoryCount });
	const gamesDone = activeGames.length > 0;
	const rewardsDone = readiness.ready;
	const publishDone = activeLinkCount > 0 || opens > 0;
	const activateDone = campaign.status === "active";

	const steps: Array<{
		actionLabel: string;
		detail: string;
		done: boolean;
		title: string;
		to:
			| "/campaigns/$campaignId/games"
			| "/campaigns/$campaignId/rewards"
			| "/campaigns/$campaignId/distribution"
			| "/campaigns/$campaignId/settings";
	}> = [
		{
			title: "Trò chơi",
			done: gamesDone,
			detail: gamesDone
				? `${activeGames.length}/${campaignGames.length} trò chơi đang chạy.`
				: "Chưa có trò chơi nào đang chạy.",
			actionLabel: "Cấu hình trò chơi",
			to: "/campaigns/$campaignId/games",
		},
		{
			title: "Phần thưởng",
			done: rewardsDone,
			detail: rewardsDone
				? readiness.needsBudget || readiness.needsInventory
					? "Kho phần thưởng đã có dữ liệu."
					: "Các trò chơi đang chạy ở chế độ không thưởng."
				: "Chưa có phần thưởng cho trò chơi có thưởng.",
			actionLabel: "Thêm phần thưởng",
			to: "/campaigns/$campaignId/rewards",
		},
		{
			title: "Phát hành",
			done: publishDone,
			detail: publishDone
				? activeLinkCount > 0
					? `${activeLinkCount} liên kết chơi đang hoạt động.`
					: "Đã có người chơi tham gia."
				: "Chưa có liên kết chơi. Tạo liên kết hoặc mở trạm tại quầy.",
			actionLabel: "Tạo liên kết chơi",
			to: "/campaigns/$campaignId/distribution",
		},
		{
			title: "Kích hoạt",
			done: activateDone,
			detail: activateDone
				? "Chiến dịch đang chạy."
				: `Chiến dịch đang ở trạng thái ${statusLabels[campaign.status]}; người chơi chưa thể tham gia.`,
			actionLabel: "Kích hoạt chiến dịch",
			to: "/campaigns/$campaignId/settings",
		},
	];

	const doneCount = steps.filter((step) => step.done).length;
	if (doneCount === steps.length) return null;

	// R6: the first open step's action is the one filled primary button of
	// the checklist; every later open step stays secondary.
	const firstOpenIndex = steps.findIndex((step) => !step.done);

	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>Hoàn tất thiết lập</Widget.Title>
				<span className="text-sm tabular-nums text-muted">{doneCount}/4 bước</span>
			</Widget.Header>
			<Widget.Content>
				<div aria-hidden="true" className="admin-meter">
					{steps.map((step) => (
						<span data-done={step.done ? "true" : undefined} key={step.title} />
					))}
				</div>
				<ul className="admin-rows">
					{steps.map((step, index) => (
						<li className="admin-row flex-wrap" key={step.title}>
							{step.done ? (
								<CircleCheck aria-hidden="true" className="shrink-0 text-success" size={20} />
							) : (
								<Circle aria-hidden="true" className="shrink-0 text-muted" size={20} />
							)}
							<span className="admin-row__title sm:w-32">{step.title}</span>
							<span className="order-last min-w-0 grow basis-full text-sm leading-5 text-muted sm:order-none sm:basis-auto">
								{step.detail}
							</span>
							{step.done ? null : (
								<Link
									className={buttonVariants({
										size: "sm",
										variant: index === firstOpenIndex ? "primary" : "secondary",
									})}
									params={{ campaignId: campaign.id }}
									to={step.to}
								>
									{step.actionLabel}
								</Link>
							)}
						</li>
					))}
				</ul>
			</Widget.Content>
		</Widget>
	);
}
