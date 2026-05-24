import type { Id } from "@/convex/_generated/dataModel";

export type CampaignTheme = "lunar" | "brand";
export type CampaignStatus = "draft" | "active";

export type CampaignForm = {
	id?: Id<"campaigns">;
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
	status: CampaignStatus;
	heroAssetId?: Id<"campaignAssets">;
};

export type CampaignSelection = Id<"campaigns"> | "new" | null;

export type CampaignView = {
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
	heroAsset?: {
		id: Id<"campaignAssets">;
		key: string;
		fileName: string;
		contentType: string | null;
		url: string | null;
	} | null;
	createdAt: number;
	updatedAt: number;
};

export type RecentCampaignAsset = {
	id: Id<"campaignAssets">;
	campaignId: Id<"campaigns"> | null;
	key: string;
	fileName: string;
	contentType: string | null;
	size: number | null;
	url: string;
	createdAt?: number;
};

export type SelectedHeroAsset =
	| RecentCampaignAsset
	| NonNullable<CampaignView["heroAsset"]>
	| null;

export type PlanResource = {
	used: number;
	limit: number | null;
	isFull: boolean;
	isExceeded: boolean;
};

export type BillingPlanKey = "pro" | "business";
export type BillingAction = BillingPlanKey | "portal" | null;
export type BillingProductPrice = {
	amountType?: string;
	priceAmount?: number;
	priceCurrency?: string;
};
export type BillingProduct = {
	id: string;
	name: string;
	description: string | null;
	isRecurring: boolean;
	recurringInterval: string | null;
	prices?: BillingProductPrice[];
} | null | undefined;

export type BillingPlanOption = {
	key: BillingPlanKey;
	label: string;
	product: BillingProduct;
	summary: string;
};

export type PendingUploadedAsset = {
	campaignId: Id<"campaigns">;
	key: string;
	fileName: string;
	contentType: string;
	size: number;
};

export type UploadingAsset = {
	fileName: string;
	size: number;
};

export type CampaignAnalyticsView = {
	sessionCreatedEvents?: number;
	redemptionCreatedEvents?: number;
	aggregatedRedemptionCount?: number;
	aggregatedRedeemedAmount?: number;
} | null | undefined;

export type ReadinessRow = {
	key: string;
	label: string;
	requiredCount: number;
	configuredRequiredCount: number;
	missingLabels: string[];
};

export type RuntimeReadinessRow = {
	key: string;
	label: string;
	isReady: boolean;
	detail: string;
};

export type ReadinessEndpointRow = {
	key: string;
	label: string;
	value: string;
};
