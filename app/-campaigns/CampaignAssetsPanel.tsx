import { Chip } from "@heroui/react";
import { DropZone, EmptyState, ItemCard, ItemCardGroup, Widget } from "@heroui-pro/react";
import { Image } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES } from "@/lib/assetPolicy";
import { formatFileSize, getFileExtension } from "./utils";
import type { PendingUploadedAsset, SelectedHeroAsset, UploadingAsset } from "./types";

export type AssetStateRow = {
	icon: LucideIcon;
	title: string;
	description: string;
	chip: string;
	color: "success" | "danger" | "default";
};

export type CampaignAssetsPanelProps = {
	assetLimitReached: boolean;
	assetStateRows: readonly AssetStateRow[];
	heroPreview: string | null;
	retryingUploadAttach: boolean;
	selectedHeroAsset: SelectedHeroAsset;
	selectedHeroAssetSize: number | null;
	uploading: boolean;
	uploadingAsset: UploadingAsset | null;
	uploadProgress: number;
	visiblePendingUploadedAsset: PendingUploadedAsset | null;
	onAssetDrop: (event: {
		items: Array<{ kind: string; getFile?: () => Promise<File> }>;
	}) => Promise<void>;
	onAssetSelect: (fileList: FileList) => void;
	onRetryAttachUploadedAsset: () => void;
};

export function CampaignAssetsPanel({
	assetLimitReached,
	assetStateRows,
	heroPreview,
	retryingUploadAttach,
	selectedHeroAsset,
	selectedHeroAssetSize,
	uploading,
	uploadingAsset,
	uploadProgress,
	visiblePendingUploadedAsset,
	onAssetDrop,
	onAssetSelect,
	onRetryAttachUploadedAsset,
}: CampaignAssetsPanelProps) {
	return (
		<Widget>
			<Widget.Header>
				<Widget.Title>Hero asset</Widget.Title>
				<Widget.Description>
					Ảnh này sẽ dùng cho trải nghiệm public claim.
				</Widget.Description>
			</Widget.Header>
			<Widget.Content className="gap-4">
				<ItemCardGroup className="admin-card-grid--three" layout="grid" variant="secondary">
					{assetStateRows.map((row) => (
						<ItemCard className="items-start" key={row.title} variant="secondary">
							<ItemCard.Icon
								className={
									row.color === "success"
										? "text-success"
										: row.color === "danger"
											? "text-danger"
											: "text-muted"
								}
							>
								<row.icon aria-hidden="true" size={18} strokeWidth={2} />
							</ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>{row.title}</ItemCard.Title>
								<ItemCard.Description className="line-clamp-2 whitespace-normal">
									{row.description}
								</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action>
								<Chip color={row.color} size="sm" variant="soft">
									{row.chip}
								</Chip>
							</ItemCard.Action>
						</ItemCard>
					))}
				</ItemCardGroup>
				<DropZone>
					<DropZone.Area
						isDisabled={uploading || assetLimitReached}
						getDropOperation={(types) =>
							CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES.some((type) => types.has(type))
								? "copy"
								: "cancel"
						}
						onDrop={onAssetDrop as never}
					>
						<DropZone.Icon />
						<DropZone.Label>
							{assetLimitReached ? "Đã đạt giới hạn upload" : "Kéo ảnh hero vào đây"}
						</DropZone.Label>
						<DropZone.Description>
							JPG, PNG, WebP, GIF hoặc AVIF cho hero public claim.
						</DropZone.Description>
						<DropZone.Trigger isDisabled={uploading || assetLimitReached}>
							{uploading ? `Đang upload ${uploadProgress}%` : "Chọn ảnh"}
						</DropZone.Trigger>
					</DropZone.Area>
					<DropZone.Input
						accept={CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES.join(",")}
						onSelect={onAssetSelect}
					/>

					{uploadingAsset ? (
						<DropZone.FileList>
							<DropZone.FileItem status="uploading">
								<DropZone.FileFormatIcon
									color="blue"
									format={getFileExtension(uploadingAsset.fileName)}
								/>
								<DropZone.FileInfo>
									<DropZone.FileName>{uploadingAsset.fileName}</DropZone.FileName>
									<DropZone.FileMeta>
										{formatFileSize(uploadingAsset.size)} · {uploadProgress}%
									</DropZone.FileMeta>
									<DropZone.FileProgress value={uploadProgress}>
										<DropZone.FileProgressTrack>
											<DropZone.FileProgressFill />
										</DropZone.FileProgressTrack>
									</DropZone.FileProgress>
								</DropZone.FileInfo>
							</DropZone.FileItem>
						</DropZone.FileList>
					) : null}

					{visiblePendingUploadedAsset ? (
						<DropZone.FileList>
							<DropZone.FileItem status="failed">
								<DropZone.FileFormatIcon
									color="orange"
									format={getFileExtension(visiblePendingUploadedAsset.fileName)}
								/>
								<DropZone.FileInfo>
									<DropZone.FileName>
										{visiblePendingUploadedAsset.fileName}
									</DropZone.FileName>
									<DropZone.FileMeta>
										Metadata R2 chưa sẵn sàng. Thử gắn lại khi metadata sẵn sàng.
									</DropZone.FileMeta>
								</DropZone.FileInfo>
								<DropZone.FileRetryTrigger
									aria-label={`Retry ${visiblePendingUploadedAsset.fileName}`}
									isDisabled={uploading || retryingUploadAttach}
									onPress={onRetryAttachUploadedAsset}
								/>
							</DropZone.FileItem>
						</DropZone.FileList>
					) : null}
				</DropZone>
				{heroPreview ? (
					<img
						alt="Hero chiến dịch"
						className="admin-image-frame aspect-[16/7] w-full"
						src={heroPreview}
					/>
				) : (
					<div className="admin-image-frame grid aspect-[16/7] place-items-center">
						<EmptyState size="sm">
							<EmptyState.Header>
								<EmptyState.Media variant="icon">
									<Image aria-hidden="true" size={22} strokeWidth={2} />
								</EmptyState.Media>
								<EmptyState.Title>Chưa có ảnh hero</EmptyState.Title>
								<EmptyState.Description>
									Upload hoặc chọn ảnh gần đây để preview campaign.
								</EmptyState.Description>
							</EmptyState.Header>
						</EmptyState>
					</div>
				)}
				<ItemCardGroup variant="secondary">
					<ItemCard variant="secondary">
						<ItemCard.Icon>
							<Image aria-hidden="true" size={18} strokeWidth={2} />
						</ItemCard.Icon>
						<ItemCard.Content>
							<ItemCard.Title>
								{selectedHeroAsset?.fileName ?? "Template fallback"}
							</ItemCard.Title>
							<ItemCard.Description>
								{selectedHeroAsset
									? [
											selectedHeroAsset.contentType ?? "Image asset",
											selectedHeroAssetSize ? formatFileSize(selectedHeroAssetSize) : null,
										]
											.filter(Boolean)
											.join(" · ")
									: "Campaign đang dùng visual mặc định cho claim hero."}
							</ItemCard.Description>
						</ItemCard.Content>
						<ItemCard.Action>
							<Chip
								color={selectedHeroAsset ? "success" : "default"}
								size="sm"
								variant="soft"
							>
								{selectedHeroAsset ? "Ready" : "Fallback"}
							</Chip>
						</ItemCard.Action>
					</ItemCard>
				</ItemCardGroup>
			</Widget.Content>
		</Widget>
	);
}
