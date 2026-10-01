"use client";

import { Alert, Button, ProgressBar } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { useMutation } from "convex/react";
import { Image as ImageIcon, ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GameTemplateAssetSlot } from "@/app/game-templates/types";
import { validateCampaignAssetPolicy } from "@/lib/assetPolicy";

const ATTACH_RETRY_DELAY_MS = 500;

function uploadFile(url: string, file: File, onProgress: (value: number) => void) {
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

type SlotView = {
	usage: string;
	assetId: Id<"campaignAssets">;
	url: string;
};

/**
 * Generalized campaign-game assets panel: one "Hình ảnh" section with a
 * compact row for the campaign hero and one row per template-declared asset
 * slot. Every upload follows the R2 flow generateUploadUrl → PUT →
 * syncMetadata → attachUploadedAsset with the 4-attempt "metadata R2" retry;
 * slots carry their usage kind and owning game so the server can validate and
 * bind them.
 */
export function CampaignGameAssetsPanel({
	campaignId,
	campaignGameId,
	heroUrl,
	slots = [],
	assets = [],
}: {
	campaignId: Id<"campaigns">;
	campaignGameId?: Id<"campaignGames">;
	heroUrl?: string | null;
	slots?: readonly GameTemplateAssetSlot[];
	assets?: readonly SlotView[];
}) {
	const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
	const syncMetadata = useMutation(api.assets.syncMetadata);
	const attachUploadedAsset = useMutation(api.campaigns.attachUploadedAsset);
	const detachCampaignAsset = useMutation(api.campaigns.detachCampaignAsset);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const slotInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	const [uploading, setUploading] = useState(false);
	// Which row ("hero" or a slot id) is uploading, so the progress bar
	// renders under that row.
	const [uploadTarget, setUploadTarget] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	const handleFileChosen = async (file: File, slot?: GameTemplateAssetSlot) => {
		setUploading(true);
		setUploadTarget(slot ? slot.id : "hero");
		setProgress(0);
		setError("");
		setFeedback("");
		try {
			validateCampaignAssetPolicy({
				contentType: file.type,
				fileName: file.name,
				size: file.size,
				usage: slot?.id,
			});
			const upload = await generateUploadUrl({
				campaignId,
				contentType: file.type,
				fileName: file.name,
				size: file.size,
				...(slot ? { usage: slot.id, campaignGameId } : {}),
			});
			await uploadFile(upload.url, file, setProgress);
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
						...(slot ? { usage: slot.id, campaignGameId } : {}),
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
			setFeedback(slot ? `Đã cập nhật ${slot.label}.` : "Đã cập nhật ảnh chủ đạo.");
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể tải ảnh");
		} finally {
			setUploading(false);
			setUploadTarget(null);
			setProgress(0);
			// Reset via the refs: the change event's currentTarget is detached
			// after the awaits above.
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			for (const node of Object.values(slotInputRefs.current)) {
				if (node) {
					node.value = "";
				}
			}
		}
	};

	const handleRemove = async (slot: GameTemplateAssetSlot, assetId: Id<"campaignAssets">) => {
		setError("");
		setFeedback("");
		try {
			await detachCampaignAsset({ assetId });
			setFeedback(`Đã gỡ ${slot.label}.`);
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể gỡ ảnh");
		}
	};

	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>Hình ảnh</Widget.Title>
				<Widget.Description>JPEG, PNG hoặc WebP.</Widget.Description>
			</Widget.Header>
			<Widget.Content className="admin-stack">
				{error || feedback ? (
					<Alert status={error ? "danger" : "success"}>
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Title>{error || feedback}</Alert.Title>
						</Alert.Content>
					</Alert>
				) : null}
				<div className="admin-rows">
					<div className="admin-row flex-wrap items-start py-3" key="hero">
						{heroUrl ? (
							<img
								alt="Ảnh chủ đạo hiện tại"
								className="aspect-video w-28 shrink-0 rounded-lg object-cover"
								src={heroUrl}
							/>
						) : (
							<div className="grid aspect-video w-28 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted">
								<ImageIcon aria-hidden="true" size={16} />
							</div>
						)}
						<div className="admin-row__text">
							<span className="admin-row__title">Ảnh chủ đạo</span>
							{heroUrl ? null : (
								<span className="text-xs leading-4 text-muted">Chưa có ảnh chủ đạo</span>
							)}
						</div>
						<div className="flex shrink-0 gap-2">
							<Button
								isDisabled={uploading}
								size="sm"
								type="button"
								variant="secondary"
								onPress={() => fileInputRef.current?.click()}
							>
								<ImageUp aria-hidden="true" size={16} />
								{uploading ? "Đang tải ảnh" : "Chọn ảnh"}
							</Button>
						</div>
						{uploading && uploadTarget === "hero" ? (
							<ProgressBar aria-label="Tiến độ tải ảnh" className="min-w-full" value={progress}>
								<ProgressBar.Track>
									<ProgressBar.Fill />
								</ProgressBar.Track>
							</ProgressBar>
						) : null}
						<input
							accept="image/jpeg,image/png,image/webp"
							className="sr-only"
							disabled={uploading}
							ref={fileInputRef}
							tabIndex={-1}
							type="file"
							aria-hidden="true"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								if (file) {
									void handleFileChosen(file);
								}
							}}
						/>
					</div>
					{slots.length > 0 && campaignGameId
						? slots.map((slot) => {
							const current = assets.find((asset) => asset.usage === slot.id) ?? null;
							const inputId = `campaign-game-slot-${slot.id}`;
							return (
								<div className="admin-row flex-wrap items-start py-3" key={slot.id}>
									{current?.url ? (
										<img
											alt={`${slot.label} hiện tại`}
											className="aspect-video w-28 shrink-0 rounded-lg object-cover"
											src={current.url}
										/>
									) : (
										<div className="grid aspect-video w-28 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted">
											<ImageIcon aria-hidden="true" size={16} />
										</div>
									)}
									<div className="admin-row__text">
										<span className="admin-row__title">{slot.label}</span>
										<span className="text-xs leading-4 text-muted">
											{current
												? slot.description
												: "Chưa có ảnh (dùng hình mặc định)"}
										</span>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button
											isDisabled={uploading}
											size="sm"
											type="button"
											variant="secondary"
											onPress={() => slotInputRefs.current?.[slot.id]?.click()}
										>
											<ImageUp aria-hidden="true" size={16} />
											{uploading ? "Đang tải ảnh" : "Chọn ảnh"}
										</Button>
										{current ? (
											<Button
												isDisabled={uploading}
												size="sm"
												type="button"
												variant="ghost"
												onPress={() => void handleRemove(slot, current.assetId)}
											>
												<Trash2 aria-hidden="true" size={16} />
												Gỡ ảnh
											</Button>
										) : null}
									</div>
									{uploading && uploadTarget === slot.id ? (
										<ProgressBar aria-label="Tiến độ tải ảnh" className="min-w-full" value={progress}>
											<ProgressBar.Track>
												<ProgressBar.Fill />
											</ProgressBar.Track>
										</ProgressBar>
									) : null}
									<input
										accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
										aria-hidden="true"
										className="sr-only"
										disabled={uploading}
										id={inputId}
										ref={(node) => {
											slotInputRefs.current[slot.id] = node;
										}}
										tabIndex={-1}
										type="file"
										onChange={(event) => {
											const file = event.currentTarget.files?.[0];
											if (file) {
												void handleFileChosen(file, slot);
											}
										}}
									/>
								</div>
							);
						})
						: null}
				</div>
			</Widget.Content>
		</Widget>
	);
}
