import { createFileRoute } from "@tanstack/react-router";
import { CampaignCreateFeature } from "../-features/CampaignCreateFeature";

export const Route = createFileRoute("/_workspace/campaigns/new")({
	head: () => ({
		meta: [
			{ title: "Tạo chiến dịch | Campaign Game Studio" },
			{
				name: "description",
				content: "Tạo chiến dịch marketing và trò chơi đã đăng ký đầu tiên.",
			},
		],
	}),
	component: CampaignCreateFeature,
});
