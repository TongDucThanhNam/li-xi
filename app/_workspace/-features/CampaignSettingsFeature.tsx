"use client";

import { Alert, Button, Input, Label, Radio, RadioGroup, Spinner, TextArea } from "@heroui/react";
import { EmptyState, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileQuestion, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	CampaignBrandIdentityFields,
	type CampaignBrandIdentityDraft,
} from "@/app/_workspace/-components/CampaignBrandIdentityFields";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { UnsavedChangesGuard } from "@/app/_workspace/-components/UnsavedChangesGuard";
import { CampaignLogoField } from "@/app/_workspace/-features/CampaignLogoField";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { AdminSaveStatus } from "@/app/components/AdminSaveStatus";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type SettingsDraft = {
	name: string;
	slug: string;
	brandName: string;
	description: string;
	status: "draft" | "active";
	brand: CampaignBrandIdentityDraft;
};

/** Campaign settings (workspace UX redesign §11.2.3/R1): the overview's
 * rarely edited form moved to its own route, in three sections. */
export function CampaignSettingsFeature({ campaignId }: { campaignId: string }) {
	const campaign = useQuery(api.campaigns.getCampaignRouteContext, { campaignId: campaignId as Id<"campaigns"> });
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const [draft, setDraft] = useState<SettingsDraft | null>(null);
	const [loadedCampaignId, setLoadedCampaignId] = useState("");
	const [baseline, setBaseline] = useState("");
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (!campaign || loadedCampaignId === campaign.id) return;
		const initial: SettingsDraft = {
			name: campaign.name,
			slug: campaign.slug,
			brandName: campaign.brandName,
			description: campaign.description,
			status: campaign.status === "active" ? "active" : "draft",
			brand: {
				brandColor: campaign.brandColor ?? "",
				audienceTags: [...campaign.audienceTags],
				audienceNote: campaign.audienceNote ?? "",
			},
		};
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
			await saveCampaign({
				campaignId: campaign.id,
				name: draft.name,
				slug: draft.slug,
				brandName: draft.brandName || undefined,
				description: draft.description || undefined,
				status: draft.status,
				brandColor: draft.brand.brandColor || undefined,
				audienceTags: draft.brand.audienceTags.length > 0 ? draft.brand.audienceTags : undefined,
				audienceNote: draft.brand.audienceNote || undefined,
				theme: campaign.theme,
				gameTemplateId: campaign.gameTemplateId,
				gameConfig: campaign.gameConfig,
				heroAssetId: campaign.heroAsset?.id,
				logoAssetId: campaign.logoAsset?.id,
				claimHeadline: campaign.claimHeadline || undefined,
				claimSubtitle: campaign.claimSubtitle || undefined,
				claimCtaLabel: campaign.claimCtaLabel || undefined,
				claimCollectLabel: campaign.claimCollectLabel || undefined,
				claimWaitingMessage: campaign.claimWaitingMessage || undefined,
			});
			setBaseline(JSON.stringify(draft)); setFeedback("Đã lưu thông tin chiến dịch"); return true;
		} catch (unknownError) { setError(unknownError instanceof Error ? unknownError.message : "Không thể lưu chiến dịch"); return false; }
		finally { setSaving(false); }
	}, [campaign, draft, saveCampaign]);

	if (campaign === undefined) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải cài đặt chiến dịch" /></div>;
	if (!campaign) return <AdminPageShell title="Không tìm thấy chiến dịch"><EmptyState><EmptyState.Header><EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media><EmptyState.Title>Không tìm thấy chiến dịch</EmptyState.Title><EmptyState.Description>Chiến dịch không tồn tại hoặc bạn không có quyền truy cập.</EmptyState.Description></EmptyState.Header><EmptyState.Content><Link to="/campaigns">Quay lại danh sách</Link></EmptyState.Content></EmptyState></AdminPageShell>;
	if (!draft || loadedCampaignId !== campaign.id) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang chuẩn bị biểu mẫu chiến dịch" /></div>;
	const update = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);

	return (
		<AdminPageShell
			actions={<><AdminSaveStatus dirty={dirty} savedMessage={feedback} /><Button isDisabled={!dirty || draft.name.trim().length < 3} isPending={saving} onPress={save}><Save aria-hidden="true" />Lưu thay đổi</Button></>}
			breadcrumbContext={campaign.name}
			description="Thông tin, trạng thái và nhận diện thương hiệu của chiến dịch."
			stickyHeader
			tabs={<CampaignContextNav campaignId={campaignId} />}
			title="Cài đặt chiến dịch"
		>
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={save} />
			{error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
			<div className="admin-settings">
				<section className="admin-settings-section">
					<div className="admin-settings-section__intro">
						<h2>Thông tin chung</h2>
						<p>Tên, thương hiệu và mô tả hiển thị trong không gian làm việc.</p>
					</div>
					<Widget><Widget.Content className="admin-form">
						<div className="admin-field"><Label htmlFor="campaign-settings-name">Tên chiến dịch</Label><Input fullWidth id="campaign-settings-name" value={draft.name} variant="secondary" onChange={(event) => update("name", event.currentTarget.value)} /></div>
						<div className="admin-field-pair"><div className="admin-field"><Label htmlFor="campaign-settings-slug">Địa chỉ ngắn</Label><Input className="admin-control--sm" fullWidth id="campaign-settings-slug" value={draft.slug} variant="secondary" onChange={(event) => update("slug", event.currentTarget.value)} /></div><div className="admin-field"><Label htmlFor="campaign-settings-brand">Thương hiệu</Label><Input fullWidth id="campaign-settings-brand" value={draft.brandName} variant="secondary" onChange={(event) => update("brandName", event.currentTarget.value)} /></div></div>
						<div className="admin-field"><Label htmlFor="campaign-settings-description">Mô tả</Label><TextArea fullWidth id="campaign-settings-description" value={draft.description} variant="secondary" onChange={(event) => update("description", event.currentTarget.value)} /></div>
					</Widget.Content></Widget>
				</section>
				<section className="admin-settings-section">
					<div className="admin-settings-section__intro">
						<h2>Trạng thái</h2>
						<p>Người chơi chỉ tham gia được khi chiến dịch đang chạy.</p>
					</div>
					<Widget><Widget.Content className="admin-form">
						<RadioGroup
							aria-label="Trạng thái chiến dịch"
							className="admin-choice-grid"
							value={draft.status}
							onChange={(next) => update("status", next as SettingsDraft["status"])}
						>
							<Radio
								className={`admin-choice-card ${draft.status === "draft" ? "border-accent bg-accent-soft" : "hover:border-accent/50"}`}
								value="draft"
							>
								<Radio.Content>
									<Radio.Control>
										<Radio.Indicator />
									</Radio.Control>
									<span className="min-w-0">
										<span className="block text-sm font-medium text-foreground">Bản nháp</span>
										<span className="mt-0.5 block text-xs leading-4 text-muted">Chỉ nhóm của bạn thấy; liên kết chơi chưa mở.</span>
									</span>
								</Radio.Content>
							</Radio>
							<Radio
								className={`admin-choice-card ${draft.status === "active" ? "border-accent bg-accent-soft" : "hover:border-accent/50"}`}
								value="active"
							>
								<Radio.Content>
									<Radio.Control>
										<Radio.Indicator />
									</Radio.Control>
									<span className="min-w-0">
										<span className="block text-sm font-medium text-foreground">Đang chạy</span>
										<span className="mt-0.5 block text-xs leading-4 text-muted">Người chơi tham gia được qua liên kết và trạm.</span>
									</span>
								</Radio.Content>
							</Radio>
						</RadioGroup>
					</Widget.Content></Widget>
				</section>
				<section className="admin-settings-section">
					<div className="admin-settings-section__intro">
						<h2>Nhận diện thương hiệu</h2>
						<p>Logo, màu và đối tượng chỉ dùng trong không gian làm việc; màn chơi của khách không đổi.</p>
					</div>
					<Widget><Widget.Content className="admin-form">
						<CampaignLogoField
							campaignId={campaign.id}
							logoAssetId={campaign.logoAsset?.id ?? null}
							logoUrl={campaign.logoAsset?.url ?? null}
						/>
						<CampaignBrandIdentityFields
							draft={draft.brand}
							idPrefix="campaign-settings"
							onChange={(brand) => update("brand", brand)}
						/>
					</Widget.Content></Widget>
				</section>
			</div>
		</AdminPageShell>
	);
}
