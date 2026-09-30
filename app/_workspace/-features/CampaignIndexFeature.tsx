"use client";

import { Chip, Spinner, buttonVariants } from "@heroui/react";
import { EmptyState, ItemCard, ItemCardGroup } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Gamepad2, Plus } from "lucide-react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { campaignAudienceTagLabels, type CampaignAudienceTag } from "@/lib/brandIdentity";

export function CampaignIndexFeature() {
	const workspace = useQuery(api.campaigns.getWorkspace, {});
	const statusLabels = { active: "Đang chạy", archived: "Đã lưu trữ", draft: "Bản nháp" } as const;

	if (workspace === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải danh sách chiến dịch" /></div>;
	}

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
				<ItemCardGroup aria-label="Danh sách chiến dịch" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" variant="secondary">
					{workspace.campaigns.map((campaign) => (
						<Link className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" key={campaign.id} params={{ campaignId: campaign.id }} to="/campaigns/$campaignId">
						<ItemCard variant="secondary">
							<ItemCard.Icon>
								{campaign.logoAsset?.url ? (
									<img
										alt={`Logo ${campaign.name}`}
										className="size-10 rounded-lg border border-border bg-surface-secondary object-contain"
										src={campaign.logoAsset.url}
									/>
								) : (
									<Gamepad2 aria-hidden="true" />
								)}
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>
									{campaign.brandColor ? (
										<span
											aria-hidden="true"
											className="mr-2 inline-block size-3 rounded-full border border-border align-middle"
											style={{ background: campaign.brandColor }}
										/>
									) : null}
									{campaign.name}
								</ItemCard.Title>
								<ItemCard.Description>{campaign.brandName || campaign.description || `/${campaign.slug}`}</ItemCard.Description>
								{campaign.audienceTags.length > 0 ? (
									<div className="mt-2 flex flex-wrap gap-1">
										{campaign.audienceTags.map((tag) => (
											<Chip key={tag} variant="soft">
												{campaignAudienceTagLabels[tag as CampaignAudienceTag] ?? tag}
											</Chip>
										))}
									</div>
								) : null}
							</ItemCard.Content>
							<ItemCard.Action><Chip color={campaign.status === "active" ? "success" : "default"} variant="soft">{statusLabels[campaign.status]}</Chip></ItemCard.Action>
						</ItemCard>
						</Link>
					))}
				</ItemCardGroup>
			)}
		</AdminPageShell>
	);
}
