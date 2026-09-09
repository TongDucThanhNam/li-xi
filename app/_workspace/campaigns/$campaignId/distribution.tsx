import { createFileRoute } from "@tanstack/react-router";
import { DistributionFeature } from "@/app/_workspace/-features/DistributionFeature";

export const Route = createFileRoute("/_workspace/campaigns/$campaignId/distribution")({
	head: () => ({
		meta: [
			{ title: "Phân phối | Campaign Game Studio" },
			{
				name: "description",
				content: "Quản lý liên kết chơi công khai, mã QR và điểm vào trạm của chiến dịch.",
			},
		],
	}),
	component: DistributionRoute,
});

function DistributionRoute() {
	const { campaignId } = Route.useParams();
	return <DistributionFeature key={campaignId} campaignId={campaignId} />;
}
