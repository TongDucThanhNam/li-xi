import { createFileRoute } from "@tanstack/react-router";
import { CampaignOverviewFeature } from "@/app/_workspace/-features/CampaignOverviewFeature";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId/")({
	head: () => ({
		meta: [
			{ title: "Tổng quan chiến dịch | Campaign Game Studio" },
			{
				name: "description",
				content: "Quản lý nhận diện, trạng thái và thông tin tổng quan của chiến dịch.",
			},
		],
	}),
	component: OverviewRoute,
});

function OverviewRoute() {
	const { campaignId } = Route.useParams();
	return <CampaignOverviewFeature key={campaignId} campaignId={campaignId} />;
}
