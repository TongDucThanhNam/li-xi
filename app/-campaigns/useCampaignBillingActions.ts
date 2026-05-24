import { useAction } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { getBillingReturnPublicAppUrl, getPublicAppOrigin } from "@/lib/publicAppUrl";
import type { BillingAction, BillingPlanKey, BillingProduct } from "./types";
import { changeableSubscriptionStatuses } from "./utils";

type BillingPlanState = {
	subscription?: {
		productId?: string | null;
		status?: string | null;
	} | null;
};

type UseCampaignBillingActionsParams = {
	planState?: BillingPlanState;
	setError: (message: string) => void;
	setMessage: (message: string) => void;
};

export function useCampaignBillingActions({
	planState,
	setError,
	setMessage,
}: UseCampaignBillingActionsParams) {
	const generateCheckoutLink = useAction(api.billing.generateCheckoutLink);
	const generateCustomerPortalUrl = useAction(api.billing.generateCustomerPortalUrl);
	const changeCurrentSubscription = useAction(api.billing.changeCurrentSubscription);
	const [billingAction, setBillingAction] = useState<BillingAction>(null);

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

	return {
		billingAction,
		handleBillingPlan,
		handleBillingPortal,
	};
}
