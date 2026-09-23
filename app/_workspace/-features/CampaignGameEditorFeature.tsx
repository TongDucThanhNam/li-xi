"use client";

import { Alert, Button, Chip, Label, NumberField, Spinner } from "@heroui/react";
import { EmptyState, NativeSelect, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileQuestion, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { UnsavedChangesGuard } from "@/app/_workspace/-components/UnsavedChangesGuard";
import { CampaignGameAssetsPanel } from "./CampaignGameAssetsPanel";
import { gameTemplates as gameTemplateEntries, getGameTemplate } from "@/app/game-templates/registry";
import type { GameTemplate } from "@/app/game-templates/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	DEFAULT_PLAY_LIMITS,
	MAX_MAX_TOTAL_SESSIONS,
	MAX_SESSIONS_PER_PARTICIPANT,
	MIN_MAX_TOTAL_SESSIONS,
	MIN_SESSIONS_PER_PARTICIPANT,
	normalizePlayLimits,
	type CampaignGameConfig,
	type CampaignGamePlayLimits,
	type GameTemplateId,
} from "@/lib/gameTemplates";
import {
	finiteNumberOr,
	optionalFiniteNumberOrNull,
	serializeEditorDraft,
	type GameEditorStatus,
} from "@/lib/gameEditorState";

