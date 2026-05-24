"use client";

import {
	Alert,
	Button,
	Chip,
	ProgressCircle,
	ScrollShadow,
	Separator,
} from "@heroui/react";
import {
	ActionBar,
	EmptyState,
	ItemCard,
	ItemCardGroup,
	KPI,
	KPIGroup,
	ListView,
	NumberValue,
	Widget,
} from "@heroui-pro/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	BadgeCheck,
	FileText,
	Image,
	MonitorPlay,
	Plus,
	RadioTower,
	Save,
	ServerCog,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import { getPublicAppOrigin } from "@/lib/publicAppUrl";
import { useHostLogout } from "@/lib/useHostLogout";
import { useOwnerSession } from "@/lib/useOwnerSession";
import { BillingPanel } from "./-campaigns/BillingPanel";
import { CampaignEditor } from "./-campaigns/CampaignEditor";
import { ReadinessPanel } from "./-campaigns/ReadinessPanel";
import type {
	BillingProduct,
	CampaignForm,
	CampaignSelection,
	PlanResource,
} from "./-campaigns/types";
import {
	createDraftCampaignForm,
	emptyForm,
	formFromCampaign,
	readinessGroupLabels,
} from "./-campaigns/utils";
import { useCampaignAssetUpload } from "./-campaigns/useCampaignAssetUpload";
import { useCampaignBillingActions } from "./-campaigns/useCampaignBillingActions";
import adminCss from "./styles/admin.css?url";

