"use client";

import { Alert, Button, Spinner } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileQuestion, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { UnsavedChangesGuard } from "@/app/_workspace/-components/UnsavedChangesGuard";
import { CampaignGameAssetsPanel } from "./CampaignGameAssetsPanel";
import { getGameTemplate, resolveCampaignGameTemplateId } from "@/app/game-templates/registry";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CampaignGameConfig } from "@/lib/gameTemplates";

export function CampaignGameEditorFeature({ campaignId, campaignGameId }: { campaignId: string; campaignGameId: string }) {
	const context = useQuery(api.campaigns.getCampaignGameRouteContext, { campaignGameId: campaignGameId as Id<"campaignGames"> });
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const [config, setConfig] = useState<CampaignGameConfig | null>(null);
	const [loadedCampaignGameId, setLoadedCampaignGameId] = useState("");
	const [baseline, setBaseline] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (
			!context?.campaign ||
			context.campaign.id !== campaignId ||
			loadedCampaignGameId === context.campaignGame.id
		) return;
		const template = getGameTemplate(
			resolveCampaignGameTemplateId(context.campaignGame.templateId),
		);
		const next = template.normalizeConfig(context.campaignGame.config);
		setConfig(next);
		setBaseline(JSON.stringify(next));
		setLoadedCampaignGameId(context.campaignGame.id);
		setMessage("");
		setError("");
	}, [campaignId, context, loadedCampaignGameId]);
	const dirty = useMemo(() => Boolean(config && JSON.stringify(config) !== baseline), [baseline, config]);
	const save = useCallback(async () => {
		if (!context?.campaign || context.campaign.id !== campaignId || !config) return false;
		const campaign = context.campaign;
		const template = getGameTemplate(resolveCampaignGameTemplateId(context.campaignGame.templateId));
		const presentation = template.toLegacyCampaignPresentation(config);
		setSaving(true); setError(""); setMessage("");
		try {
			await saveCampaign({ campaignId: campaign.id, name: campaign.name, slug: campaign.slug, brandName: campaign.brandName || undefined, description: campaign.description || undefined, ...presentation, status: campaign.status === "archived" ? "draft" : campaign.status, heroAssetId: campaign.heroAsset?.id, gameTemplateId: template.id, gameConfig: config });
			setBaseline(JSON.stringify(config)); setMessage("Đã lưu cấu hình trò chơi"); return true;
		} catch (unknownError) { setError(unknownError instanceof Error ? unknownError.message : "Không thể lưu cấu hình"); return false; }
		finally { setSaving(false); }
	}, [campaignId, config, context, saveCampaign]);

	if (context === undefined) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải cấu hình trò chơi" /></div>;
	if (!context?.campaign || context.campaign.id !== campaignId) return <AdminPageShell title="Không tìm thấy trò chơi"><EmptyState><EmptyState.Header><EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media><EmptyState.Title>Không tìm thấy trò chơi</EmptyState.Title><EmptyState.Description>Trò chơi không thuộc chiến dịch này hoặc bạn không có quyền truy cập.</EmptyState.Description></EmptyState.Header><EmptyState.Content><Link to="/campaigns">Quay lại danh sách chiến dịch</Link></EmptyState.Content></EmptyState></AdminPageShell>;
	if (!config || loadedCampaignGameId !== context.campaignGame.id) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang chuẩn bị trình cấu hình trò chơi" /></div>;
	const campaign = context.campaign;
	const template = getGameTemplate(resolveCampaignGameTemplateId(context.campaignGame.templateId));
	const ConfigEditor = template.ConfigEditor;
	const Preview = template.Preview;
	return (
		<AdminPageShell actions={<Button isDisabled={!dirty} isPending={saving} onPress={save}><Save aria-hidden="true" />Lưu thay đổi</Button>} breadcrumbContext={campaign.name} description={template.description} eyebrow={campaign.name} title={template.name}>
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={save} />
			{error || message ? <Alert status={error ? "danger" : "success"}><Alert.Indicator /><Alert.Content><Alert.Title>{error || message}</Alert.Title></Alert.Content></Alert> : null}
			<CampaignContextNav campaignId={campaignId} />
			{dirty ? <p className="mb-4 text-sm text-warning">Có thay đổi chưa lưu.</p> : null}
			<ConfigEditor config={config} onChange={setConfig} />
			<Preview config={config} heroUrl={campaign.heroAsset?.url} />
			<CampaignGameAssetsPanel campaignId={campaign.id} heroUrl={campaign.heroAsset?.url} />
		</AdminPageShell>
	);
}
