"use client";

import { Chip, Spinner, buttonVariants } from "@heroui/react";
import { EmptyState, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Gamepad2, Plus } from "lucide-react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { campaignAudienceTagLabels, type CampaignAudienceTag } from "@/lib/brandIdentity";
import { conversionRate, formatPercent, groupRowsByCampaign, sumFunnelRows } from "@/lib/campaignMetrics";

const viNumberFormat = new Intl.NumberFormat("vi-VN");

export function CampaignIndexFeature() {
	const workspace = useQuery(api.campaigns.getWorkspace, {});
	const breakdown = useQuery(api.analytics.getCampaignGameBreakdown, {});
	const statusLabels = { active: "Đang chạy", archived: "Đã lưu trữ", draft: "Bản nháp" } as const;

	if (workspace === undefined || breakdown === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải danh sách chiến dịch" /></div>;
	}

	// Every owner game carries its campaignId (§11.2.1): the card count is
	// the row count, the card funnel is the row sum.
	const rowsByCampaign = groupRowsByCampaign(breakdown.rows);
	const totalFunnel = sumFunnelRows(breakdown.rows);

	return (
		<AdminPageShell
			actions={<Link className={buttonVariants({ variant: "primary" })} to="/campaigns/new"><Plus aria-hidden="true" size={16} />Tạo chiến dịch</Link>}
			description="Theo dõi trạng thái và mở đúng ngữ cảnh vận hành của từng chiến dịch."
			title="Chiến dịch"
		>
			{workspace.campaigns.length === 0 ? (
				<EmptyState>
					<EmptyState.Header>
						<EmptyState.Media variant="icon"><Gamepad2 aria-hidden="true" /></EmptyState.Media>
						<EmptyState.Title>Chưa có chiến dịch</EmptyState.Title>
						<EmptyState.Description>Tạo chiến dịch đầu tiên và chọn mẫu trò chơi đã đăng ký.</EmptyState.Description>
					</EmptyState.Header>
					<EmptyState.Content><Link className={buttonVariants({ variant: "primary" })} to="/campaigns/new">Tạo chiến dịch</Link></EmptyState.Content>
				</EmptyState>
			) : (
				<>
					<Widget>
						<Widget.Content>
							<dl className="admin-stats">
								<div>
									<dt>Chiến dịch đang chạy</dt>
									<dd>{viNumberFormat.format(workspace.campaigns.filter((campaign) => campaign.status === "active").length)}</dd>
								</div>
								<div>
									<dt>Lượt chơi</dt>
									<dd>{viNumberFormat.format(totalFunnel.starts)}</dd>
								</div>
								<div>
									<dt>Lượt nhận thưởng</dt>
									<dd>{viNumberFormat.format(totalFunnel.claims)}</dd>
								</div>
								<div>
									<dt>Tỉ lệ chuyển đổi</dt>
									<dd>{formatPercent(conversionRate(totalFunnel))}</dd>
									<dd className="admin-stats__note">Nhận thưởng trên lượt mở</dd>
								</div>
							</dl>
						</Widget.Content>
					</Widget>
					<ul aria-label="Danh sách chiến dịch" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{workspace.campaigns.map((campaign) => {
							const rows = rowsByCampaign.get(campaign.id) ?? [];
							const funnel = sumFunnelRows(rows);
							return (
								<li key={campaign.id}>
									<Link className="admin-campaign-card" params={{ campaignId: campaign.id }} to="/campaigns/$campaignId">
										<span aria-hidden="true" className="admin-campaign-card__cover" style={campaign.brandColor ? { backgroundColor: campaign.brandColor } : undefined} />
										<span className="admin-campaign-card__body">
											<span className="admin-campaign-card__head">
												{campaign.logoAsset?.url ? (
													<img alt={`Logo ${campaign.name}`} className="admin-campaign-card__logo" src={campaign.logoAsset.url} />
												) : (
													<span className="admin-campaign-card__logo admin-campaign-card__logo--icon"><Gamepad2 aria-hidden="true" size={22} /></span>
												)}
												<Chip color={campaign.status === "active" ? "success" : "default"} size="sm" variant="soft">{statusLabels[campaign.status]}</Chip>
											</span>
											<span className="admin-campaign-card__title">{campaign.name}</span>
											<span className="admin-campaign-card__meta">{campaign.brandName || `/${campaign.slug}`} · {rows.length} trò chơi</span>
											<span className="admin-campaign-card__metrics">
												<span><span>Lượt chơi</span><span>{viNumberFormat.format(funnel.starts)}</span></span>
												<span><span>Nhận thưởng</span><span>{viNumberFormat.format(funnel.claims)}</span></span>
												<span><span>Chuyển đổi</span><span>{formatPercent(conversionRate(funnel))}</span></span>
											</span>
											{campaign.audienceTags.length > 0 ? (
												<span className="flex flex-wrap gap-1.5">
													{campaign.audienceTags.map((tag) => (
														<Chip key={tag} size="sm" variant="soft">
															{campaignAudienceTagLabels[tag as CampaignAudienceTag] ?? tag}
														</Chip>
													))}
												</span>
											) : null}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</>
			)}
		</AdminPageShell>
	);
}
