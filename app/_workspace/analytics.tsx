import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsFeature } from "./-features/AnalyticsFeature";

type AnalyticsSearch = {
	campaign?: string;
	view: "overview" | "games" | "rewards" | "channels";
};

export const Route = createFileRoute("/_workspace/analytics")({
	validateSearch: (search: Record<string, unknown>): AnalyticsSearch => ({
		campaign: typeof search.campaign === "string" && search.campaign.trim()
			? search.campaign.trim()
			: undefined,
		view: ["games", "rewards", "channels"].includes(String(search.view))
			? search.view as AnalyticsSearch["view"]
			: "overview",
	}),
	head: () => ({
		meta: [
			{ title: "Phân tích | Campaign Game Studio" },
			{ name: "description", content: "Hiệu quả chiến dịch và trò chơi theo phạm vi URL." },
		],
	}),
	component: AnalyticsFeature,
});
