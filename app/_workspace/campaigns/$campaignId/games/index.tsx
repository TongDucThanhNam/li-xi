import { createFileRoute } from "@tanstack/react-router";
import { CampaignSectionFeature } from "@/app/_workspace/-features/CampaignSectionFeature";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId/games/")({
	head: () => ({
		meta: [
			{ title: "Trò chơi chiến dịch | Campaign Game Studio" },
			{
				name: "description",
				content: "Xem và mở các trải nghiệm trò chơi thuộc chiến dịch.",
			},
		],
	}),
	component: GamesIndexRoute,
});

function GamesIndexRoute() {
	const { campaignId } = Route.useParams();
	return <CampaignSectionFeature key={campaignId} campaignId={campaignId} />;
}
