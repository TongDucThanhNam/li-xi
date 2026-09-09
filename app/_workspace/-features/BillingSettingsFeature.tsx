"use client";

import { Alert, Button, Chip, ProgressBar, Spinner } from "@heroui/react";
import { ItemCard, ItemCardGroup, Widget } from "@heroui-pro/react";
import { useAction, useQuery } from "convex/react";
import { CreditCard, ExternalLink } from "lucide-react";
import { useState } from "react";
import { SettingsContextNav } from "@/app/_workspace/-components/SettingsContextNav";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
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

	const labels = {
		assets: "Tài nguyên",
		budgetItems: "Mệnh giá",
		campaigns: "Chiến dịch",
		openSessions: "Lượt đang mở",
		redemptions: "Lượt trao thưởng",
	} as const;
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
	const planOptions = [
		{ key: "pro" as const, label: "Pro", product: products?.pro ?? null, summary: "Dành cho chiến dịch đang tăng trưởng." },
		{ key: "business" as const, label: "Business", product: products?.business ?? null, summary: "Dành cho đội ngũ vận hành nhiều chiến dịch." },
	];

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
		<AdminPageShell description="Theo dõi gói đăng ký và mức sử dụng của không gian làm việc." title="Thanh toán">
			<SettingsContextNav />
			{error || feedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content>
				</Alert>
			) : null}
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<Widget>
					<Widget.Header>
						<Widget.Title>Mức sử dụng</Widget.Title>
						<Widget.Description>Giới hạn được áp dụng ở cấp tài khoản.</Widget.Description>
					</Widget.Header>
					<Widget.Content>
						<ItemCardGroup aria-label="Mức sử dụng tài nguyên" variant="secondary">
							{Object.entries(plan.resources).map(([key, resource]) => {
								const limit = resource.limit;
								const percent = limit ? Math.min(100, Math.round((resource.used / limit) * 100)) : 0;
								return (
									<ItemCard className="items-start" key={key} variant="secondary">
										<ItemCard.Content className="gap-2">
											<div className="flex justify-between gap-3">
												<ItemCard.Title>{labels[key as keyof typeof labels]}</ItemCard.Title>
												<span className="text-sm tabular-nums">{resource.used}/{limit ?? "∞"}</span>
											</div>
											<ProgressBar aria-label={`Mức sử dụng ${labels[key as keyof typeof labels]}`} color={resource.isFull || resource.isExceeded ? "danger" : "accent"} value={percent}>
												<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
											</ProgressBar>
										</ItemCard.Content>
									</ItemCard>
								);
							})}
						</ItemCardGroup>
					</Widget.Content>
				</Widget>
				<Widget>
					<Widget.Header>
						<Widget.Title>Gói hiện tại</Widget.Title>
						<Widget.Description>{plan.label}</Widget.Description>
					</Widget.Header>
					<Widget.Content className="gap-4">
						<ItemCard variant="secondary">
							<ItemCard.Icon><CreditCard aria-hidden="true" /></ItemCard.Icon>
							<ItemCard.Content>
								<ItemCard.Title>{plan.subscription?.productName ?? plan.label}</ItemCard.Title>
								<ItemCard.Description>{plan.subscription ? "Gói đăng ký được đồng bộ từ Polar." : "Chưa có gói đăng ký trả phí."}</ItemCard.Description>
							</ItemCard.Content>
							<ItemCard.Action><Chip color={plan.subscription ? "success" : "default"} variant="soft">{statusLabels[planStatus.toLowerCase()] ?? planStatus}</Chip></ItemCard.Action>
						</ItemCard>
						{planOptions.map((option) => {
							const isCurrent = Boolean(option.product?.id) && plan.subscription?.productId === option.product?.id;
							const isBusy = billingAction === option.key;
							return (
								<ItemCard key={option.key} variant={isCurrent ? "default" : "secondary"}>
									<ItemCard.Content>
										<ItemCard.Title>{option.label}</ItemCard.Title>
										<ItemCard.Description>{formatBillingPrice(option.product)} · {option.summary}</ItemCard.Description>
									</ItemCard.Content>
									<ItemCard.Action>
										<Button
											isDisabled={Boolean(billingAction) || isCurrent || !option.product?.id}
											isPending={isBusy}
											size="sm"
											variant={isCurrent ? "secondary" : "outline"}
											onPress={() => void selectPlan(option.key, option.product)}
										>
											{isCurrent ? "Đang dùng" : option.product?.id ? "Chọn gói" : "Chưa sẵn sàng"}
										</Button>
									</ItemCard.Action>
								</ItemCard>
							);
						})}
						<Button fullWidth isDisabled={Boolean(billingAction) || !plan.subscription} isPending={billingAction === "portal"} variant="outline" onPress={() => void openPortal()}>
							<ExternalLink aria-hidden="true" size={16} />
							{plan.subscription ? "Quản lý gói đăng ký" : "Chưa có gói đăng ký"}
						</Button>
						{plan.billingError ? <p className="text-sm text-danger">{plan.billingError}</p> : null}
						<p className="text-sm text-muted">Nguồn trạng thái: {plan.source === "polar" ? "Polar" : "Gói mặc định"}</p>
					</Widget.Content>
				</Widget>
			</div>
		</AdminPageShell>
	);
}
