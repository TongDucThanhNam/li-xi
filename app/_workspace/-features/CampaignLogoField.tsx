"use client";

import { Alert, Button, Label, ProgressBar } from "@heroui/react";
import { useMutation } from "convex/react";
import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { validateCampaignAssetPolicy } from "@/lib/assetPolicy";

const ATTACH_RETRY_DELAY_MS = 500;

function uploadLogoFile(url: string, file: File, onProgress: (value: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", url);
		request.setRequestHeader("Content-Type", file.type);
		request.upload.onprogress = (event) =>
			onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0);
		request.onload = () =>
			request.status >= 200 && request.status < 300
				? resolve()
				: reject(new Error("Không thể tải ảnh lên R2"));
		request.onerror = () => reject(new Error("Không thể kết nối R2"));
		request.send(file);
	});
}

/**
 * Brand-logo upload/remove for the campaign overview. Same R2 flow as the
 * game assets panel (generateUploadUrl → PUT → syncMetadata → attach with
 * the 4-attempt "metadata R2" retry), reserved with `usage: "brand-logo"`.
 * Workspace metadata only — the logo does not render on guest surfaces until
 * a template design doc defines a brand-logo slot.
 */
export function CampaignLogoField({
	campaignId,
	logoAssetId,
	logoUrl,
}: {
	campaignId: Id<"campaigns">;
	logoAssetId?: Id<"campaignAssets"> | null;
	logoUrl?: string | null;
}) {
	const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
	const syncMetadata = useMutation(api.assets.syncMetadata);
	const attachUploadedAsset = useMutation(api.campaigns.attachUploadedAsset);
	const detachCampaignAsset = useMutation(api.campaigns.detachCampaignAsset);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	const handleFileChosen = async (file: File) => {
		setUploading(true);
		setProgress(0);
		setError("");
		setFeedback("");
		try {
			validateCampaignAssetPolicy({
				contentType: file.type,
				fileName: file.name,
				size: file.size,
				usage: "brand-logo",
			});
			const upload = await generateUploadUrl({
				campaignId,
				contentType: file.type,
				fileName: file.name,
				size: file.size,
				usage: "brand-logo",
			});
			await uploadLogoFile(upload.url, file, setProgress);
			await syncMetadata({ key: upload.key });
			let attached = false;
			for (let attempt = 0; attempt < 4 && !attached; attempt += 1) {
				try {
					await attachUploadedAsset({
						campaignId,
						key: upload.key,
						contentType: file.type,
						fileName: file.name,
						size: file.size,
						usage: "brand-logo",
					});
					attached = true;
				} catch (unknownError) {
					const retryable =
						attempt < 3 &&
						unknownError instanceof Error &&
						unknownError.message.includes("metadata R2");
					if (!retryable) {
						throw unknownError;
					}
					await new Promise((resolve) => setTimeout(resolve, ATTACH_RETRY_DELAY_MS));
				}
			}
			setFeedback("Đã cập nhật logo thương hiệu.");
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể tải ảnh");
		} finally {
			setUploading(false);
			setProgress(0);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleRemove = async (assetId: Id<"campaignAssets">) => {
		setError("");
		setFeedback("");
		try {
			await detachCampaignAsset({ assetId });
			setFeedback("Đã gỡ logo thương hiệu.");
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể gỡ logo");
		}
	};

	return (
		<div className="admin-field">
			<Label htmlFor="campaign-logo-upload">Logo thương hiệu (tuỳ chọn)</Label>
			{error || feedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{error || feedback}</Alert.Title>
					</Alert.Content>
				</Alert>
			) : null}
			<div className="flex flex-wrap items-center gap-4">
				{logoUrl ? (
					<img
						alt="Logo thương hiệu hiện tại"
						className="size-16 rounded-lg border border-border bg-surface-secondary object-contain"
						src={logoUrl}
					/>
				) : (
					<div className="grid size-16 place-items-center rounded-lg border border-dashed border-border text-xs text-muted">
						Chưa có
					</div>
				)}
				<div className="grid gap-2">
					<Button
						isDisabled={uploading}
						type="button"
						variant="outline"
						onPress={() => fileInputRef.current?.click()}
					>
						<ImageUp aria-hidden="true" size={16} />
						{uploading ? "Đang tải logo" : logoUrl ? "Thay logo" : "Tải logo lên"}
					</Button>
					{logoAssetId ? (
						<Button
							isDisabled={uploading}
							type="button"
							variant="ghost"
							onPress={() => void handleRemove(logoAssetId)}
						>
							<Trash2 aria-hidden="true" size={16} />
							Gỡ logo
						</Button>
					) : null}
					{uploading ? (
						<ProgressBar aria-label="Tiến độ tải logo" value={progress}>
							<ProgressBar.Track>
								<ProgressBar.Fill />
							</ProgressBar.Track>
						</ProgressBar>
					) : null}
					<p className="admin-field__hint">Vuông, tối đa 2 MB. JPG, PNG, WebP, GIF hoặc AVIF.</p>
				</div>
			</div>
			<input
				accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
				aria-hidden="true"
				className="sr-only"
				disabled={uploading}
				id="campaign-logo-upload"
				ref={fileInputRef}
				tabIndex={-1}
				type="file"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					if (file) {
						void handleFileChosen(file);
					}
				}}
			/>
		</div>
	);
}
