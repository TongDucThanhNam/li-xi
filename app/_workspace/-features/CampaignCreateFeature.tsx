"use client";

import { Alert, Button, Description, Input, Label, TextArea } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Save } from "lucide-react";
import { useCallback, useState } from "react";
import { UnsavedChangesGuard } from "@/app/_workspace/-components/UnsavedChangesGuard";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import {
	gameTemplates as gameTemplateCatalog,
	type CampaignGameConfig,
	type GameTemplateId,
} from "@/lib/gameTemplates";

const templateChoices: Array<{
	id: GameTemplateId;
	blurb: string;
}> = [
	{
		id: "li-xi",
		blurb: "Lì xì phong bao đỏ/vàng, phù hợp chiến dịch Tết và tri ân cuối năm.",
	},
	{
		id: "lucky-wheel",
		blurb: "Vòng quay nhiều ô với kho phần thưởng đa dạng, chơi tự phục vụ qua link.",
	},
	{
		id: "scratch-card",
		blurb: "Thẻ cào gỡ lớp phủ với phần thưởng công bố một lần bởi máy chủ.",
	},
	{
		id: "slot-reveal",
		blurb: "Ba cuộn máy quay với biểu tượng ổn định; máy chủ ghép tổ hợp phần thưởng một lần duy nhất.",
	},
	{
		id: "quiz",
		blurb: "Trắc nghiệm nhiều câu hỏi chấm điểm máy chủ; đạt điểm mới nhận phần thưởng.",
	},
];

export function CampaignCreateFeature() {
	const navigate = useNavigate();
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const [name, setName] = useState("");
	const [brandName, setBrandName] = useState("");
	const [description, setDescription] = useState("");
	const [status, setStatus] = useState<"draft" | "active">("draft");
	const [templateId, setTemplateId] = useState<GameTemplateId>("li-xi");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	const dirty = !saved && Boolean(name || brandName || description || status !== "draft");

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
	}, [brandName, description, name, saveCampaign, status, templateId]);

	return (
		<AdminPageShell
			description="Tạo chiến dịch và chọn trò chơi đầu tiên; có thể thêm trò chơi khác sau khi lưu."
			title="Tạo chiến dịch"
		>
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={async () => Boolean(await persist())} />
			{error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
			<Widget className="max-w-3xl">
				<Widget.Header><Widget.Title>Thông tin chiến dịch</Widget.Title><Widget.Description>Mỗi chiến dịch là một hoạt động marketing và sở hữu các trò chơi riêng.</Widget.Description></Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field"><Label htmlFor="new-campaign-name">Tên chiến dịch</Label><Input autoFocus fullWidth id="new-campaign-name" value={name} variant="secondary" onChange={(event) => setName(event.currentTarget.value)} /><Description>Từ 3 đến 80 ký tự.</Description></div>
					<div className="admin-field"><Label htmlFor="new-campaign-brand">Thương hiệu</Label><Input fullWidth id="new-campaign-brand" value={brandName} variant="secondary" onChange={(event) => setBrandName(event.currentTarget.value)} /></div>
					<div className="admin-field"><Label htmlFor="new-campaign-description">Mô tả</Label><TextArea fullWidth id="new-campaign-description" value={description} variant="secondary" onChange={(event) => setDescription(event.currentTarget.value)} /></div>
					<div className="admin-field"><Label htmlFor="new-campaign-status">Trạng thái ban đầu</Label><NativeSelect fullWidth variant="secondary"><NativeSelect.Trigger aria-label="Trạng thái ban đầu" id="new-campaign-status" value={status} onChange={(event) => setStatus(event.currentTarget.value as "draft" | "active")}><NativeSelect.Option value="draft">Bản nháp</NativeSelect.Option><NativeSelect.Option value="active">Đang chạy</NativeSelect.Option><NativeSelect.Indicator /></NativeSelect.Trigger></NativeSelect></div>
				</Widget.Content>
			</Widget>
			<Widget className="max-w-3xl" >
				<Widget.Header><Widget.Title>Chọn mẫu trò chơi đầu tiên</Widget.Title><Widget.Description>Mỗi mẫu trò chơi sở hữu cơ chế, hình ảnh và phần thưởng riêng.</Widget.Description></Widget.Header>
				<Widget.Content className="gap-3">
					{templateChoices.map((choice) => {
						const template = gameTemplateCatalog[choice.id];
						const selected = templateId === choice.id;
						return (
							<label
								className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${selected ? "border-accent bg-accent/5" : "border-border bg-surface-secondary hover:border-accent/50"}`}
								key={choice.id}
							>
								<input
									aria-label={`Chọn mẫu ${template.name}`}
									checked={selected}
									className="mt-1 size-4 accent-[var(--color-accent,#2563eb)]"
									name="game-template-choice"
									onChange={() => setTemplateId(choice.id)}
									type="radio"
									value={choice.id}
								/>
								<span className="min-w-0">
									<span className="block font-medium text-foreground">{template.name}</span>
									<span className="mt-1 block text-sm text-muted">{choice.blurb || template.description}</span>
								</span>
							</label>
						);
					})}
					<p className="text-xs text-muted">Kho phần thưởng và liên kết chơi công khai được cấu hình ở các bước sau.</p>
				</Widget.Content>
			</Widget>
			<div className="max-w-3xl">
				<Button isDisabled={name.trim().length < 3} isPending={saving} onPress={async () => {
					const result = await persist();
					if (result) {
						void navigate({ to: "/campaigns/$campaignId/games/$campaignGameId", params: { campaignId: result.campaignId, campaignGameId: result.campaignGameId }, replace: true });
					}
				}}><Save aria-hidden="true" />Tạo và cấu hình trò chơi</Button>
			</div>
		</AdminPageShell>
	);
}
