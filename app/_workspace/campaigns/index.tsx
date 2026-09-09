import { createFileRoute } from "@tanstack/react-router";
import { CampaignIndexFeature } from "../-features/CampaignIndexFeature";

export const Route = createFileRoute("/_workspace/campaigns/")({
	head: () => ({
		meta: [
			{ title: "Chiến dịch | Campaign Game Studio" },
			{ name: "description", content: "Quản lý các chiến dịch trò chơi marketing." },
		],
	}),
	component: CampaignIndexFeature,
});
