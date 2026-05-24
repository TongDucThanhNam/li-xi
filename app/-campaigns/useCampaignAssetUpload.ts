import { useMutation } from "convex/react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { validateCampaignAssetPolicy } from "@/lib/assetPolicy";
import type { CampaignForm, PendingUploadedAsset, UploadingAsset } from "./types";
import {
	getErrorMessage,
	isR2MetadataPendingError,
	uploadFileWithProgress,
} from "./utils";

type UseCampaignAssetUploadParams = {
	assetLimitReached: boolean;
	campaignId?: Id<"campaigns">;
	ownerReady: boolean;
	setError: (message: string) => void;
	setForm: Dispatch<SetStateAction<CampaignForm>>;
	setMessage: (message: string) => void;
};

export function useCampaignAssetUpload({
	assetLimitReached,
	campaignId,
	ownerReady,
	setError,
	setForm,
	setMessage,
}: UseCampaignAssetUploadParams) {
	const attachUploadedAsset = useMutation(api.campaigns.attachUploadedAsset);
	const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
	const syncUploadedAssetMetadata = useMutation(api.assets.syncMetadata);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploadingAsset, setUploadingAsset] = useState<UploadingAsset | null>(null);
	const [pendingUploadedAsset, setPendingUploadedAsset] =
		useState<PendingUploadedAsset | null>(null);
	const [retryingUploadAttach, setRetryingUploadAttach] = useState(false);

	const attachPendingHeroAsset = async (
		asset: PendingUploadedAsset,
		successMessage: string,
	) => {
		if (!ownerReady) {
			throw new Error("Phiên host không hợp lệ.");
		}

		const result = await attachUploadedAsset({
			campaignId: asset.campaignId,
			key: asset.key,
			fileName: asset.fileName,
			contentType: asset.contentType,
			size: asset.size,
		});
		setForm((current) => ({ ...current, heroAssetId: result.assetId }));
		setPendingUploadedAsset(null);
		setMessage(successMessage);
	};

	const handleRetryAttachUploadedAsset = async () => {
		if (!pendingUploadedAsset || retryingUploadAttach) {
			return;
		}

		setError("");
		setMessage("");
		setRetryingUploadAttach(true);
		try {
			await attachPendingHeroAsset(pendingUploadedAsset, "Đã gắn lại ảnh hero.");
		} catch (unknownError) {
			if (!isR2MetadataPendingError(unknownError)) {
				setPendingUploadedAsset(null);
			}
			setError(getErrorMessage(unknownError, "Không thể gắn lại ảnh hero"));
		} finally {
			setRetryingUploadAttach(false);
		}
	};

	const uploadHeroAsset = async (file: File) => {
		if (!ownerReady || !campaignId) {
			setError("Hãy lưu chiến dịch trước khi upload ảnh.");
			return;
		}
		if (assetLimitReached) {
			setError("Gói hiện tại đã đạt giới hạn upload ảnh chiến dịch.");
			return;
		}
		try {
			validateCampaignAssetPolicy({
				contentType: file.type,
				fileName: file.name,
				size: file.size,
			});
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể kiểm tra ảnh upload",
			);
			return;
		}

		setError("");
		setMessage("");
		setUploading(true);
		setUploadingAsset({ fileName: file.name, size: file.size });
		setUploadProgress(0);
		try {
			const { key, url } = await generateUploadUrl({
				campaignId,
				fileName: file.name,
				contentType: file.type,
				size: file.size,
			});
			await uploadFileWithProgress(url, file, ({ loaded, total }) => {
				setUploadProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
			});
			await syncUploadedAssetMetadata({ key });
			const uploadedAsset: PendingUploadedAsset = {
				campaignId,
				key,
				fileName: file.name,
				contentType: file.type,
				size: file.size,
			};
			setPendingUploadedAsset(uploadedAsset);

			for (let attempt = 1; attempt <= 4; attempt++) {
				try {
					await attachPendingHeroAsset(uploadedAsset, "Đã upload và gắn ảnh hero.");
					break;
				} catch (err) {
					if (isR2MetadataPendingError(err) && attempt < 4) {
						await new Promise((resolve) => setTimeout(resolve, 500));
						continue;
					}
					throw err;
				}
			}
		} catch (unknownError) {
			if (!isR2MetadataPendingError(unknownError)) {
				setPendingUploadedAsset(null);
			}
			setError(getErrorMessage(unknownError, "Không thể upload ảnh chiến dịch"));
		} finally {
			setUploading(false);
			setUploadingAsset(null);
			setUploadProgress(0);
		}
	};

	const handleAssetSelect = (fileList: FileList) => {
		const file = fileList[0];
		if (file) {
			void uploadHeroAsset(file);
		}
	};

	const handleAssetDrop = async (event: {
		items: Array<{ kind: string; getFile?: () => Promise<File> }>;
	}) => {
		const droppedFiles = await Promise.all(
			event.items
				.filter((item) => item.kind === "file" && item.getFile)
				.map((item) => item.getFile?.()),
		);
		const file = droppedFiles.find((item): item is File => Boolean(item));

		if (file) {
			await uploadHeroAsset(file);
		}
	};

	return {
		clearPendingUploadedAsset: () => setPendingUploadedAsset(null),
		handleAssetDrop,
		handleAssetSelect,
		handleRetryAttachUploadedAsset,
		pendingUploadedAsset,
		retryingUploadAttach,
		uploading,
		uploadingAsset,
		uploadProgress,
	};
}
