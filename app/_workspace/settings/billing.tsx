import { createFileRoute } from "@tanstack/react-router";
import { BillingSettingsFeature } from "../-features/BillingSettingsFeature";

export const Route = createFileRoute("/_workspace/settings/billing")({
	head: () => ({
		meta: [
			{ title: "Thanh toán | Campaign Game Studio" },
			{
				name: "description",
				content: "Theo dõi gói đăng ký, giới hạn và mức sử dụng tài khoản.",
			},
		],
	}),
	component: BillingSettingsFeature,
});
