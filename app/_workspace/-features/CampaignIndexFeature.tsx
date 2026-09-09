"use client";

import { Chip, Spinner } from "@heroui/react";
import { EmptyState, ItemCard, ItemCardGroup } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Gamepad2, Plus } from "lucide-react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";

export function CampaignIndexFeature() {
	const workspace = useQuery(api.campaigns.getWorkspace, {});
	const statusLabels = { active: "Đang chạy", archived: "Đã lưu trữ", draft: "Bản nháp" } as const;

	if (workspace === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải danh sách chiến dịch" /></div>;
	}

	return (
		<AdminPageShell
			actions={<Link className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground" to="/campaigns/new"><Plus aria-hidden="true" size={16} />Tạo chiến dịch</Link>}
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
					<EmptyState.Content><Link className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground" to="/campaigns/new">Tạo chiến dịch</Link></EmptyState.Content>
				</EmptyState>
			) : (
				<ItemCardGroup aria-label="Danh sách chiến dịch" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" variant="secondary">
					{workspace.campaigns.map((campaign) => (
						<Link className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" key={campaign.id} params={{ campaignId: campaign.id }} to="/campaigns/$campaignId">
						<ItemCard variant="secondary">
							<ItemCard.Icon><Gamepad2 aria-hidden="true" /></ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>{campaign.name}</ItemCard.Title>
								<ItemCard.Description>{campaign.brandName || campaign.description || `/${campaign.slug}`}</ItemCard.Description>
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
