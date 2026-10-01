import { createFileRoute } from "@tanstack/react-router";
import { CampaignSettingsFeature } from "@/app/_workspace/-features/CampaignSettingsFeature";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId/settings")({
	head: () => ({
		meta: [
			{ title: "Cài đặt chiến dịch | Campaign Game Studio" },
			{
				name: "description",
				content: "Thông tin, trạng thái và nhận diện thương hiệu của chiến dịch.",
			},
		],
	}),
	component: CampaignSettingsRoute,
});

function CampaignSettingsRoute() {
	const { campaignId } = Route.useParams();
	return <CampaignSettingsFeature key={campaignId} campaignId={campaignId} />;
}
