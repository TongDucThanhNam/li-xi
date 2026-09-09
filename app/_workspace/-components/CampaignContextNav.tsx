import { Link } from "@tanstack/react-router";

export function CampaignContextNav({ campaignId }: { campaignId: string }) {
	return (
		<nav aria-label="Điều hướng chiến dịch" className="mb-6 flex gap-2 overflow-x-auto">
			{[
				["Tổng quan", "/campaigns/$campaignId"],
				["Trò chơi", "/campaigns/$campaignId/games"],
				["Phần thưởng", "/campaigns/$campaignId/rewards"],
				["Phân phối", "/campaigns/$campaignId/distribution"],
			].map(([label, to]) => (
				<Link activeProps={{ "aria-current": "page", className: "bg-surface-secondary" }} className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground" key={to} params={{ campaignId }} to={to}>{label}</Link>
			))}
			<Link activeOptions={{ exact: false }} activeProps={{ "aria-current": "page", className: "bg-surface-secondary" }} className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground" search={{ campaign: campaignId, view: "overview" }} to="/analytics">Phân tích</Link>
		</nav>
	);
}
