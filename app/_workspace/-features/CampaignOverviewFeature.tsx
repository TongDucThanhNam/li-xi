"use client";

import { Alert, Button, Input, Label, Spinner, TextArea } from "@heroui/react";
import { EmptyState, NativeSelect, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileQuestion, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { UnsavedChangesGuard } from "@/app/_workspace/-components/UnsavedChangesGuard";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type OverviewDraft = {
	name: string;
	slug: string;
	brandName: string;
	description: string;
	status: "draft" | "active";
};

export function CampaignOverviewFeature({ campaignId }: { campaignId: string }) {
	const campaign = useQuery(api.campaigns.getCampaignRouteContext, { campaignId: campaignId as Id<"campaigns"> });
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const [draft, setDraft] = useState<OverviewDraft | null>(null);
	const [loadedCampaignId, setLoadedCampaignId] = useState("");
	const [baseline, setBaseline] = useState("");
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (!campaign || loadedCampaignId === campaign.id) return;
		const initial: OverviewDraft = { name: campaign.name, slug: campaign.slug, brandName: campaign.brandName, description: campaign.description, status: campaign.status === "active" ? "active" : "draft" };
		setDraft(initial);
		setBaseline(JSON.stringify(initial));
		setLoadedCampaignId(campaign.id);
		setFeedback("");
		setError("");
	}, [campaign, loadedCampaignId]);
	const dirty = useMemo(() => Boolean(draft && JSON.stringify(draft) !== baseline), [baseline, draft]);
	const save = useCallback(async () => {
		if (!campaign || !draft || draft.name.trim().length < 3) return false;
		setSaving(true); setError(""); setFeedback("");
		try {
			await saveCampaign({ campaignId: campaign.id, ...draft, theme: campaign.theme, gameTemplateId: campaign.gameTemplateId, gameConfig: campaign.gameConfig, heroAssetId: campaign.heroAsset?.id, claimHeadline: campaign.claimHeadline || undefined, claimSubtitle: campaign.claimSubtitle || undefined, claimCtaLabel: campaign.claimCtaLabel || undefined, claimCollectLabel: campaign.claimCollectLabel || undefined, claimWaitingMessage: campaign.claimWaitingMessage || undefined });
			setBaseline(JSON.stringify(draft)); setFeedback("Đã lưu thông tin chiến dịch"); return true;
		} catch (unknownError) { setError(unknownError instanceof Error ? unknownError.message : "Không thể lưu chiến dịch"); return false; }
		finally { setSaving(false); }
	}, [campaign, draft, saveCampaign]);

	if (campaign === undefined) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải tổng quan chiến dịch" /></div>;
	if (!campaign) return <AdminPageShell title="Không tìm thấy chiến dịch"><EmptyState><EmptyState.Header><EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media><EmptyState.Title>Không tìm thấy chiến dịch</EmptyState.Title><EmptyState.Description>Chiến dịch không tồn tại hoặc bạn không có quyền truy cập.</EmptyState.Description></EmptyState.Header><EmptyState.Content><Link to="/campaigns">Quay lại danh sách</Link></EmptyState.Content></EmptyState></AdminPageShell>;
	if (!draft || loadedCampaignId !== campaign.id) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang chuẩn bị biểu mẫu chiến dịch" /></div>;
	const update = <K extends keyof OverviewDraft>(key: K, value: OverviewDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);

	return (
		<AdminPageShell actions={<Button isDisabled={!dirty || draft.name.trim().length < 3} isPending={saving} onPress={save}><Save aria-hidden="true" />Lưu thay đổi</Button>} breadcrumbContext={campaign.name} description="Quản lý nhận diện, địa chỉ và trạng thái của hoạt động marketing." eyebrow={campaign.brandName || "Chiến dịch"} title={campaign.name}>
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={save} />
			{error || feedback ? <Alert status={error ? "danger" : "success"}><Alert.Indicator /><Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content></Alert> : null}
			<CampaignContextNav campaignId={campaignId} />
			{dirty ? <p className="mb-4 text-sm text-warning">Có thay đổi chưa lưu.</p> : null}
			<Widget className="max-w-3xl"><Widget.Header><Widget.Title>Thông tin chiến dịch</Widget.Title><Widget.Description>Các trường này mô tả chiến dịch trong không gian làm việc.</Widget.Description></Widget.Header><Widget.Content className="gap-4">
				<div className="admin-field"><Label htmlFor="campaign-overview-name">Tên chiến dịch</Label><Input fullWidth id="campaign-overview-name" value={draft.name} variant="secondary" onChange={(event) => update("name", event.currentTarget.value)} /></div>
				<div className="grid gap-4 md:grid-cols-2"><div className="admin-field"><Label htmlFor="campaign-overview-slug">Địa chỉ ngắn</Label><Input fullWidth id="campaign-overview-slug" value={draft.slug} variant="secondary" onChange={(event) => update("slug", event.currentTarget.value)} /></div><div className="admin-field"><Label htmlFor="campaign-overview-brand">Thương hiệu</Label><Input fullWidth id="campaign-overview-brand" value={draft.brandName} variant="secondary" onChange={(event) => update("brandName", event.currentTarget.value)} /></div></div>
				<div className="admin-field"><Label htmlFor="campaign-overview-description">Mô tả</Label><TextArea fullWidth id="campaign-overview-description" value={draft.description} variant="secondary" onChange={(event) => update("description", event.currentTarget.value)} /></div>
				<div className="admin-field"><Label htmlFor="campaign-overview-status">Trạng thái</Label><NativeSelect fullWidth variant="secondary"><NativeSelect.Trigger aria-label="Trạng thái chiến dịch" id="campaign-overview-status" value={draft.status} onChange={(event) => update("status", event.currentTarget.value as OverviewDraft["status"])}><NativeSelect.Option value="draft">Bản nháp</NativeSelect.Option><NativeSelect.Option value="active">Đang chạy</NativeSelect.Option><NativeSelect.Indicator /></NativeSelect.Trigger></NativeSelect></div>
			</Widget.Content></Widget>
		</AdminPageShell>
	);
}
