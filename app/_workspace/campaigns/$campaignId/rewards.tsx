import { createFileRoute } from "@tanstack/react-router";
import { RewardsSetupFeature } from "@/app/_workspace/-features/RewardsSetupFeature";
import type { Id } from "@/convex/_generated/dataModel";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId/rewards")({
	head: () => ({
		meta: [
			{ title: "Phần thưởng | Campaign Game Studio" },
			{
				name: "description",
				content: "Cấu hình ngân sách và tồn kho phần thưởng riêng cho chiến dịch.",
			},
		],
	}),
	component: RewardsRoute,
});

function RewardsRoute() {
	const { campaignId } = Route.useParams();
	return <RewardsSetupFeature key={campaignId} campaignId={campaignId as Id<"campaigns">} />;
}
