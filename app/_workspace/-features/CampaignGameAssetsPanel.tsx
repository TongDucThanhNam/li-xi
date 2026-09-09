"use client";

import { Alert, ProgressBar } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { useMutation } from "convex/react";
import { ImageUp } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { validateCampaignAssetPolicy } from "@/lib/assetPolicy";

function uploadFile(url: string, file: File, onProgress: (value: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", url); request.setRequestHeader("Content-Type", file.type);
		request.upload.onprogress = (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0);
		request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Không thể tải ảnh lên R2"));
		request.onerror = () => reject(new Error("Không thể kết nối R2")); request.send(file);
	});
}

export function CampaignGameAssetsPanel({ campaignId, heroUrl }: { campaignId: Id<"campaigns">; heroUrl?: string | null }) {
	const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
	const syncMetadata = useMutation(api.assets.syncMetadata);
	const attachUploadedAsset = useMutation(api.campaigns.attachUploadedAsset);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	return <Widget><Widget.Header><Widget.Title>Ảnh chủ đạo</Widget.Title><Widget.Description>Tài nguyên thương hiệu thuộc chiến dịch và được lưu trên Cloudflare R2.</Widget.Description></Widget.Header><Widget.Content className="gap-4">
		{error || feedback ? <Alert status={error ? "danger" : "success"}><Alert.Indicator /><Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content></Alert> : null}
		{heroUrl ? <img alt="Ảnh chủ đạo hiện tại" className="aspect-video w-full max-w-xl rounded-xl object-cover" src={heroUrl} /> : <div className="grid aspect-video w-full max-w-xl place-items-center rounded-xl bg-surface-secondary text-sm text-muted">Chưa có ảnh chủ đạo</div>}
		<label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium"><ImageUp aria-hidden="true" size={16} />{uploading ? "Đang tải ảnh" : "Chọn ảnh"}<input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} type="file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; void (async () => { setUploading(true); setProgress(0); setError(""); setFeedback(""); try { validateCampaignAssetPolicy({ contentType: file.type, fileName: file.name, size: file.size }); const upload = await generateUploadUrl({ campaignId, contentType: file.type, fileName: file.name, size: file.size }); await uploadFile(upload.url, file, setProgress); await syncMetadata({ key: upload.key }); let attached = false; for (let attempt = 0; attempt < 4 && !attached; attempt += 1) { try { await attachUploadedAsset({ campaignId, key: upload.key, contentType: file.type, fileName: file.name, size: file.size }); attached = true; } catch (unknownError) { if (attempt === 3 || !(unknownError instanceof Error) || !unknownError.message.includes("metadata R2")) throw unknownError; await new Promise((resolve) => setTimeout(resolve, 500)); } } setFeedback("Đã cập nhật ảnh chủ đạo."); } catch (unknownError) { setError(unknownError instanceof Error ? unknownError.message : "Không thể tải ảnh"); } finally { setUploading(false); setProgress(0); event.currentTarget.value = ""; } })(); }} /></label>
		{uploading ? <ProgressBar aria-label="Tiến độ tải ảnh" value={progress}><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar> : null}
	</Widget.Content></Widget>;
}
