import { createFileRoute } from "@tanstack/react-router";
import { CampaignGameEditorFeature } from "@/app/_workspace/-features/CampaignGameEditorFeature";

export const Route = createFileRoute(
	"/_workspace/campaigns/$campaignId/games/$campaignGameId",
)({
	head: () => ({
		meta: [
			{ title: "Cấu hình trò chơi | Campaign Game Studio" },
			{
				name: "description",
				content: "Chỉnh luật, nội dung, tài sản và bản xem trước của trò chơi chiến dịch.",
			},
		],
	}),
	component: GameRoute,
});

function GameRoute() {
	const { campaignGameId, campaignId } = Route.useParams();
	return <CampaignGameEditorFeature key={`${campaignId}:${campaignGameId}`} campaignGameId={campaignGameId} campaignId={campaignId} />;
}
