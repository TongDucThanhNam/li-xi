import { createFileRoute } from "@tanstack/react-router";
import { OperatorConsoleFeature } from "../-features/OperatorConsoleFeature";

export const Route = createFileRoute("/_workspace/operate/$campaignGameId")({
	head: () => ({
		meta: [
			{ title: "Vận hành trò chơi | Campaign Game Studio" },
			{
				name: "description",
				content: "Tạo lượt chơi và quản lý liên kết công khai của trò chơi chiến dịch.",
			},
		],
	}),
	component: OperateRoute,
});

function OperateRoute() {
	const { campaignGameId } = Route.useParams();
	return <OperatorConsoleFeature key={campaignGameId} campaignGameId={campaignGameId} />;
}