export const Route = createFileRoute("/campaigns")({
	beforeLoad: requireHostRouteAuth,
	head: () => ({
		links: [{ rel: "stylesheet", href: adminCss }],
	}),
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
	const [form, setForm] = useState<CampaignForm>(emptyForm);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [contextExpandedKeys, setContextExpandedKeys] = useState<Set<string | number>>(
		new Set(["readiness"]),
	);
	const { billingAction, handleBillingPlan, handleBillingPortal } =
		useCampaignBillingActions({
			planState,
			setError,
			setMessage,
		});
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
	const selectedHeroAsset =
		selectableRecentAssets.find((asset) => asset.id === form.heroAssetId) ??
		selectedCampaign?.heroAsset ??
		null;
	const selectedHeroAssetSize =
		selectedHeroAsset &&
		"size" in selectedHeroAsset &&
		typeof selectedHeroAsset.size === "number"
			? selectedHeroAsset.size
			: null;
	const campaignCreateLimitReached =
		!form.id && (planState?.resources.campaigns.isFull ?? false);
	const assetLimitReached = planState?.resources.assets.isFull ?? false;
	const {
		clearPendingUploadedAsset,
		handleAssetDrop,
		handleAssetSelect,
		handleRetryAttachUploadedAsset,
		pendingUploadedAsset,
		retryingUploadAttach,
		uploading,
		uploadingAsset,
		uploadProgress,
	} = useCampaignAssetUpload({
		assetLimitReached,
		campaignId: form.id,
		ownerReady: Boolean(owner),
		setError,
		setForm,
		setMessage,
	});
	const canSave =
		Boolean(owner) &&
		form.name.trim().length >= 3 &&
		form.slug.trim().length >= 3 &&
		!campaignCreateLimitReached &&
		!saving;
	const hasEditorSelection = Boolean(
		selectedCampaign ||
			selectedCampaignId === "new" ||
			(form.id && form.id === selectedCampaignId),
	);
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
		clearPendingUploadedAsset();
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

	if (!owner || workspace === undefined) {
		return (
			<AdminRouteStatus
				description="Đang xác thực host, tải campaign, billing và production readiness."
				title="Đang tải Campaign Studio"
			/>
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
		].filter(
			(row): row is { key: string; label: string; value: string } =>
				typeof row.value === "string" && row.value.length > 0,
		)
		: [];
	const readinessReady = saasReadiness?.allRequiredReady ?? false;
	const visiblePendingUploadedAsset =
		pendingUploadedAsset?.campaignId === form.id ? pendingUploadedAsset : null;
	const activeCampaignCount = workspace.campaigns.filter(
		(campaign) => campaign.status === "active",
	).length;
	const draftCampaignCount = workspace.campaigns.filter(
		(campaign) => campaign.status !== "active",
	).length;
	const selectedCampaignLabel =
		selectedCampaignId === "new" ? "New draft" : selectedCampaign?.name ?? form.name;
	const campaignListItems = workspace.campaigns.map((campaign) => campaign);
	const workspaceFeedback = error || message;
	const copyConfigured = Boolean(
		(form.claimHeadline || form.name).trim() &&
			(form.claimSubtitle || form.description).trim() &&
			(form.claimCtaLabel || "Thử vận may").trim(),
	);
	const workflowRows = [
		{
			icon: RadioTower,
			title: "Public status",
			description:
				form.status === "active"
					? "Campaign đang mở cho station và public claim."
					: "Draft chưa nên phát hành cho khách.",
			chip: form.status === "active" ? "Active" : "Draft",
			color: form.status === "active" ? "success" : "default",
		},
		{
			icon: FileText,
			title: "Claim copy",
			description: copyConfigured
				? "Headline, subtitle và CTA đã có nội dung hiển thị."
				: "Cần bổ sung copy trước khi phát hành.",
			chip: copyConfigured ? "Ready" : "Missing",
			color: copyConfigured ? "success" : "warning",
		},
		{
			icon: Image,
			title: "Hero asset",
			description: heroPreview
				? "Ảnh hero đang được dùng trong preview khách."
				: "Đang dùng fallback visual của template.",
			chip: heroPreview ? "Uploaded" : "Fallback",
			color: heroPreview ? "success" : "default",
		},
		{
			icon: ServerCog,
			title: "Production",
			description: readinessReady
				? "Các biến production bắt buộc đã sẵn sàng."
				: "Cần xử lý readiness trước khi scale campaign.",
			chip: readinessReady ? "Ready" : "Check",
			color: readinessReady ? "success" : "danger",
		},
	] as const;
	const claimCopyRows = [
		{
			icon: FileText,
			title: "Headline",
			description: form.claimHeadline.trim() || form.name,
			chip: form.claimHeadline.trim() ? "Custom" : "Fallback",
			color: form.claimHeadline.trim() ? "success" : "default",
		},
		{
			icon: BadgeCheck,
			title: "Subtitle",
			description:
				form.claimSubtitle.trim() ||
				form.description.trim() ||
				"Chưa có subtitle cho hero claim.",
			chip: form.claimSubtitle.trim() || form.description.trim() ? "Ready" : "Missing",
			color: form.claimSubtitle.trim() || form.description.trim() ? "success" : "warning",
		},
		{
			icon: MonitorPlay,
			title: "CTA",
			description: [
				form.claimCtaLabel.trim() || "Thử vận may",
				form.claimCollectLabel.trim() || "Nhận thưởng",
			].join(" / "),
			chip: form.claimCtaLabel.trim() || form.claimCollectLabel.trim() ? "Custom" : "Default",
			color: form.claimCtaLabel.trim() || form.claimCollectLabel.trim() ? "success" : "default",
		},
	] as const;
	const assetStateRows = [
		{
			icon: Image,
			title: "Hero source",
			description: selectedHeroAsset?.fileName ?? "Template fallback visual",
			chip: selectedHeroAsset ? "Selected" : "Fallback",
			color: selectedHeroAsset ? "success" : "default",
		},
		{
			icon: BadgeCheck,
			title: "Recent assets",
			description: `${selectableRecentAssets.length.toLocaleString("vi-VN")} reusable image${
				selectableRecentAssets.length === 1 ? "" : "s"
			}`,
			chip: selectableRecentAssets.length > 0 ? "Available" : "None",
			color: selectableRecentAssets.length > 0 ? "success" : "default",
		},
		{
			icon: ServerCog,
			title: "Upload limit",
			description: assetLimitReached
				? "Gói hiện tại đã đạt giới hạn upload."
				: "Có thể upload ảnh hero mới.",
			chip: assetLimitReached ? "Limit" : "Open",
			color: assetLimitReached ? "danger" : "success",
		},
	] as const;
	const completedWorkflowCount = workflowRows.filter(
		(row) => row.color === "success",
	).length;
	const launchProgress = Math.round(
		(completedWorkflowCount / workflowRows.length) * 100,
	);
	const nextWorkflowRow =
		workflowRows.find((row) => row.color !== "success") ?? workflowRows[0];
	const campaignContextPanel = (
		<div className="admin-aside">
			<Widget className="h-fit">
				<Widget.Header>
					<Widget.Title>Preview</Widget.Title>
					<Widget.Description>Guest-facing draw stage preview.</Widget.Description>
				</Widget.Header>
				<Widget.Content>
					<div className="admin-draw-preview">
						<div className="admin-draw-preview__media">
							{heroPreview ? (
								<img
									alt="Campaign preview"
									className="size-full object-cover"
									src={heroPreview}
								/>
							) : (
								<div className="admin-draw-preview__fallback">
									<span>Summon Luck</span>
								</div>
							)}
							<div className="admin-draw-preview__shade" />
							<div className="admin-draw-preview__badge">
								{form.theme === "lunar" ? "Lunar Template" : "Brand Template"}
							</div>
						</div>
						<div className="admin-draw-preview__body">
							<p className="admin-draw-preview__brand">
								{form.brandName || owner.username}
							</p>
							<h3 className="admin-draw-preview__title">
								{form.claimHeadline || form.name}
							</h3>
							<p className="admin-draw-preview__copy">
								{form.claimSubtitle ||
									form.description ||
									"Mô tả trải nghiệm claim sẽ hiển thị tại đây."}
							</p>
							<div className="admin-draw-preview__envelopes" aria-hidden="true">
								{[0, 1, 2, 3, 4].map((slot) => (
									<span className="admin-draw-preview__envelope" key={slot} />
								))}
							</div>
							<div className="admin-draw-preview__footer">
								<span className="admin-draw-preview__cta">
									{form.claimCtaLabel || "Thử vận may"}
								</span>
								<span className="admin-draw-preview__result">
									{form.claimCollectLabel || "Nhận thưởng"}
								</span>
							</div>
						</div>
					</div>
				</Widget.Content>
			</Widget>

			<BillingPanel
				billingAction={billingAction}
				billingPlans={billingPlans}
				planRows={planRows}
				planState={planState}
				formatPlanResource={formatPlanResource}
				onBillingPlan={(planKey, product) => void handleBillingPlan(planKey, product)}
				onBillingPortal={() => void handleBillingPortal()}
				planPercent={planPercent}
			/>

			<ReadinessPanel
				campaignAnalytics={campaignAnalytics}
				contextExpandedKeys={contextExpandedKeys}
				formHeroAssetId={form.heroAssetId}
				readinessEndpointRows={readinessEndpointRows}
				readinessReady={readinessReady}
				readinessRows={readinessRows}
				runtimeReadinessRows={runtimeReadinessRows}
				saasReadiness={saasReadiness}
				selectableRecentAssets={selectableRecentAssets}
				shareBaseUrl={shareBaseUrl}
				onExpandedKeysChange={setContextExpandedKeys}
				onHeroAssetSelect={(assetId) => updateForm("heroAssetId", assetId)}
			/>
		</div>
	);

	return (
		<AdminPageShell
			description="Configure campaign identity, public claim copy, hero assets, billing, and production readiness."
			eyebrow="Campaign Studio"
			hasFloatingActionBar
			onLogout={handleLogout}
			ownerUsername={owner.username}
			aside={campaignContextPanel}
			title="Chiến dịch bốc thăm"
		>
			<KPIGroup className="admin-kpi-strip">
				<KPI>
					<KPI.Header>
						<KPI.Icon status="success">
							<FileText aria-hidden="true" size={16} strokeWidth={2} />
						</KPI.Icon>
						<KPI.Title>Campaigns</KPI.Title>
						<KPI.Trend trend="neutral">{activeCampaignCount} active</KPI.Trend>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value maximumFractionDigits={0} value={workspace.campaigns.length} />
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Icon status={form.status === "active" ? "success" : "warning"}>
							<RadioTower aria-hidden="true" size={16} strokeWidth={2} />
						</KPI.Icon>
						<KPI.Title>Selected</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<div className="min-w-0">
							<p className="truncate text-xl font-semibold text-foreground">
								{selectedCampaignLabel}
							</p>
							<p className="mt-1 text-xs text-muted">Editing in Studio</p>
						</div>
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Icon status={planState?.source === "polar" ? "success" : "warning"}>
							<ServerCog aria-hidden="true" size={16} strokeWidth={2} />
						</KPI.Icon>
						<KPI.Title>Plan</KPI.Title>
						<KPI.Trend trend={planState?.source === "polar" ? "up" : "neutral"}>
							{planState?.source === "polar" ? "Polar" : "Fallback"}
						</KPI.Trend>
					</KPI.Header>
					<KPI.Content>
						<div className="min-w-0">
							<p className="truncate text-xl font-semibold text-foreground">
								{planState?.label ?? "Loading"}
							</p>
							<p className="mt-1 text-xs text-muted">Workspace limits</p>
						</div>
					</KPI.Content>
				</KPI>
				<KPIGroup.Separator />
				<KPI>
					<KPI.Header>
						<KPI.Icon status="success">
							<BadgeCheck aria-hidden="true" size={16} strokeWidth={2} />
						</KPI.Icon>
						<KPI.Title>Redeemed</KPI.Title>
					</KPI.Header>
					<KPI.Content>
						<KPI.Value
							currency="VND"
							maximumFractionDigits={0}
							style="currency"
							value={campaignAnalytics?.aggregatedRedeemedAmount ?? 0}
						/>
					</KPI.Content>
				</KPI>
			</KPIGroup>

			{workspaceFeedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{workspaceFeedback}</Alert.Title>
						<Alert.Description>
							{error
								? "Kiểm tra lại cấu hình campaign hoặc billing rồi thử lại."
								: "Workspace đã cập nhật. Preview và readiness panel sẽ phản ánh trạng thái mới."}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			) : null}

			<Widget>
				<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
					<div>
						<Widget.Title>Launch command</Widget.Title>
						<Widget.Description>
							Tổng quan campaign đang chỉnh trước khi chuyển sang station hoặc public claim.
						</Widget.Description>
					</div>
					<div className="flex flex-wrap gap-2">
						<Chip color={form.status === "active" ? "success" : "default"} variant="soft">
							{form.status === "active" ? "Active" : "Draft"}
						</Chip>
						<Chip variant="soft">
							{form.theme === "lunar" ? "Lunar template" : "Brand template"}
						</Chip>
					</div>
				</Widget.Header>
				<Widget.Content className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
					<div className="grid gap-5">
						<div className="min-w-0">
							<p className="truncate text-2xl font-semibold text-foreground">
								{form.claimHeadline || form.name}
							</p>
							<p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted">
								{form.claimSubtitle ||
									form.description ||
									"Thêm headline, subtitle và CTA để public claim có nội dung rõ ràng."}
							</p>
						</div>
						<ItemCardGroup
							className="admin-card-grid--two"
							layout="grid"
							variant="secondary"
						>
							{workflowRows.map((row) => (
								<ItemCard className="items-start" key={row.title} variant="secondary">
									<ItemCard.Icon
										className={
											row.color === "success"
												? "text-success"
												: row.color === "danger"
													? "text-danger"
													: row.color === "warning"
														? "text-warning"
														: "text-muted"
										}
									>
										<row.icon
											aria-hidden="true"
											size={18}
											strokeWidth={2}
										/>
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
					</div>
					<div className="admin-command-summary">
						<div className="flex items-center gap-4">
							<ProgressCircle
								aria-label="Campaign launch progress"
								color={launchProgress === 100 ? "success" : "accent"}
								value={launchProgress}
							>
								<ProgressCircle.Track>
									<ProgressCircle.TrackCircle />
									<ProgressCircle.FillCircle />
								</ProgressCircle.Track>
							</ProgressCircle>
							<div className="min-w-0">
								<div className="flex items-baseline gap-2">
									<NumberValue
										className="text-2xl font-semibold tabular-nums text-foreground"
										maximumFractionDigits={0}
										value={launchProgress}
									>
										<NumberValue.Suffix>
											<span className="ml-0.5 text-sm font-medium text-muted">%</span>
										</NumberValue.Suffix>
									</NumberValue>
									<Chip
										color={launchProgress === 100 ? "success" : "accent"}
										size="sm"
										variant="soft"
									>
										{completedWorkflowCount}/{workflowRows.length}
									</Chip>
								</div>
								<p className="mt-1 text-xs leading-5 text-muted">
									Launch readiness across public status, copy, asset, and production.
								</p>
							</div>
						</div>
						<div className="admin-command-summary__note">
							<p className="admin-command-summary__note-label">
								{launchProgress === 100 ? "Ready to launch" : "Next step"}
							</p>
							<div className="admin-command-summary__note-header">
								<p className="admin-command-summary__note-title">
									{nextWorkflowRow.title}
								</p>
								<Chip color={nextWorkflowRow.color} size="sm" variant="soft">
									{nextWorkflowRow.chip}
								</Chip>
							</div>
							<p className="admin-command-summary__note-copy line-clamp-2">
								{nextWorkflowRow.description}
							</p>
						</div>
						<div className="grid gap-1">
							<p className="text-xs font-medium text-muted">Public claim route</p>
							<p className="break-all font-mono text-xs text-foreground">
								{shareBaseUrl}/claim/&lt;publicCode&gt;
							</p>
						</div>
					</div>
				</Widget.Content>
			</Widget>

			<div className="grid min-w-0 gap-6">
				<div className="grid gap-6">
					<Widget className="h-fit">
						<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
							<div>
								<Widget.Title>Campaign list</Widget.Title>
								<Widget.Description>
									Chọn campaign để chỉnh copy, asset và trạng thái.
								</Widget.Description>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Chip size="sm" variant="soft">
									{workspace.campaigns.length} campaigns
								</Chip>
								<Button
									isDisabled={planState?.resources.campaigns.isFull ?? false}
									type="button"
									variant="outline"
									onPress={handleNewCampaign}
								>
									<Plus aria-hidden="true" size={16} strokeWidth={2} />
									Tạo campaign
								</Button>
							</div>
						</Widget.Header>
						<Widget.Content className="gap-4">
							<ScrollShadow className="max-h-[320px] pr-1">
								{workspace.campaigns.length > 0 ? (
									<div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
										<ItemCardGroup variant="secondary">
											<ItemCard variant="secondary">
												<ItemCard.Icon className="text-success">
													<RadioTower aria-hidden="true" size={18} strokeWidth={2} />
												</ItemCard.Icon>
												<ItemCard.Content>
													<ItemCard.Description>Active</ItemCard.Description>
													<ItemCard.Title>
														<NumberValue
															className="tabular-nums"
															value={activeCampaignCount}
														/>
													</ItemCard.Title>
												</ItemCard.Content>
											</ItemCard>
											<ItemCard variant="secondary">
												<ItemCard.Icon className="text-muted">
													<FileText aria-hidden="true" size={18} strokeWidth={2} />
												</ItemCard.Icon>
												<ItemCard.Content>
													<ItemCard.Description>Draft</ItemCard.Description>
													<ItemCard.Title>
														<NumberValue
															className="tabular-nums"
															value={draftCampaignCount}
														/>
													</ItemCard.Title>
												</ItemCard.Content>
											</ItemCard>
										</ItemCardGroup>
										<div className="grid min-w-0 gap-3">
											<ListView
												aria-label="Campaign list"
												items={campaignListItems}
												selectedKeys={
													selectedCampaignId && selectedCampaignId !== "new"
														? new Set([selectedCampaignId])
														: new Set()
												}
												selectionBehavior="replace"
												selectionMode="single"
												variant="secondary"
												onAction={(key) => handleSelectCampaign(key as Id<"campaigns">)}
											>
												{(campaign) => (
													<ListView.Item id={campaign.id} textValue={campaign.name}>
														<ListView.ItemContent>
															<FileText
																aria-hidden="true"
																className="size-4 shrink-0 text-muted"
																strokeWidth={2}
															/>
															<div className="flex min-w-0 flex-col">
																<ListView.Title>{campaign.name}</ListView.Title>
																<ListView.Description>/{campaign.slug}</ListView.Description>
															</div>
														</ListView.ItemContent>
														<ListView.ItemAction>
															<Chip
																color={campaign.status === "active" ? "success" : "default"}
																size="sm"
																variant="soft"
															>
																{campaign.status === "active" ? "Active" : "Draft"}
															</Chip>
														</ListView.ItemAction>
													</ListView.Item>
												)}
											</ListView>
											{selectedCampaignId === "new" ? (
												<ItemCard variant="secondary">
													<ItemCard.Content>
														<ItemCard.Title>Campaign mới</ItemCard.Title>
														<ItemCard.Description>Chưa lưu vào Convex</ItemCard.Description>
													</ItemCard.Content>
													<ItemCard.Action>
														<Chip size="sm" variant="soft">
															Draft
														</Chip>
													</ItemCard.Action>
												</ItemCard>
											) : null}
										</div>
									</div>
								) : (
									<EmptyState size="sm">
										<EmptyState.Header>
											<EmptyState.Media variant="icon">
												<FileText aria-hidden="true" size={20} strokeWidth={2} />
											</EmptyState.Media>
											<EmptyState.Title>Chưa có chiến dịch</EmptyState.Title>
											<EmptyState.Description>
												Tạo chiến dịch mặc định để bắt đầu chuẩn hóa flow SaaS.
											</EmptyState.Description>
										</EmptyState.Header>
										<EmptyState.Content>
											<Button type="button" onPress={handleEnsureDefault}>
												<Plus aria-hidden="true" size={16} strokeWidth={2} />
												Tạo mặc định
											</Button>
										</EmptyState.Content>
									</EmptyState>
								)}
							</ScrollShadow>
						</Widget.Content>
					</Widget>
				</div>

				<div className="grid min-w-0 gap-6">
					{hasEditorSelection ? (
						<CampaignEditor
							assetLimitReached={assetLimitReached}
							assetStateRows={assetStateRows}
							claimCopyRows={claimCopyRows}
							form={form}
							heroPreview={heroPreview}
							retryingUploadAttach={retryingUploadAttach}
							selectedHeroAsset={selectedHeroAsset}
							selectedHeroAssetSize={selectedHeroAssetSize}
							uploading={uploading}
							uploadingAsset={uploadingAsset}
							uploadProgress={uploadProgress}
							visiblePendingUploadedAsset={visiblePendingUploadedAsset}
							onAssetDrop={handleAssetDrop}
							onAssetSelect={handleAssetSelect}
							onFormChange={updateForm}
							onRetryAttachUploadedAsset={() => void handleRetryAttachUploadedAsset()}
						/>
					) : (
						<Widget>
							<Widget.Content className="min-h-[360px] items-center justify-center">
								<EmptyState>
									<EmptyState.Header>
										<EmptyState.Media variant="icon">
											<FileText aria-hidden="true" size={24} strokeWidth={2} />
										</EmptyState.Media>
										<EmptyState.Title>Chọn campaign để chỉnh sửa</EmptyState.Title>
										<EmptyState.Description className="max-w-sm text-pretty">
											Editor sẽ hiển thị claim copy, trạng thái public và hero asset sau khi
											bạn chọn một campaign trong danh sách.
										</EmptyState.Description>
									</EmptyState.Header>
									<EmptyState.Content className="flex-row flex-wrap justify-center gap-2">
										{workspace.campaigns[0] ? (
											<Button
												type="button"
												variant="secondary"
												onPress={() => handleSelectCampaign(workspace.campaigns[0].id)}
											>
												<FileText aria-hidden="true" size={16} strokeWidth={2} />
												Chọn campaign đầu tiên
											</Button>
										) : (
											<Button type="button" onPress={handleEnsureDefault}>
												<Plus aria-hidden="true" size={16} strokeWidth={2} />
												Tạo mặc định
											</Button>
										)}
										<Button
											isDisabled={planState?.resources.campaigns.isFull ?? false}
											type="button"
											variant="outline"
											onPress={handleNewCampaign}
										>
											<Plus aria-hidden="true" size={16} strokeWidth={2} />
											Tạo campaign
										</Button>
									</EmptyState.Content>
								</EmptyState>
							</Widget.Content>
						</Widget>
					)}
				</div>
			</div>
			<ActionBar
				aria-label="Campaign actions"
				className="admin-action-bar"
				isOpen={hasEditorSelection}
			>
				<ActionBar.Prefix>
					<Chip
						className="max-w-[180px] shrink-0 tabular-nums"
						color={form.status === "active" ? "success" : "default"}
						size="sm"
						variant="soft"
					>
						<Chip.Label className="truncate">
							{form.status === "active" ? "Active" : "Draft"} · {launchProgress}%
						</Chip.Label>
					</Chip>
				</ActionBar.Prefix>
				<Separator orientation="vertical" />
				<ActionBar.Content>
					<Button
						aria-label="Open station"
						size="sm"
						type="button"
						variant="ghost"
						onPress={() => void navigate({ to: "/draw" })}
					>
						<MonitorPlay aria-hidden="true" size={16} strokeWidth={2} />
						<span className="action-bar__label">Station</span>
					</Button>
					<Button
						aria-label="Save campaign"
						isDisabled={!canSave}
						isPending={saving}
						size="sm"
						type="button"
						onPress={handleSave}
					>
						<Save aria-hidden="true" size={16} strokeWidth={2} />
						<span className="action-bar__label">
							{campaignCreateLimitReached ? "Limit reached" : "Save"}
						</span>
					</Button>
				</ActionBar.Content>
			</ActionBar>
		</AdminPageShell>
	);
}
