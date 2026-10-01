"use client";

import { Alert, Button, Chip, ProgressBar, Spinner } from "@heroui/react";
import { Widget } from "@heroui-pro/react";
import { useAction, useQuery } from "convex/react";
import { Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { PLAN_RESOURCE_LABELS, PLAN_TIER_NAMES } from "@/app/_workspace/-components/planCopy";
import { SettingsContextNav } from "@/app/_workspace/-components/SettingsContextNav";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import { PLAN_LIMITS, type PlanLimitKey } from "@/lib/planLimits";
import { PLAN_RESOURCE_ORDER, usageLevel, usagePercent } from "@/lib/planUsage";
import { getBillingReturnPublicAppUrl, getPublicAppOrigin } from "@/lib/publicAppUrl";

type BillingAction = "pro" | "business" | "portal" | null;

type BillingProduct = {
	id: string;
	isRecurring: boolean;
	name: string;
	prices?: Array<{
		amountType?: string;
		priceAmount?: number;
		priceCurrency?: string;
	}>;
	recurringInterval?: string | null;
} | null;

const changeableSubscriptionStatuses = new Set(["active", "trialing", "past_due"]);

function formatBillingPrice(product: BillingProduct) {
	if (!product) return "Chưa đồng bộ từ Polar";
	const fixedPrice = product.prices?.find((price) =>
		price.amountType === "fixed" &&
		typeof price.priceAmount === "number" &&
		typeof price.priceCurrency === "string",
	);
	if (!fixedPrice?.priceAmount || !fixedPrice.priceCurrency) {
		return product.isRecurring ? "Đang cấu hình giá" : "Không định kỳ";
	}
	const intervalLabels: Record<string, string> = {
		day: "ngày",
		month: "tháng",
		week: "tuần",
		year: "năm",
	};
	const suffix = product.isRecurring && product.recurringInterval
		? ` / ${intervalLabels[product.recurringInterval] ?? product.recurringInterval}`
		: "";
	try {
		return `${new Intl.NumberFormat("vi-VN", {
			currency: fixedPrice.priceCurrency.toUpperCase(),
			maximumFractionDigits: 0,
			style: "currency",
		}).format(fixedPrice.priceAmount / 100)}${suffix}`;
	} catch {
		return `${fixedPrice.priceAmount.toLocaleString("vi-VN")} ${fixedPrice.priceCurrency.toUpperCase()}${suffix}`;
	}
}

const PLAN_TIER_ORDER = ["free", "pro", "business"] as const;
type PlanTierKey = (typeof PLAN_TIER_ORDER)[number];
const TIER_RANK: Record<PlanTierKey, number> = { free: 0, pro: 1, business: 2 };
const NON_PRICE_LABELS = new Set(["Chưa đồng bộ từ Polar", "Đang cấu hình giá", "Không định kỳ"]);
const COMPARISON_LIMIT_KEYS: PlanLimitKey[] = ["campaigns", "games", "assets", "redemptions"];

function subscriptionStatusColor(status: string) {
	const normalized = status.toLowerCase();
	if (normalized === "active" || normalized === "trialing") return "success" as const;
	if (normalized === "past_due" || normalized === "unpaid") return "warning" as const;
	return "default" as const;
}

function formatLimitLine(limit: number | null, label: string) {
	return limit === null
		? `Không giới hạn ${label.toLowerCase()}`
		: `${limit.toLocaleString("vi-VN")} ${label.toLowerCase()}`;
}

export function BillingSettingsFeature() {
	const plan = useQuery(api.entitlements.getPlanState, {});
	const products = useQuery(api.billing.getConfiguredProducts, {});
	const generateCheckoutLink = useAction(api.billing.generateCheckoutLink);
	const generateCustomerPortalUrl = useAction(api.billing.generateCustomerPortalUrl);
	const changeCurrentSubscription = useAction(api.billing.changeCurrentSubscription);
	const [billingAction, setBillingAction] = useState<BillingAction>(null);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	if (plan === undefined || products === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải gói dịch vụ" /></div>;
	}

	const statusLabels: Record<string, string> = {
		active: "Đang hoạt động",
		canceled: "Đã hủy",
		cancelled: "Đã hủy",
		free: "Miễn phí",
		past_due: "Quá hạn",
		pro: "Pro",
		business: "Business",
		trialing: "Đang dùng thử",
		unpaid: "Chưa thanh toán",
	};
	const planStatus = plan.subscription?.status ?? plan.tier;
	const planTiers: Array<
		{ key: "free"; product: null; summary: string } |
		{ key: "pro" | "business"; product: BillingProduct; summary: string }
	> = [
		{ key: "free", product: null, summary: "Để bắt đầu và thử nghiệm." },
		{ key: "pro", product: products.pro ?? null, summary: "Dành cho chiến dịch đang tăng trưởng." },
		{ key: "business", product: products.business ?? null, summary: "Dành cho đội ngũ vận hành nhiều chiến dịch." },
	];
	const currentRank = TIER_RANK[plan.tier];
	const primaryTier: PlanTierKey | null = currentRank < 2 ? PLAN_TIER_ORDER[currentRank + 1] : null;

	const selectPlan = async (key: "pro" | "business", product: BillingProduct) => {
		if (!product?.id || billingAction || typeof window === "undefined") return;
		setBillingAction(key);
		setError("");
		setFeedback("");
		try {
			const currentStatus = plan.subscription?.status.toLowerCase();
			if (currentStatus && changeableSubscriptionStatuses.has(currentStatus)) {
				await changeCurrentSubscription({ productId: product.id });
				setFeedback(`Đã gửi yêu cầu đổi sang gói ${product.name}.`);
				return;
			}
			const { url } = await generateCheckoutLink({
				locale: "vi",
				origin: getPublicAppOrigin(),
				productIds: [product.id],
				successUrl: getBillingReturnPublicAppUrl(),
			});
			window.location.assign(url);
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể mở thanh toán Polar");
		} finally {
			setBillingAction(null);
		}
	};

	const openPortal = async () => {
		if (!plan.subscription || billingAction || typeof window === "undefined") return;
		setBillingAction("portal");
		setError("");
		setFeedback("");
		try {
			const { url } = await generateCustomerPortalUrl({
				returnUrl: getBillingReturnPublicAppUrl(),
			});
			window.location.assign(url);
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể mở cổng quản lý Polar");
		} finally {
			setBillingAction(null);
		}
	};

	return (
		<AdminPageShell description="Gói đăng ký và mức sử dụng của không gian làm việc." tabs={<SettingsContextNav />} title="Thanh toán">
			{error || feedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content>
				</Alert>
			) : null}
			{plan.billingError ? (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content><Alert.Title>{plan.billingError}</Alert.Title></Alert.Content>
				</Alert>
			) : null}
			<Widget>
				<Widget.Header>
					<Widget.Title>Gói hiện tại</Widget.Title>
					{plan.subscription ? (
						<Button
							isDisabled={Boolean(billingAction)}
							isPending={billingAction === "portal"}
							size="sm"
							variant="outline"
							onPress={() => void openPortal()}
						>
							<ExternalLink aria-hidden="true" size={14} />
							Quản lý gói đăng ký
						</Button>
					) : null}
				</Widget.Header>
				<Widget.Content className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<p className="text-2xl font-semibold text-foreground">{plan.subscription?.productName ?? PLAN_TIER_NAMES[plan.tier]}</p>
						{plan.subscription ? (
							<Chip color={subscriptionStatusColor(planStatus)} size="sm" variant="soft">
								{statusLabels[planStatus.toLowerCase()] ?? planStatus}
							</Chip>
						) : null}
					</div>
					<p className="text-sm text-muted">{plan.subscription ? "Gói đăng ký được đồng bộ từ Polar." : "Chưa có gói đăng ký trả phí."}</p>
					<div className="mt-1 border-t border-border pt-5">
						<p className="admin-group-label">Mức sử dụng</p>
						<ul aria-label="Mức sử dụng tài nguyên" className="admin-usage mt-4">
							{PLAN_RESOURCE_ORDER.map((key) => {
								const resource = plan.resources[key];
								if (!resource) return null;
								const level = usageLevel(resource);
								const label = PLAN_RESOURCE_LABELS[key];
								return (
									<li className="admin-usage__row" key={key}>
										<div className="admin-usage__head">
											<span className="admin-usage__label">{label}</span>
											<span className="admin-usage__value">
												<strong>{resource.used.toLocaleString("vi-VN")}</strong>
												{resource.limit === null ? " · Không giới hạn" : ` / ${resource.limit.toLocaleString("vi-VN")}`}
											</span>
										</div>
										{resource.limit === null ? null : (
											<ProgressBar
												aria-label={`Mức sử dụng ${label}`}
												color={level === "full" ? "danger" : level === "near" ? "warning" : "accent"}
												size="sm"
												value={usagePercent(resource)}
											>
												<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
											</ProgressBar>
										)}
										{level === "near" ? <p className="text-xs text-warning">Sắp đạt giới hạn.</p> : null}
										{level === "full" ? <p className="text-xs text-danger">Đã đạt giới hạn. Nâng cấp gói để tiếp tục.</p> : null}
									</li>
								);
							})}
						</ul>
						<p className="mt-5 text-xs text-muted">Nguồn trạng thái: {plan.source === "polar" ? "Polar" : "Gói mặc định"}</p>
					</div>
				</Widget.Content>
			</Widget>
			<section aria-labelledby="billing-plans-title">
				<h2 className="text-base font-semibold" id="billing-plans-title">So sánh gói</h2>
				<div className="admin-plan-grid mt-4">
					{planTiers.map((option) => {
						const isCurrent = plan.tier === option.key ||
							(Boolean(option.product?.id) && plan.subscription?.productId === option.product?.id);
						const priceLabel = option.key === "free" ? "0 ₫" : formatBillingPrice(option.product);
						const priceIsMoney = !NON_PRICE_LABELS.has(priceLabel);
						const tierName = PLAN_TIER_NAMES[option.key];
						return (
							<article className="admin-plan-card" data-current={isCurrent ? "true" : undefined} key={option.key}>
								<div className="flex items-start justify-between gap-3">
									<h3 className="text-base font-semibold text-foreground">{tierName}</h3>
									{isCurrent ? <Chip color="accent" size="sm" variant="soft">Gói hiện tại</Chip> : null}
								</div>
								<p className={priceIsMoney ? "admin-plan-card__price" : "text-sm text-muted"}>{priceLabel}</p>
								<p className="text-sm text-muted">{option.summary}</p>
								<ul className="admin-plan-card__limits">
									{COMPARISON_LIMIT_KEYS.map((key) => {
										const limit = isCurrent
											? plan.resources[key]?.limit ?? null
											: PLAN_LIMITS[option.key][key];
										return (
											<li className="flex items-center gap-2" key={key}>
												<Check aria-hidden="true" className="shrink-0 text-success" size={14} />
												<span>{formatLimitLine(limit, PLAN_RESOURCE_LABELS[key])}</span>
											</li>
										);
									})}
								</ul>
								<div className="admin-plan-card__action">
									{isCurrent ? null : option.key === "free" ? (
										<p className="text-xs text-muted">Huỷ gói trong mục Quản lý gói đăng ký để về gói miễn phí.</p>
									) : !option.product?.id ? (
										<>
											<Button isDisabled variant="outline">Chưa sẵn sàng</Button>
											<p className="text-xs text-muted">Sản phẩm chưa được đồng bộ từ Polar.</p>
										</>
									) : (
										<Button
											isDisabled={Boolean(billingAction)}
											isPending={billingAction === option.key}
											variant={option.key === primaryTier ? "primary" : "outline"}
											onPress={() => void selectPlan(option.key, option.product)}
										>
											{TIER_RANK[option.key] > currentRank ? `Nâng cấp lên ${tierName}` : `Chuyển sang ${tierName}`}
										</Button>
									)}
								</div>
							</article>
						);
					})}
				</div>
			</section>
		</AdminPageShell>
	);
}