export function CampaignGameEditorFeature({ campaignId, campaignGameId }: { campaignId: string; campaignGameId: string }) {
	const context = useQuery(api.campaigns.getCampaignGameRouteContext, { campaignGameId: campaignGameId as Id<"campaignGames"> });
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const updateCampaignGame = useMutation(api.campaignGames.updateCampaignGame);
	const [config, setConfig] = useState<CampaignGameConfig | null>(null);
	const [gameStatus, setGameStatus] = useState<GameEditorStatus>("draft");
	const [playLimits, setPlayLimits] = useState<CampaignGamePlayLimits>({ ...DEFAULT_PLAY_LIMITS });
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
		const template = getGameTemplate(context.campaignGame.templateId);
		const next = template.normalizeConfig(context.campaignGame.config);
		setConfig(next);
		setGameStatus(context.campaignGame.status);
		const nextLimits = normalizePlayLimits(context.campaignGame.playLimits);
		setPlayLimits(nextLimits);
		setBaseline(
			serializeEditorDraft({
				config: next,
				gameStatus: context.campaignGame.status,
				playLimits: nextLimits,
			}),
		);
		setLoadedCampaignGameId(context.campaignGame.id);
		setMessage("");
		setError("");
	}, [campaignId, context, loadedCampaignGameId]);
	const dirty = useMemo(
		() =>
			Boolean(config) &&
			serializeEditorDraft({
				config: config as CampaignGameConfig,
				gameStatus,
				playLimits,
			}) !== baseline,
		[baseline, config, gameStatus, playLimits],
	);

	const save = useCallback(async () => {
		if (!context?.campaign || context.campaign.id !== campaignId || !config) return false;
		const campaign = context.campaign;
		const templateId: GameTemplateId = context.campaignGame.templateId;
		const template = getGameTemplate(templateId);
		const isPrimaryLiXiInstance =
			campaign.campaignGame.id === campaignGameId && templateId === "li-xi";
		setSaving(true); setError(""); setMessage("");
		// Snapshot the exact draft being saved: edits made while the mutation
		// is in flight keep the editor dirty instead of being silently marked
		// clean by the slower save.
		const savedSnapshot = serializeEditorDraft({ config, gameStatus, playLimits });
		try {
			// Every instance stores its own row-scoped config/limits/status;
			// sibling games and campaign-wide defaults stay untouched.
			await updateCampaignGame({
				config,
				campaignGameId: campaignGameId as Id<"campaignGames">,
				name: context.campaignGame.name,
				playLimits,
				status: gameStatus,
			});
			if (isPrimaryLiXiInstance) {
				// The primary li xi instance additionally syncs the campaign-wide
				// legacy copy columns that station/legacy public flows read.
				const presentation = template.toLegacyCampaignPresentation(config);
				await saveCampaign({ campaignId: campaign.id, name: campaign.name, slug: campaign.slug, brandName: campaign.brandName || undefined, description: campaign.description || undefined, ...presentation, status: campaign.status === "archived" ? "draft" : campaign.status, heroAssetId: campaign.heroAsset?.id, gameTemplateId: template.id, gameConfig: config });
			}
			setBaseline(savedSnapshot); setMessage("Đã lưu cấu hình trò chơi"); return true;
		} catch (unknownError) { setError(unknownError instanceof Error ? unknownError.message : "Không thể lưu cấu hình"); return false; }
		finally { setSaving(false); }
	}, [campaignGameId, campaignId, config, context, gameStatus, playLimits, saveCampaign, updateCampaignGame]);

	if (context === undefined) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải cấu hình trò chơi" /></div>;
	if (!context?.campaign || context.campaign.id !== campaignId) return <AdminPageShell title="Không tìm thấy trò chơi"><EmptyState><EmptyState.Header><EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media><EmptyState.Title>Không tìm thấy trò chơi</EmptyState.Title><EmptyState.Description>Trò chơi không thuộc chiến dịch này hoặc bạn không có quyền truy cập.</EmptyState.Description></EmptyState.Header><EmptyState.Content><Link to="/campaigns">Quay lại danh sách chiến dịch</Link></EmptyState.Content></EmptyState></AdminPageShell>;
	if (!config || loadedCampaignGameId !== context.campaignGame.id) return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang chuẩn bị trình cấu hình trò chơi" /></div>;
	const campaign = context.campaign;
	const templateResolution = ((): { template?: GameTemplate; error?: string } => {
		const templateId = context.campaignGame.templateId;
		if (
			templateId === "li-xi" ||
			templateId === "lucky-wheel" ||
			templateId === "scratch-card" ||
			templateId === "slot-reveal" ||
			templateId === "quiz"
		) {
			return { template: gameTemplateEntries[templateId] };
		}
		return {
			error: `Mẫu trò chơi không được hỗ trợ: ${String(templateId)}`,
		};
	})();
	if (templateResolution.error || !templateResolution.template) {
		return (
			<AdminPageShell breadcrumbContext={campaign.name} eyebrow={campaign.name} title="Mẫu trò chơi không được hỗ trợ">
				<EmptyState>
					<EmptyState.Header>
						<EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media>
						<EmptyState.Title>Không thể mở trình cấu hình</EmptyState.Title>
						<EmptyState.Description>{templateResolution.error}</EmptyState.Description>
					</EmptyState.Header>
					<EmptyState.Content>
						<Link params={{ campaignId }} to="/campaigns/$campaignId/games">Quay lại danh sách trò chơi</Link>
					</EmptyState.Content>
				</EmptyState>
			</AdminPageShell>
		);
	}
	const template = templateResolution.template;
	const templateId = template.id;
	const ConfigEditor = template.ConfigEditor;
	const Preview = template.Preview;
	const isPrimaryLiXiInstance =
		campaign.campaignGame.id === campaignGameId && templateId === "li-xi";
	return (
		<AdminPageShell actions={<Button isDisabled={!dirty} isPending={saving} onPress={save}><Save aria-hidden="true" />Lưu thay đổi</Button>} breadcrumbContext={campaign.name} description={template.description} eyebrow={campaign.name} title={context.campaignGame.name}>
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={save} />
			{error || message ? <Alert status={error ? "danger" : "success"}><Alert.Indicator /><Alert.Content><Alert.Title>{error || message}</Alert.Title></Alert.Content></Alert> : null}
			<CampaignContextNav campaignId={campaignId} />
			{dirty ? <p className="mb-4 text-sm text-warning">Có thay đổi chưa lưu.</p> : null}
			<Widget className="mb-6">
				<Widget.Header>
					<Widget.Title>Trạng thái và giới hạn chơi</Widget.Title>
					<Widget.Description>Áp dụng riêng cho trò chơi này, không ảnh hưởng trò chơi khác trong chiến dịch.</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<div className="grid gap-4 md:grid-cols-3">
						<div className="admin-field">
							<Label htmlFor="campaign-game-status">Trạng thái trò chơi</Label>
							<NativeSelect fullWidth variant="secondary">
								<NativeSelect.Trigger aria-label="Trạng thái trò chơi" id="campaign-game-status" value={gameStatus} onChange={(event) => setGameStatus(event.currentTarget.value as GameEditorStatus)}>
									<NativeSelect.Option value="draft">Bản nháp</NativeSelect.Option>
									<NativeSelect.Option value="active">Đang chạy</NativeSelect.Option>
									<NativeSelect.Option value="archived">Đã lưu trữ</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
						<div className="admin-field">
							<NumberField
								aria-label="Số lượt chơi tối đa mỗi người tham gia"
								fullWidth
								maxValue={MAX_SESSIONS_PER_PARTICIPANT}
								minValue={MIN_SESSIONS_PER_PARTICIPANT}
								step={1}
								value={playLimits.maxSessionsPerParticipant}
								variant="secondary"
								onChange={(value) =>
									setPlayLimits((current) => ({
										...current,
										maxSessionsPerParticipant: finiteNumberOr(
											value,
											current.maxSessionsPerParticipant,
										),
									}))
								}
							>
								<Label>
									Lượt tối đa mỗi người ({MIN_SESSIONS_PER_PARTICIPANT}-
									{MAX_SESSIONS_PER_PARTICIPANT})
								</Label>
								<NumberField.Group>
									<NumberField.DecrementButton aria-label="Giảm lượt tối đa mỗi người" />
									<NumberField.Input />
									<NumberField.IncrementButton aria-label="Tăng lượt tối đa mỗi người" />
								</NumberField.Group>
							</NumberField>
						</div>
						<div className="admin-field">
							<NumberField
								aria-label="Tổng số lượt chơi tối đa của trò chơi"
								fullWidth
								maxValue={MAX_MAX_TOTAL_SESSIONS}
								minValue={MIN_MAX_TOTAL_SESSIONS}
								step={1}
								value={playLimits.maxTotalSessions ?? Number.NaN}
								variant="secondary"
								onChange={(value) =>
									setPlayLimits((current) => ({
										...current,
										maxTotalSessions: optionalFiniteNumberOrNull(value),
									}))
								}
							>
								<Label>
									Tổng lượt tối đa (tuỳ chọn, {MIN_MAX_TOTAL_SESSIONS}–
									{MAX_MAX_TOTAL_SESSIONS})
								</Label>
								<NumberField.Group>
									<NumberField.DecrementButton aria-label="Giảm tổng lượt tối đa" />
									<NumberField.Input />
									<NumberField.IncrementButton aria-label="Tăng tổng lượt tối đa" />
								</NumberField.Group>
							</NumberField>
							<p className="mt-1 text-xs text-muted">
								Để trống sẽ dùng giới hạn mặc định 20.000 lượt cho trò chơi này.
							</p>
						</div>
					</div>
					{isPrimaryLiXiInstance ? (
						<Chip variant="soft">Trò chơi chính: nội dung đồng bộ luồng trạm/liên kết li xì cổ điển</Chip>
					) : null}
				</Widget.Content>
			</Widget>
			<ConfigEditor config={config} onChange={setConfig} />
			<Preview config={config} heroUrl={campaign.heroAsset?.url} />
			<CampaignGameAssetsPanel campaignId={campaign.id} heroUrl={campaign.heroAsset?.url} />
		</AdminPageShell>
	);
}
