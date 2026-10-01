import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

export function CampaignContextNav({ campaignId }: { campaignId: string }) {
	return (
		<nav aria-label="Điều hướng chiến dịch" className="admin-tabs">
			<Link activeOptions={{ exact: true, includeSearch: false }} activeProps={{ "aria-current": "page" }} className="admin-tabs__link" params={{ campaignId }} to="/campaigns/$campaignId">Tổng quan</Link>
			<Link activeProps={{ "aria-current": "page" }} className="admin-tabs__link" params={{ campaignId }} to="/campaigns/$campaignId/games">Trò chơi</Link>
			<Link activeProps={{ "aria-current": "page" }} className="admin-tabs__link" params={{ campaignId }} to="/campaigns/$campaignId/rewards">Phần thưởng</Link>
			<Link activeProps={{ "aria-current": "page" }} className="admin-tabs__link" params={{ campaignId }} to="/campaigns/$campaignId/distribution">Phân phối</Link>
			<Link activeProps={{ "aria-current": "page" }} className="admin-tabs__link" params={{ campaignId }} to="/campaigns/$campaignId/settings">Cài đặt</Link>
			<Link activeOptions={{ exact: false }} activeProps={{ "aria-current": "page" }} className="admin-tabs__link admin-tabs__link--away" params={{ campaignId }} search={{ campaign: campaignId, view: "overview" }} to="/analytics">
				Phân tích
				<ArrowUpRight aria-hidden="true" size={14} />
			</Link>
		</nav>
	);
}
