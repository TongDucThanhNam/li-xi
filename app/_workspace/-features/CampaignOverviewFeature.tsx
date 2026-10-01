"use client";

import { Chip, Spinner } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { FileQuestion } from "lucide-react";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { CampaignOverviewSummary } from "@/app/_workspace/-features/CampaignOverviewSummary";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const statusLabels = {
	active: "Đang chạy",
	archived: "Đã lưu trữ",
	draft: "Bản nháp",
} as const;

/**
 * Campaign dashboard (workspace UX redesign §11.2.2/R1): object state and
 * results only. Editing lives on /campaigns/$campaignId/settings.
 */
export function CampaignOverviewFeature({ campaignId }: { campaignId: string }) {
	const campaign = useQuery(api.campaigns.getCampaignRouteContext, { campaignId: campaignId as Id<"campaigns"> });

	if (campaign === undefined) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải tổng quan chiến dịch" /></div>;
	if (!campaign) return <AdminPageShell title="Không tìm thấy chiến dịch"><EmptyState><EmptyState.Header><EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media><EmptyState.Title>Không tìm thấy chiến dịch</EmptyState.Title><EmptyState.Description>Chiến dịch không tồn tại hoặc bạn không có quyền truy cập.</EmptyState.Description></EmptyState.Header><EmptyState.Content><Link to="/campaigns">Quay lại danh sách</Link></EmptyState.Content></EmptyState></AdminPageShell>;

	return (
		<AdminPageShell
			breadcrumbContext={campaign.name}
			description={campaign.description || undefined}
			status={<Chip color={campaign.status === "active" ? "success" : "default"} size="sm" variant="soft">{statusLabels[campaign.status]}</Chip>}
			tabs={<CampaignContextNav campaignId={campaignId} />}
			title={campaign.name}
		>
			<CampaignOverviewSummary campaign={campaign} />
		</AdminPageShell>
	);
}
