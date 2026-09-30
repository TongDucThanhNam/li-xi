import { createFileRoute } from "@tanstack/react-router";
import { OnboardingFeature } from "./-features/OnboardingFeature";

export const Route = createFileRoute("/_workspace/onboarding")({
	head: () => ({
		meta: [
			{ title: "Bắt đầu | Campaign Game Studio" },
			{
				name: "description",
				content: "Khởi tạo chiến dịch đầu tiên và tiếp tục vào Campaign Studio.",
			},
		],
	}),
	component: OnboardingFeature,
});
