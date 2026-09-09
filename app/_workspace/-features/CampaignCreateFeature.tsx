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
	DEFAULT_GAME_TEMPLATE_ID,
	gameTemplates as gameTemplateCatalog,
} from "@/lib/gameTemplates";

const initialGameTemplate = gameTemplateCatalog[DEFAULT_GAME_TEMPLATE_ID];

export function CampaignCreateFeature() {
	const navigate = useNavigate();
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const [name, setName] = useState("");
	const [brandName, setBrandName] = useState("");
	const [description, setDescription] = useState("");
	const [status, setStatus] = useState<"draft" | "active">("draft");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	const dirty = !saved && Boolean(name || brandName || description || status !== "draft");

	const persist = useCallback(async () => {
		if (name.trim().length < 3) return null;
		setSaving(true);
		setError("");
		try {
			const result = await saveCampaign({
				brandName: brandName || undefined,
				description: description || undefined,
				gameConfig: initialGameTemplate.initialCampaignConfig,
				gameTemplateId: initialGameTemplate.id,
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
	}, [brandName, description, name, saveCampaign, status]);

	return (
		<AdminPageShell description="Tạo chiến dịch và trò chơi li xi đầu tiên; có thể tinh chỉnh cấu hình sau khi lưu." title="Tạo chiến dịch">
			<UnsavedChangesGuard dirty={dirty} saving={saving} onSave={async () => Boolean(await persist())} />
			{error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{error}</Alert.Title></Alert.Content></Alert> : null}
			<Widget className="max-w-3xl">
				<Widget.Header><Widget.Title>Thông tin chiến dịch</Widget.Title><Widget.Description>Mỗi chiến dịch là một hoạt động marketing và sở hữu các trò chơi riêng.</Widget.Description></Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field"><Label htmlFor="new-campaign-name">Tên chiến dịch</Label><Input autoFocus fullWidth id="new-campaign-name" value={name} variant="secondary" onChange={(event) => setName(event.currentTarget.value)} /><Description>Từ 3 đến 80 ký tự.</Description></div>
					<div className="admin-field"><Label htmlFor="new-campaign-brand">Thương hiệu</Label><Input fullWidth id="new-campaign-brand" value={brandName} variant="secondary" onChange={(event) => setBrandName(event.currentTarget.value)} /></div>
					<div className="admin-field"><Label htmlFor="new-campaign-description">Mô tả</Label><TextArea fullWidth id="new-campaign-description" value={description} variant="secondary" onChange={(event) => setDescription(event.currentTarget.value)} /></div>
					<div className="admin-field"><Label htmlFor="new-campaign-status">Trạng thái ban đầu</Label><NativeSelect fullWidth variant="secondary"><NativeSelect.Trigger aria-label="Trạng thái ban đầu" id="new-campaign-status" value={status} onChange={(event) => setStatus(event.currentTarget.value as "draft" | "active")}><NativeSelect.Option value="draft">Bản nháp</NativeSelect.Option><NativeSelect.Option value="active">Đang chạy</NativeSelect.Option><NativeSelect.Indicator /></NativeSelect.Trigger></NativeSelect></div>
					<Button isDisabled={name.trim().length < 3} isPending={saving} onPress={async () => {
							const result = await persist();
							if (result) {
							void navigate({ to: "/campaigns/$campaignId/games/$campaignGameId", params: { campaignId: result.campaignId, campaignGameId: result.campaignGameId }, replace: true });
							}
					}}><Save aria-hidden="true" />Tạo và cấu hình trò chơi</Button>
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
