"use client";

import { Alert, Button, Input, Label, TextArea, buttonVariants } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Save } from "lucide-react";
import { useCallback, useState } from "react";
import { GameTemplatePreview } from "@/app/_workspace/-components/GameTemplatePreview";
import { UnsavedChangesGuard } from "@/app/_workspace/-components/UnsavedChangesGuard";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import {
	CampaignBrandIdentityFields,
	type CampaignBrandIdentityDraft,
} from "@/app/_workspace/-components/CampaignBrandIdentityFields";
import { AdminDisclosure } from "@/app/components/AdminDisclosure";
import { GameTemplatePicker } from "@/app/_workspace/-components/GameTemplatePicker";
import { api } from "@/convex/_generated/api";
import {
	gameTemplates as gameTemplateCatalog,
	type CampaignGameConfig,
	type GameTemplateId,
} from "@/lib/gameTemplates";

const afterCreateSteps = [
	{ detail: "Nội dung, giới hạn lượt chơi, hình ảnh.", title: "Cấu hình trò chơi" },
	{ detail: "Kho phần thưởng dùng chung của chiến dịch.", title: "Thêm phần thưởng" },
	{ detail: "Tạo liên kết chơi hoặc mở trạm tại quầy.", title: "Phát hành" },
] as const;

export function CampaignCreateFeature() {
	const navigate = useNavigate();
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const [name, setName] = useState("");
	const [brandName, setBrandName] = useState("");
	const [description, setDescription] = useState("");
	const [brandIdentity, setBrandIdentity] = useState<CampaignBrandIdentityDraft>({
		brandColor: "",
		audienceTags: [],
		audienceNote: "",
	});
	const [status, setStatus] = useState<"draft" | "active">("draft");
	const [templateId, setTemplateId] = useState<GameTemplateId>("li-xi");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	const dirty =
		!saved &&
		Boolean(
			name ||
				brandName ||
				description ||
				brandIdentity.brandColor ||
				brandIdentity.audienceTags.length > 0 ||
				brandIdentity.audienceNote ||
				status !== "draft",
		);

	const persist = useCallback(async () => {
		if (name.trim().length < 3) return null;
		setSaving(true);
		setError("");
		try {
			const template = gameTemplateCatalog[templateId];
			const gameConfig = template.initialCampaignConfig as CampaignGameConfig;
			const result = await saveCampaign({
				brandName: brandName || undefined,
				description: description || undefined,
				// Brand identity is workspace metadata; the logo attaches from the
				// overview once the campaign exists (same as the hero asset).
				brandColor: brandIdentity.brandColor || undefined,
				audienceTags: brandIdentity.audienceTags.length > 0 ? brandIdentity.audienceTags : undefined,
				audienceNote: brandIdentity.audienceNote || undefined,
				gameConfig,
				gameTemplateId: template.id,
				name,
				status,
				theme: "brand",
			});
			setSaved(true);
			return result;
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể tạo chiến dịch");
			return null;
		} finally {
			setSaving(false);
		}
	}, [brandIdentity, brandName, description, name, saveCampaign, status, templateId]);

	return (
		<AdminPageShell
			description="Tạo chiến dịch và chọn trò chơi đầu tiên; có thể thêm trò chơi khác sau khi lưu."
			title="Tạo chiến dịch"
		>
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={async () => Boolean(await persist())} />
			{error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
			<div className="admin-split admin-split--preview">
				<div className="admin-split__main">
					<Widget>
						<Widget.Header><Widget.Title>Thông tin chiến dịch</Widget.Title><Widget.Description>Mỗi chiến dịch là một hoạt động marketing và sở hữu các trò chơi riêng.</Widget.Description></Widget.Header>
						<Widget.Content className="admin-form">
							<div className="admin-field"><Label htmlFor="new-campaign-name">Tên chiến dịch</Label><Input autoFocus fullWidth id="new-campaign-name" value={name} variant="secondary" onChange={(event) => setName(event.currentTarget.value)} /><p className="admin-field__hint">Từ 3 đến 80 ký tự.</p></div>
							<div className="admin-field"><Label htmlFor="new-campaign-brand">Thương hiệu</Label><Input fullWidth id="new-campaign-brand" value={brandName} variant="secondary" onChange={(event) => setBrandName(event.currentTarget.value)} /></div>
							<div className="admin-field"><Label htmlFor="new-campaign-description">Mô tả</Label><TextArea fullWidth id="new-campaign-description" value={description} variant="secondary" onChange={(event) => setDescription(event.currentTarget.value)} /></div>
							<div className="admin-field"><Label htmlFor="new-campaign-status">Trạng thái ban đầu</Label><NativeSelect className="admin-control--sm" fullWidth variant="secondary"><NativeSelect.Trigger aria-label="Trạng thái ban đầu" id="new-campaign-status" value={status} onChange={(event) => setStatus(event.currentTarget.value as "draft" | "active")}><NativeSelect.Option value="draft">Bản nháp</NativeSelect.Option><NativeSelect.Option value="active">Đang chạy</NativeSelect.Option><NativeSelect.Indicator /></NativeSelect.Trigger></NativeSelect></div>
						</Widget.Content>
					</Widget>
					<Widget>
						<Widget.Header><Widget.Title>Chọn mẫu trò chơi đầu tiên</Widget.Title><Widget.Description>Mỗi mẫu trò chơi sở hữu cơ chế, hình ảnh và phần thưởng riêng.</Widget.Description></Widget.Header>
						<Widget.Content className="admin-stack">
							<GameTemplatePicker onChange={setTemplateId} value={templateId} />
						</Widget.Content>
					</Widget>
					<Widget>
						<Widget.Content>
							<AdminDisclosure bare summary="Màu, đối tượng, ghi chú" title="Nhận diện thương hiệu (tuỳ chọn)">
								<CampaignBrandIdentityFields
									draft={brandIdentity}
									idPrefix="new-campaign"
									onChange={setBrandIdentity}
								/>
								<p className="admin-field__hint">
									Logo tải lên ở trang tổng quan sau khi lưu chiến dịch. Các trường này chỉ là
									metadata không gian làm việc.
								</p>
							</AdminDisclosure>
						</Widget.Content>
					</Widget>
					<div className="flex flex-wrap items-center gap-3">
						<Button isDisabled={name.trim().length < 3} isPending={saving} onPress={async () => {
							const result = await persist();
							if (result) {
								void navigate({ to: "/campaigns/$campaignId/games/$campaignGameId", params: { campaignId: result.campaignId, campaignGameId: result.campaignGameId }, replace: true });
							}
						}}><Save aria-hidden="true" />Tạo và cấu hình trò chơi</Button>
						<Link className={buttonVariants({ variant: "ghost" })} to="/campaigns">Huỷ</Link>
					</div>
				</div>
				<div className="admin-split__side hidden xl:flex">
					<p className="admin-group-label">Xem trước</p>
					<GameTemplatePreview
						config={gameTemplateCatalog[templateId].initialCampaignConfig}
						templateId={templateId}
					/>
					<p className="admin-field__hint">
						Màn mở đầu mặc định của mẫu {gameTemplateCatalog[templateId].name}; nội dung và hình
						ảnh chỉnh được sau khi tạo.
					</p>
					<p className="admin-group-label mt-4">Sau khi tạo</p>
					<ol className="flex flex-col gap-4">
						{afterCreateSteps.map((step, index) => (
							<li className="flex gap-3" key={step.title}>
								<span aria-hidden="true" className="text-sm leading-5 text-muted tabular-nums">{index + 1}</span>
								<span className="min-w-0">
									<span className="block text-sm font-medium leading-5 text-foreground">{step.title}</span>
									<span className="mt-0.5 block text-xs leading-4 text-muted">{step.detail}</span>
								</span>
							</li>
						))}
					</ol>
				</div>
			</div>
		</AdminPageShell>
	);
}
