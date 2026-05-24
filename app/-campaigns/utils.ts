import type { Id } from "@/convex/_generated/dataModel";
import type { BillingProduct, CampaignForm, CampaignTheme } from "./types";

export const emptyForm: CampaignForm = {
	name: "Lunar Fortune",
	slug: "lunar-fortune",
	brandName: "Lì Xì Station",
	description: "Chiến dịch rút phong bao may mắn mặc định.",
	claimHeadline: "",
	claimSubtitle: "",
	claimCtaLabel: "",
	claimCollectLabel: "",
	claimWaitingMessage: "",
	theme: "lunar",
	status: "active",
};

export function createDraftCampaignForm(index: number): CampaignForm {
	const suffix = Math.max(1, index);
	return {
		name: `Brand Campaign ${suffix}`,
		slug: `brand-campaign-${suffix}`,
		brandName: "",
		description: "",
		claimHeadline: "",
		claimSubtitle: "",
		claimCtaLabel: "",
		claimCollectLabel: "",
		claimWaitingMessage: "",
		theme: "brand",
		status: "draft",
	};
}

export function formFromCampaign(campaign: {
	id: Id<"campaigns">;
	name: string;
	slug: string;
	brandName: string;
	description: string;
	claimHeadline: string;
	claimSubtitle: string;
	claimCtaLabel: string;
	claimCollectLabel: string;
	claimWaitingMessage: string;
	theme: CampaignTheme;
	status: "draft" | "active" | "archived";
	heroAsset?: { id: Id<"campaignAssets"> } | null;
}): CampaignForm {
	return {
		id: campaign.id,
		name: campaign.name,
		slug: campaign.slug,
		brandName: campaign.brandName,
		description: campaign.description,
		claimHeadline: campaign.claimHeadline,
		claimSubtitle: campaign.claimSubtitle,
		claimCtaLabel: campaign.claimCtaLabel,
		claimCollectLabel: campaign.claimCollectLabel,
		claimWaitingMessage: campaign.claimWaitingMessage,
		theme: campaign.theme,
		status: campaign.status === "archived" ? "draft" : campaign.status,
		heroAssetId: campaign.heroAsset?.id,
	};
}

export const readinessGroupLabels: Record<string, string> = {
	oauth: "Google OAuth",
	r2: "Cloudflare R2",
	polar: "Polar",
	operations: "Ops",
};

export const r2MetadataPendingError = "Chưa đọc được metadata R2";
export const changeableSubscriptionStatuses = new Set(["active", "trialing", "past_due"]);

export function getErrorMessage(unknownError: unknown, fallback: string) {
	return unknownError instanceof Error ? unknownError.message : fallback;
}

export function isR2MetadataPendingError(unknownError: unknown) {
	return unknownError instanceof Error && unknownError.message.includes(r2MetadataPendingError);
}

export function formatFileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(fileName: string) {
	const dotIndex = fileName.lastIndexOf(".");
	return dotIndex > 0 ? fileName.slice(dotIndex + 1).toUpperCase() : "IMG";
}

export function formatBillingPrice(product: BillingProduct) {
	if (!product) {
		return "Chưa sync";
	}

	const fixedPrice = product.prices?.find(
		(price) =>
			price.amountType === "fixed" &&
			typeof price.priceAmount === "number" &&
			typeof price.priceCurrency === "string",
	);
	if (!fixedPrice?.priceAmount || !fixedPrice.priceCurrency) {
		return product.isRecurring ? "Đang cấu hình giá" : "Không định kỳ";
	}

	const currency = fixedPrice.priceCurrency.toUpperCase();
	const intervalLabels: Record<string, string> = {
		day: "ngày",
		week: "tuần",
		month: "tháng",
		year: "năm",
	};
	const suffix =
		product.isRecurring && product.recurringInterval
			? ` / ${intervalLabels[product.recurringInterval] ?? product.recurringInterval}`
			: "";

	try {
		return `${new Intl.NumberFormat("vi-VN", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(fixedPrice.priceAmount / 100)}${suffix}`;
	} catch {
		return `${fixedPrice.priceAmount.toLocaleString("vi-VN")} ${currency}${suffix}`;
	}
}

export async function uploadFileWithProgress(
	url: string,
	file: File,
	onProgress?: (progress: { loaded: number; total: number }) => void,
) {
	await new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		xhr.setRequestHeader("Content-Type", file.type);
		if (onProgress) {
			xhr.upload.onprogress = (event) => {
				onProgress({ loaded: event.loaded, total: event.total });
			};
		}
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
				return;
			}
			reject(new Error(`Không thể upload ảnh: ${xhr.statusText || xhr.status}`));
		};
		xhr.onerror = () => reject(new Error("Không thể upload ảnh"));
		xhr.send(file);
	});
}
