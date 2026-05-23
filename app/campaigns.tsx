"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import HostHeader from "@/app/draw/components/HostHeader";
import HostShell from "@/app/draw/components/HostShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import {
	CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES,
	validateCampaignAssetPolicy,
} from "@/lib/assetPolicy";
import { getBillingReturnPublicAppUrl, getPublicAppOrigin } from "@/lib/publicAppUrl";
import { useHostLogout } from "@/lib/useHostLogout";
import { useOwnerSession } from "@/lib/useOwnerSession";

type CampaignTheme = "lunar" | "brand";
type CampaignStatus = "draft" | "active";

type CampaignForm = {
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

type CampaignSelection = Id<"campaigns"> | "new" | null;

type PlanResource = {
	used: number;
	limit: number | null;
	isFull: boolean;
	isExceeded: boolean;
};

type BillingPlanKey = "pro" | "business";
type BillingAction = BillingPlanKey | "portal" | null;
type BillingProductPrice = {
	amountType?: string;
	priceAmount?: number;
	priceCurrency?: string;
};
type BillingProduct = {
	id: string;
	name: string;
	description: string | null;
	isRecurring: boolean;
	recurringInterval: string | null;
	prices?: BillingProductPrice[];
} | null | undefined;

type PendingUploadedAsset = {
	campaignId: Id<"campaigns">;
	key: string;
	fileName: string;
	contentType: string;
	size: number;
};

async function uploadFileWithProgress(
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

const emptyForm: CampaignForm = {
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

function createDraftCampaignForm(index: number): CampaignForm {
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

function formFromCampaign(campaign: {
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

const readinessGroupLabels: Record<string, string> = {
	oauth: "Google OAuth",
	r2: "Cloudflare R2",
	polar: "Polar",
	operations: "Ops",
};

const r2MetadataPendingError = "Chưa đọc được metadata R2";
const changeableSubscriptionStatuses = new Set(["active", "trialing", "past_due"]);

function getErrorMessage(unknownError: unknown, fallback: string) {
	return unknownError instanceof Error ? unknownError.message : fallback;
}

function isR2MetadataPendingError(unknownError: unknown) {
	return unknownError instanceof Error && unknownError.message.includes(r2MetadataPendingError);
}

function formatCurrency(amount: number) {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

function formatBillingPrice(product: BillingProduct) {
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

export const Route = createFileRoute("/campaigns")({
	beforeLoad: requireHostRouteAuth,
	component: CampaignsPage,
});

function CampaignsPage() {
	const navigate = useNavigate();
	const owner = useOwnerSession();
	const logout = useHostLogout();
	const [selectedCampaignId, setSelectedCampaignId] =
		useState<CampaignSelection>(null);
	const selectedWorkspaceCampaignId =
		selectedCampaignId && selectedCampaignId !== "new" ? selectedCampaignId : undefined;
	const workspace = useQuery(
		api.campaigns.getWorkspace,
		owner ? { selectedCampaignId: selectedWorkspaceCampaignId } : "skip",
	);
	const planState = useQuery(
		api.entitlements.getPlanState,
		owner ? {} : "skip",
	);
	const billingProducts = useQuery(
		api.billing.getConfiguredProducts,
		owner ? {} : "skip",
	);
	const saasReadiness = useQuery(
		api.ops.getHostSaaSReadiness,
		owner ? {} : "skip",
	);
	const saveCampaign = useMutation(api.campaigns.saveCampaign);
	const ensureDefaultCampaign = useMutation(api.campaigns.ensureDefaultCampaign);
	const attachUploadedAsset = useMutation(api.campaigns.attachUploadedAsset);
	const generateUploadUrl = useMutation(api.assets.generateUploadUrl);
	const syncUploadedAssetMetadata = useMutation(api.assets.syncMetadata);
	const generateCheckoutLink = useAction(api.billing.generateCheckoutLink);
	const generateCustomerPortalUrl = useAction(api.billing.generateCustomerPortalUrl);
	const changeCurrentSubscription = useAction(api.billing.changeCurrentSubscription);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const [form, setForm] = useState<CampaignForm>(emptyForm);
	const [saving, setSaving] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [pendingUploadedAsset, setPendingUploadedAsset] =
		useState<PendingUploadedAsset | null>(null);
	const [retryingUploadAttach, setRetryingUploadAttach] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [billingAction, setBillingAction] = useState<BillingAction>(null);
	const campaignAnalytics = useQuery(
		api.analytics.getCampaignAnalytics,
		owner && form.id ? { campaignId: form.id } : "skip",
	);

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	useEffect(() => {
		if (!workspace) {
			return;
		}

		if (selectedCampaignId === "new") {
			return;
		}

		const campaigns = workspace.campaigns ?? [];
		const isSavedSelectionWaitingForQuery =
			Boolean(selectedCampaignId) && form.id === selectedCampaignId;
		if (
			selectedCampaignId &&
			(campaigns.some((campaign) => campaign.id === selectedCampaignId) ||
				isSavedSelectionWaitingForQuery)
		) {
			return;
		}

		setSelectedCampaignId(workspace.activeCampaign?.id ?? campaigns[0]?.id ?? null);
	}, [form.id, selectedCampaignId, workspace]);

	const selectedCampaign = useMemo(() => {
		if (!workspace || selectedCampaignId === "new") {
			return null;
		}

		return (
			(workspace.campaigns ?? []).find(
				(campaign) => campaign.id === selectedCampaignId,
			) ?? null
		);
	}, [selectedCampaignId, workspace]);

	useEffect(() => {
		if (!selectedCampaign) {
			return;
		}

		setForm(formFromCampaign(selectedCampaign));
	}, [selectedCampaign]);

	const selectableRecentAssets = useMemo(
		() =>
			(workspace?.recentAssets ?? []).filter(
				(asset) => Boolean(form.id) && asset.campaignId === form.id,
			),
		[form.id, workspace?.recentAssets],
	);
	const heroPreview =
		selectableRecentAssets.find((asset) => asset.id === form.heroAssetId)?.url ??
		selectedCampaign?.heroAsset?.url ??
		null;
	const campaignCreateLimitReached =
		!form.id && (planState?.resources.campaigns.isFull ?? false);
	const assetLimitReached = planState?.resources.assets.isFull ?? false;
	const canSave =
		Boolean(owner) &&
		form.name.trim().length >= 3 &&
		form.slug.trim().length >= 3 &&
		!campaignCreateLimitReached &&
		!saving;
	const shareBaseUrl = useMemo(() => {
		return getPublicAppOrigin();
	}, []);
	const billingPlans = useMemo(() => {
		const products = billingProducts as
			| { pro?: BillingProduct; business?: BillingProduct }
			| undefined;

		return [
			{
				key: "pro" as const,
				label: "Pro",
				product: products?.pro,
				summary: "Campaign, ảnh và lượt mở nhiều hơn.",
			},
			{
				key: "business" as const,
				label: "Business",
				product: products?.business,
				summary: "Quy mô nhãn hàng và redemption lớn.",
			},
		];
	}, [billingProducts]);

	const updateForm = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const formatPlanResource = (resource: PlanResource) => {
		const limit = resource.limit === null ? "∞" : resource.limit.toLocaleString("vi-VN");
		return `${resource.used.toLocaleString("vi-VN")} / ${limit}`;
	};

	const planPercent = (resource: PlanResource) => {
		if (resource.limit === null || resource.limit === 0) {
			return 42;
		}
		return Math.min(100, Math.round((resource.used / resource.limit) * 100));
	};

	const handleLogout = async () => {
		await logout();
		void navigate({ to: "/auth", replace: true });
	};

	const handleEnsureDefault = async () => {
		if (!owner) return;
		setError("");
		setMessage("");
		setSaving(true);
		try {
			const result = await ensureDefaultCampaign({});
			setSelectedCampaignId(result.campaignId);
			setMessage("Đã tạo chiến dịch mặc định.");
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể tạo chiến dịch",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleSelectCampaign = (campaignId: Id<"campaigns">) => {
		setSelectedCampaignId(campaignId);
		setError("");
		setMessage("");
	};

	const handleNewCampaign = () => {
		if (planState?.resources.campaigns.isFull) {
			setError("Gói hiện tại đã đạt giới hạn số chiến dịch.");
			return;
		}

		const nextIndex = (workspace?.campaigns.length ?? 0) + 1;
		setSelectedCampaignId("new");
		setForm(createDraftCampaignForm(nextIndex));
		setPendingUploadedAsset(null);
		setError("");
		setMessage("Đang tạo bản nháp campaign mới.");
	};

	const handleSave = async () => {
		if (!owner || !canSave) return;
		setError("");
		setMessage("");
		setSaving(true);
		try {
				const result = await saveCampaign({
					campaignId: form.id,
					name: form.name,
					slug: form.slug,
					brandName: form.brandName || undefined,
					description: form.description || undefined,
					claimHeadline: form.claimHeadline || undefined,
					claimSubtitle: form.claimSubtitle || undefined,
					claimCtaLabel: form.claimCtaLabel || undefined,
					claimCollectLabel: form.claimCollectLabel || undefined,
					claimWaitingMessage: form.claimWaitingMessage || undefined,
					theme: form.theme,
					status: form.status,
					heroAssetId: form.heroAssetId,
				});
			setForm((current) => ({
				...current,
				id: result.campaignId,
				slug: result.slug,
			}));
			setSelectedCampaignId(result.campaignId);
			setMessage("Đã lưu chiến dịch.");
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể lưu chiến dịch",
			);
		} finally {
			setSaving(false);
		}
	};

	const attachPendingHeroAsset = async (
		asset: PendingUploadedAsset,
		successMessage: string,
	) => {
		if (!owner) {
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

	const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
		const campaignId = form.id;
		if (!owner || !campaignId) {
			setError("Hãy lưu chiến dịch trước khi upload ảnh.");
			return;
		}
		if (assetLimitReached) {
			setError("Gói hiện tại đã đạt giới hạn upload ảnh chiến dịch.");
			return;
		}
		const file = event.currentTarget.files?.[0];
		if (!file) return;
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
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			return;
		}

		setError("");
		setMessage("");
		setUploading(true);
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
			await attachPendingHeroAsset(uploadedAsset, "Đã upload và gắn ảnh hero.");
		} catch (unknownError) {
			if (!isR2MetadataPendingError(unknownError)) {
				setPendingUploadedAsset(null);
			}
			setError(getErrorMessage(unknownError, "Không thể upload ảnh chiến dịch"));
		} finally {
			setUploading(false);
			setUploadProgress(0);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleBillingPlan = async (planKey: BillingPlanKey, product: BillingProduct) => {
		if (!product?.id) {
			setError("Gói này chưa được sync từ Polar. Chạy billing:syncPolarProducts trước.");
			return;
		}
		if (typeof window === "undefined" || billingAction) {
			return;
		}

		const currentProductId = planState?.subscription?.productId ?? null;
		if (currentProductId === product.id) {
			return;
		}

		setError("");
		setMessage("");
		setBillingAction(planKey);
		try {
			const billingReturnUrl = getBillingReturnPublicAppUrl();
			const currentSubscriptionStatus = planState?.subscription?.status?.toLowerCase();
			if (
				currentSubscriptionStatus &&
				changeableSubscriptionStatuses.has(currentSubscriptionStatus)
			) {
				await changeCurrentSubscription({ productId: product.id });
				setMessage(`Đã gửi yêu cầu đổi sang gói ${product.name}.`);
				return;
			}

			const { url } = await generateCheckoutLink({
				productIds: [product.id],
				origin: getPublicAppOrigin(),
				successUrl: billingReturnUrl,
				locale: "vi",
			});
			window.location.assign(url);
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể mở checkout Polar",
			);
		} finally {
			setBillingAction(null);
		}
	};

	const handleBillingPortal = async () => {
		if (typeof window === "undefined" || billingAction) {
			return;
		}

		setError("");
		setMessage("");
		setBillingAction("portal");
		try {
			const { url } = await generateCustomerPortalUrl({
				returnUrl: getBillingReturnPublicAppUrl(),
			});
			window.location.assign(url);
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể mở customer portal Polar",
			);
		} finally {
			setBillingAction(null);
		}
	};

	if (!owner || workspace === undefined) {
		return (
			<HostShell>
				<div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 text-center">
					<div className="h-16 w-16 animate-spin rounded-full border-4 border-gold-base/20 border-t-gold-base shadow-[0_0_20px_rgba(212,175,55,0.2)]" />
					<p className="font-cinzel text-sm uppercase tracking-[0.18em] text-gold-shine/75">
						Đang tải Campaign Studio
					</p>
				</div>
			</HostShell>
		);
	}

	const planRows = planState
		? [
				{ label: "Chiến dịch", resource: planState.resources.campaigns },
				{ label: "Ảnh", resource: planState.resources.assets },
				{ label: "Lượt mở", resource: planState.resources.openSessions },
				{ label: "Trao thưởng", resource: planState.resources.redemptions },
			]
		: [];
	const readinessRows = saasReadiness
		? Object.entries(saasReadiness.integrations).map(([key, requirements]) => {
				const required = requirements.filter((requirement) => requirement.required);
				const missingRequired = required.filter((requirement) => !requirement.configured);
				return {
					key,
					label: readinessGroupLabels[key] ?? key,
					requiredCount: required.length,
					configuredRequiredCount: required.length - missingRequired.length,
					missingLabels: missingRequired.map((requirement) => requirement.label),
				};
			})
		: [];
	const runtimeReadinessRows = saasReadiness
		? Object.entries(saasReadiness.runtimeChecks).flatMap(([group, requirements]) =>
				requirements.map((requirement) => ({
					key: `${group}.${requirement.key}`,
					label: requirement.label,
					isReady: requirement.ready,
					detail: requirement.detail,
				})),
			)
		: [];
	const readinessEndpointRows = saasReadiness
		? [
				{
					key: "googleCallbackUrl",
					label: "Google callback",
					value: saasReadiness.endpoints.googleCallbackUrl,
				},
				{
					key: "polarWebhookUrl",
					label: "Polar webhook",
					value: saasReadiness.endpoints.polarWebhookUrl,
				},
			].filter((row) => row.value)
		: [];
	const readinessReady = saasReadiness?.allRequiredReady ?? false;
	const visiblePendingUploadedAsset =
		pendingUploadedAsset?.campaignId === form.id ? pendingUploadedAsset : null;

	return (
		<HostShell>
			<section className="relative z-10 flex h-full w-full flex-col gap-4 overflow-hidden animate-fade-in-up">
				<HostHeader
					ownerUsername={owner.username}
					onCampaigns={() => void navigate({ to: "/campaigns" })}
					onDraw={() => void navigate({ to: "/draw" })}
					onSetup={() => void navigate({ to: "/setup" })}
					onLeaderboard={() => void navigate({ to: "/leaderboard" })}
					onLogout={handleLogout}
				/>

				<div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-12">
					<section className="min-h-0 overflow-auto rounded-2xl border border-gold-base/35 bg-linear-to-br from-red-deep/85 via-black-ink/95 to-black-ink p-5 shadow-2xl lg:col-span-7">
						<div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-gold-base/15 pb-4">
							<div>
								<p className="font-vn text-xs uppercase tracking-[0.2em] text-gold-base/70">
									Campaign Studio
								</p>
								<h1 className="mt-1 font-cinzel text-3xl text-gold-shine">
									Chiến dịch bốc thăm
								</h1>
							</div>
							<span className="rounded-full border border-gold-base/35 bg-gold-base/10 px-3 py-1 font-vn text-xs text-gold-shine/80">
								{form.status === "active" ? "Đang chạy" : "Bản nháp"}
							</span>
						</div>

						{workspace.campaigns.length > 0 ? (
							<div className="mb-5 grid gap-3 rounded-xl border border-gold-base/20 bg-black-ink/45 p-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="font-vn text-xs uppercase tracking-[0.18em] text-gold-base/60">
											Campaign list
										</p>
										<p className="font-vn text-sm text-gold-shine/55">
											Chọn campaign để chỉnh copy, asset và trạng thái.
										</p>
									</div>
									<button
										type="button"
										className="h-10 rounded-full border border-gold-base/40 px-4 font-vn text-sm font-bold text-gold-base transition-colors hover:bg-gold-base/10 disabled:cursor-not-allowed disabled:opacity-45"
										disabled={planState?.resources.campaigns.isFull ?? false}
										onClick={handleNewCampaign}
									>
										Tạo campaign
									</button>
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									{workspace.campaigns.map((campaign) => (
										<button
											key={campaign.id}
											type="button"
											className={`min-h-16 rounded-lg border px-3 py-2 text-left transition-colors ${
												selectedCampaignId === campaign.id
													? "border-gold-base/70 bg-gold-base/15"
													: "border-gold-base/15 bg-black-ink/55 hover:border-gold-base/45"
											}`}
											onClick={() => handleSelectCampaign(campaign.id)}
										>
											<span className="flex items-center justify-between gap-3">
												<span className="truncate font-cinzel text-base text-gold-shine">
													{campaign.name}
												</span>
												<span
													className={`shrink-0 rounded-full border px-2 py-0.5 font-vn text-[10px] uppercase tracking-[0.12em] ${
														campaign.status === "active"
															? "border-gold-base/35 bg-gold-base/10 text-gold-base"
															: "border-gold-base/20 bg-black-ink/55 text-gold-shine/45"
													}`}
												>
													{campaign.status === "active" ? "Active" : "Draft"}
												</span>
											</span>
											<span className="mt-1 block truncate font-vn text-xs text-gold-shine/45">
												/{campaign.slug}
											</span>
										</button>
									))}
									{selectedCampaignId === "new" ? (
										<div className="min-h-16 rounded-lg border border-gold-base/70 bg-gold-base/15 px-3 py-2">
											<p className="font-cinzel text-base text-gold-shine">
												Campaign mới
											</p>
											<p className="mt-1 font-vn text-xs text-gold-shine/45">
												Chưa lưu vào Convex
											</p>
										</div>
									) : null}
								</div>
							</div>
						) : null}

						{selectedCampaign || selectedCampaignId === "new" || form.id === selectedCampaignId ? (
							<div className="grid gap-4">
								<div className="grid gap-2">
									<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
										Tên chiến dịch
									</label>
									<input
										className="h-12 rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
										value={form.name}
										onChange={(event) => updateForm("name", event.currentTarget.value)}
									/>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<div className="grid gap-2">
										<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
											Slug
										</label>
										<input
											className="h-12 rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
											value={form.slug}
											onChange={(event) => updateForm("slug", event.currentTarget.value)}
										/>
									</div>
									<div className="grid gap-2">
										<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
											Thương hiệu
										</label>
										<input
											className="h-12 rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
											value={form.brandName}
											onChange={(event) => updateForm("brandName", event.currentTarget.value)}
										/>
									</div>
								</div>

									<div className="grid gap-2">
										<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
											Mô tả end-user
										</label>
									<textarea
										className="min-h-24 resize-none rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 py-3 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
										value={form.description}
										onChange={(event) => updateForm("description", event.currentTarget.value)}
										/>
									</div>

									<div className="grid gap-3 rounded-xl border border-gold-base/20 bg-black-ink/45 p-4">
										<div>
											<h2 className="font-cinzel text-xl text-gold-shine">
												Public claim copy
											</h2>
											<p className="font-vn text-sm text-gold-shine/55">
												Copy này hiển thị ở hero khi người nhận mở link rút.
											</p>
										</div>
										<div className="grid gap-3 md:grid-cols-2">
											<div className="grid gap-2">
												<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
													Headline
												</label>
												<input
													className="h-12 rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
													value={form.claimHeadline}
													onChange={(event) =>
														updateForm("claimHeadline", event.currentTarget.value)
													}
													placeholder={form.name || "Lunar Fortune"}
												/>
											</div>
											<div className="grid gap-2">
												<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
													Start CTA
												</label>
												<input
													className="h-12 rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
													value={form.claimCtaLabel}
													onChange={(event) =>
														updateForm("claimCtaLabel", event.currentTarget.value)
													}
													placeholder="Thử vận may"
												/>
											</div>
										</div>
										<div className="grid gap-3 md:grid-cols-2">
											<div className="grid gap-2">
												<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
													Subtitle
												</label>
												<textarea
													className="min-h-20 resize-none rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 py-3 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
													value={form.claimSubtitle}
													onChange={(event) =>
														updateForm("claimSubtitle", event.currentTarget.value)
													}
													placeholder={form.brandName || "Premium Gacha Experience"}
												/>
											</div>
											<div className="grid gap-2">
												<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
													Collect CTA
												</label>
												<input
													className="h-12 rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
													value={form.claimCollectLabel}
													onChange={(event) =>
														updateForm("claimCollectLabel", event.currentTarget.value)
													}
													placeholder="Nhận thưởng"
												/>
											</div>
										</div>
										<div className="grid gap-3">
											<div className="grid gap-2">
												<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
													Thông điệp chờ
												</label>
												<textarea
													className="min-h-20 resize-none rounded-xl border border-gold-base/25 bg-black-ink/65 px-4 py-3 text-gold-shine outline-none transition-colors focus:border-gold-base/70"
													value={form.claimWaitingMessage}
													onChange={(event) =>
														updateForm("claimWaitingMessage", event.currentTarget.value)
													}
													placeholder="Đang chuẩn bị lượt rút..."
												/>
											</div>
										</div>
									</div>

									<div className="grid gap-4 md:grid-cols-2">
									<div className="grid gap-2">
										<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
											Theme
										</label>
										<div className="grid grid-cols-2 rounded-xl border border-gold-base/25 bg-black-ink/60 p-1">
											{(["lunar", "brand"] as const).map((theme) => (
												<button
													key={theme}
													type="button"
													className={`rounded-lg px-3 py-2 font-vn text-sm font-bold transition-colors ${
														form.theme === theme
															? "bg-gold-base text-red-deep"
															: "text-gold-shine/60 hover:bg-gold-base/10"
													}`}
													onClick={() => updateForm("theme", theme)}
												>
													{theme === "lunar" ? "Lì xì" : "Brand"}
												</button>
											))}
										</div>
									</div>
									<div className="grid gap-2">
										<label className="font-vn text-xs font-bold uppercase tracking-[0.16em] text-gold-shine/50">
											Trạng thái
										</label>
										<div className="grid grid-cols-2 rounded-xl border border-gold-base/25 bg-black-ink/60 p-1">
											{(["active", "draft"] as const).map((status) => (
												<button
													key={status}
													type="button"
													className={`rounded-lg px-3 py-2 font-vn text-sm font-bold transition-colors ${
														form.status === status
															? "bg-gold-base text-red-deep"
															: "text-gold-shine/60 hover:bg-gold-base/10"
													}`}
													onClick={() => updateForm("status", status)}
												>
													{status === "active" ? "Active" : "Draft"}
												</button>
											))}
										</div>
									</div>
								</div>

								<div className="grid gap-3 rounded-xl border border-dashed border-gold-base/35 bg-black-ink/45 p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<h2 className="font-cinzel text-xl text-gold-shine">Hero asset</h2>
											<p className="font-vn text-sm text-gold-shine/60">
												Ảnh này sẽ dùng cho trải nghiệm public claim.
											</p>
										</div>
										<button
											type="button"
											className="rounded-full border border-gold-base/40 px-4 py-2 font-vn text-sm font-bold text-gold-base transition-colors hover:bg-gold-base/10 disabled:cursor-not-allowed disabled:opacity-45"
											disabled={uploading || assetLimitReached}
											onClick={() => fileInputRef.current?.click()}
										>
											{uploading
												? `Đang upload ${uploadProgress}%`
												: assetLimitReached
													? "Đã đạt giới hạn"
													: "Upload ảnh"}
										</button>
										<input
											ref={fileInputRef}
											className="hidden"
											type="file"
											accept={CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES.join(",")}
											onChange={handleUpload}
										/>
									</div>
									{heroPreview ? (
										<img
											className="aspect-[16/7] w-full rounded-lg border border-gold-base/20 object-cover"
											src={heroPreview}
											alt="Hero chiến dịch"
										/>
									) : (
										<div className="grid aspect-[16/7] place-items-center rounded-lg border border-gold-base/15 bg-red-deep/20 text-center font-vn text-sm text-gold-shine/45">
											Chưa có ảnh hero
										</div>
									)}
									{visiblePendingUploadedAsset ? (
										<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-base/20 bg-black-ink/55 px-3 py-2">
											<div className="min-w-0">
												<p className="truncate font-vn text-sm font-bold text-gold-shine/75">
													{visiblePendingUploadedAsset.fileName}
												</p>
												<p className="font-vn text-xs text-gold-shine/45">
													Metadata R2 chưa sẵn sàng, có thể thử gắn lại.
												</p>
											</div>
											<button
												type="button"
												className="h-9 rounded-full border border-gold-base/40 px-4 font-vn text-xs font-bold text-gold-base transition-colors hover:bg-gold-base/10 disabled:cursor-not-allowed disabled:opacity-45"
												disabled={uploading || retryingUploadAttach}
												onClick={() => void handleRetryAttachUploadedAsset()}
											>
												{retryingUploadAttach ? "Đang gắn..." : "Thử gắn lại"}
											</button>
										</div>
									) : null}
								</div>

								{error || message ? (
									<div
										className={`rounded-xl border px-4 py-3 font-vn text-sm ${
											error
												? "border-red-vivid/40 bg-red-deep/35 text-red-vivid"
												: "border-gold-base/35 bg-gold-base/10 text-gold-shine/80"
										}`}
									>
										{error || message}
									</div>
								) : null}

								<button
									type="button"
									className="h-12 rounded-full border border-gold-base/50 bg-linear-to-r from-gold-base to-gold-shine font-cinzel font-bold uppercase tracking-widest text-red-deep shadow-xl transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
									disabled={!canSave}
									onClick={handleSave}
								>
									{saving
										? "Đang lưu..."
										: campaignCreateLimitReached
											? "Đã đạt giới hạn"
											: "Lưu chiến dịch"}
								</button>
							</div>
						) : (
							<div className="grid min-h-[360px] place-items-center rounded-xl border border-dashed border-gold-base/35 bg-black-ink/35 p-8 text-center">
								<div>
									<h2 className="font-cinzel text-3xl text-gold-shine">
										Chưa có chiến dịch
									</h2>
									<p className="mt-2 font-vn text-gold-shine/60">
										Tạo chiến dịch mặc định để bắt đầu chuẩn hóa flow SaaS.
									</p>
									<button
										type="button"
										className="mt-6 rounded-full border border-gold-base/50 bg-gold-base px-5 py-3 font-cinzel font-bold uppercase tracking-widest text-red-deep"
										onClick={handleEnsureDefault}
									>
										Tạo mặc định
									</button>
								</div>
							</div>
						)}
					</section>

					<aside className="min-h-0 overflow-auto rounded-2xl border border-gold-base/30 bg-black-ink/70 p-4 shadow-2xl lg:col-span-5">
						<h2 className="font-cinzel text-2xl text-gold-shine">Preview</h2>
						<div className="mt-4 overflow-hidden rounded-xl border border-gold-base/20 bg-red-deep/25">
							{heroPreview ? (
								<img
									className="aspect-[16/9] w-full object-cover"
									src={heroPreview}
									alt="Campaign preview"
								/>
							) : (
								<div className="grid aspect-[16/9] place-items-center bg-black-ink/40 text-gold-shine/45">
									Lunar Fortune
								</div>
							)}
							<div className="p-4">
								<p className="font-vn text-xs uppercase tracking-[0.2em] text-gold-base/70">
									{form.brandName || owner.username}
								</p>
								<h3 className="mt-1 font-cinzel text-3xl text-gold-shine">
									{form.claimHeadline || form.name}
								</h3>
								<p className="mt-2 font-vn text-sm text-gold-shine/65">
									{form.claimSubtitle ||
										form.description ||
										"Mô tả trải nghiệm claim sẽ hiển thị tại đây."}
								</p>
									<p className="mt-3 inline-flex rounded-full border border-gold-base/30 bg-gold-base/10 px-3 py-1 font-vn text-xs text-gold-base">
										{form.claimCtaLabel || "Thử vận may"}
									</p>
									<p className="mt-2 font-vn text-xs text-gold-shine/45">
										Result CTA: {form.claimCollectLabel || "Nhận thưởng"}
									</p>
								</div>
							</div>

						<div className="mt-5 rounded-xl border border-gold-base/20 bg-black-ink/45 p-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="font-vn text-xs uppercase tracking-[0.18em] text-gold-base/60">
										Plan
									</p>
									<h3 className="mt-1 font-cinzel text-2xl text-gold-shine">
										{planState?.label ?? "Đang tải"}
									</h3>
								</div>
								<span className="rounded-full border border-gold-base/35 bg-gold-base/10 px-3 py-1 font-vn text-xs text-gold-shine/75">
									{planState?.source === "polar" ? "Polar active" : "Fallback"}
								</span>
							</div>
							{planState?.subscription ? (
								<p className="mt-3 rounded-lg border border-gold-base/15 bg-black-ink/55 px-3 py-2 font-vn text-xs text-gold-shine/65">
									{planState.subscription.productName} · {planState.subscription.status}
								</p>
								) : planState?.billingError ? (
									<p className="mt-3 rounded-lg border border-red-vivid/25 bg-red-deep/25 px-3 py-2 font-vn text-xs text-red-vivid">
										{planState.billingError}
									</p>
								) : null}
								<div className="mt-4 grid gap-2">
									<div className="grid gap-2 sm:grid-cols-2">
										{billingPlans.map((plan) => {
											const product = plan.product;
											const isCurrent =
												Boolean(product?.id) &&
												planState?.subscription?.productId === product?.id;
											const isBusy = billingAction === plan.key;
											const isDisabled =
												Boolean(billingAction) || isCurrent || !product?.id;

											return (
												<button
													key={plan.key}
													type="button"
													className="min-h-[76px] rounded-lg border border-gold-base/30 bg-gold-base/10 px-3 py-2 text-left transition-colors hover:border-gold-base/70 hover:bg-gold-base/15 disabled:cursor-not-allowed disabled:opacity-45"
													disabled={isDisabled}
													onClick={() => void handleBillingPlan(plan.key, product)}
												>
													<span className="block font-cinzel text-base text-gold-shine">
														{plan.label}
													</span>
													<span className="mt-0.5 block font-vn text-xs text-gold-base">
														{formatBillingPrice(product)}
													</span>
													<span className="mt-1 block font-vn text-xs text-gold-shine/50">
														{isBusy
															? "Đang xử lý..."
															: isCurrent
																? "Đang dùng"
																: product?.id
																	? plan.summary
																	: "Chưa có product"}
													</span>
												</button>
											);
										})}
									</div>
									<button
										type="button"
										className="h-10 rounded-lg border border-gold-base/25 bg-black-ink/65 px-3 font-vn text-sm font-bold text-gold-shine/75 transition-colors hover:border-gold-base/60 hover:text-gold-shine disabled:cursor-not-allowed disabled:opacity-45"
										disabled={Boolean(billingAction) || !planState?.subscription}
										onClick={() => void handleBillingPortal()}
									>
										{billingAction === "portal"
											? "Đang mở portal..."
											: planState?.subscription
												? "Quản lý subscription"
												: "Chưa có subscription"}
									</button>
								</div>
								<div className="mt-4 grid gap-3">
									{planRows.map((row) => (
										<div key={row.label}>
										<div className="flex items-center justify-between gap-3 font-vn text-xs">
											<span className="text-gold-shine/55">{row.label}</span>
											<span
												className={
													row.resource.isExceeded || row.resource.isFull
														? "font-bold text-red-vivid"
														: "text-gold-shine/75"
												}
											>
												{formatPlanResource(row.resource)}
											</span>
										</div>
										<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black-ink/80">
											<div
												className={`h-full rounded-full ${
													row.resource.isExceeded || row.resource.isFull
														? "bg-red-vivid"
														: "bg-gold-base"
												}`}
												style={{ width: `${planPercent(row.resource)}%` }}
											/>
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="mt-5 rounded-xl border border-gold-base/20 bg-black-ink/45 p-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="font-vn text-xs uppercase tracking-[0.18em] text-gold-base/60">
										SaaS readiness
									</p>
									<h3 className="mt-1 font-cinzel text-2xl text-gold-shine">
										Production env
									</h3>
								</div>
								<span
									className={`rounded-full border px-3 py-1 font-vn text-xs ${
										readinessReady
											? "border-gold-base/35 bg-gold-base/10 text-gold-shine/75"
											: "border-red-vivid/35 bg-red-deep/25 text-red-vivid"
									}`}
								>
									{saasReadiness === undefined
										? "Đang kiểm tra"
										: readinessReady
											? "Ready"
											: `${
													saasReadiness.missingRequired.length +
													saasReadiness.missingRuntimeRequired.length
												} thiếu`}
								</span>
							</div>

							{saasReadiness === undefined ? (
								<div className="mt-4 h-16 animate-pulse rounded-lg border border-gold-base/15 bg-black-ink/55" />
							) : (
								<div className="mt-4 grid gap-2">
									{readinessRows.map((row) => {
										const isReady = row.missingLabels.length === 0;
										return (
											<div
												key={row.key}
												className="rounded-lg border border-gold-base/15 bg-black-ink/55 px-3 py-2"
											>
												<div className="flex items-center justify-between gap-3 font-vn text-xs">
													<span className="font-bold text-gold-shine/70">{row.label}</span>
													<span
														className={
															isReady ? "text-gold-base" : "font-bold text-red-vivid"
														}
													>
														{row.configuredRequiredCount} / {row.requiredCount}
													</span>
												</div>
												<p className="mt-1 break-words font-vn text-xs text-gold-shine/45">
													{isReady
														? "Đủ biến bắt buộc"
														: `Thiếu ${row.missingLabels.join(", ")}`}
												</p>
											</div>
										);
									})}
									{runtimeReadinessRows.map((row) => (
										<div
											key={row.key}
											className="rounded-lg border border-gold-base/15 bg-black-ink/55 px-3 py-2"
										>
											<div className="flex items-center justify-between gap-3 font-vn text-xs">
												<span className="font-bold text-gold-shine/70">{row.label}</span>
												<span
													className={
														row.isReady ? "text-gold-base" : "font-bold text-red-vivid"
													}
												>
													{row.isReady ? "Ready" : "Thiếu"}
												</span>
											</div>
											<p className="mt-1 break-words font-vn text-xs text-gold-shine/45">
												{row.detail}
											</p>
										</div>
									))}
									{readinessEndpointRows.map((row) => (
										<div
											key={row.key}
											className="rounded-lg border border-gold-base/15 bg-black-ink/55 px-3 py-2"
										>
											<div className="flex items-center justify-between gap-3 font-vn text-xs">
												<span className="font-bold text-gold-shine/70">{row.label}</span>
												<span className="text-gold-base">Endpoint</span>
											</div>
											<p className="mt-1 break-all font-mono text-[11px] text-gold-shine/50">
												{row.value}
											</p>
										</div>
									))}
								</div>
							)}
						</div>

						<div className="mt-5 rounded-xl border border-gold-base/20 bg-black-ink/45 p-4">
							<p className="font-vn text-xs uppercase tracking-[0.18em] text-gold-base/60">
								Campaign metrics
							</p>
							<div className="mt-3 grid grid-cols-2 gap-3">
								<div className="rounded-lg border border-gold-base/15 bg-black-ink/55 p-3">
									<p className="font-vn text-xs text-gold-shine/45">Lượt tạo</p>
									<p className="mt-1 font-cinzel text-2xl text-gold-shine">
										{campaignAnalytics?.sessionCreatedEvents.toLocaleString("vi-VN") ?? "--"}
									</p>
								</div>
								<div className="rounded-lg border border-gold-base/15 bg-black-ink/55 p-3">
									<p className="font-vn text-xs text-gold-shine/45">Đã trao</p>
									<p className="mt-1 font-cinzel text-2xl text-gold-shine">
										{campaignAnalytics?.redemptionCreatedEvents.toLocaleString("vi-VN") ?? "--"}
									</p>
								</div>
								<div className="rounded-lg border border-gold-base/15 bg-black-ink/55 p-3">
									<p className="font-vn text-xs text-gold-shine/45">Aggregate</p>
									<p className="mt-1 font-cinzel text-2xl text-gold-shine">
										{campaignAnalytics?.aggregatedRedemptionCount.toLocaleString("vi-VN") ?? "--"}
									</p>
								</div>
								<div className="rounded-lg border border-gold-base/15 bg-black-ink/55 p-3">
									<p className="font-vn text-xs text-gold-shine/45">Tổng thưởng</p>
									<p className="mt-1 font-cinzel text-lg text-gold-shine">
										{campaignAnalytics
											? formatCurrency(campaignAnalytics.aggregatedRedeemedAmount)
											: "--"}
									</p>
								</div>
							</div>
						</div>

						<div className="mt-5 rounded-xl border border-gold-base/20 bg-black-ink/45 p-4">
							<p className="font-vn text-xs uppercase tracking-[0.18em] text-gold-base/60">
								Public link base
							</p>
							<p className="mt-2 break-all rounded-lg bg-black-ink/70 px-3 py-2 font-mono text-xs text-gold-shine/70">
								{shareBaseUrl}/claim/&lt;publicCode&gt;
							</p>
						</div>

						<div className="mt-5">
							<h3 className="font-cinzel text-xl text-gold-shine">Ảnh gần đây</h3>
							<div className="mt-3 grid grid-cols-2 gap-3">
								{selectableRecentAssets.map((asset) => (
									<button
										key={asset.id}
										type="button"
										className="group overflow-hidden rounded-lg border border-gold-base/20 bg-black-ink/45 text-left transition-colors hover:border-gold-base/60"
										onClick={() => updateForm("heroAssetId", asset.id)}
									>
										<img
											className="aspect-video w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
											src={asset.url}
											alt={asset.fileName}
										/>
										<p className="truncate px-2 py-1.5 font-vn text-xs text-gold-shine/60">
											{asset.fileName}
										</p>
									</button>
								))}
							</div>
						</div>
					</aside>
				</div>
			</section>
		</HostShell>
	);
}
