import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsFeature } from "./-features/AnalyticsFeature";

type AnalyticsSearch = {
	campaign?: string;
	view: "overview" | "games" | "rewards" | "channels" | "claims";
	// Claims-view filters (validated, URL-persisted per the route-ux contract).
	claimsStatus?: "pending" | "fulfilled";
	claimsChannel?: "public-link" | "station";
	claimsRewardType?: "cash" | "voucher" | "physical" | "points" | "none";
	claimsCode?: string;
};

const CLAIMS_STATUSES = ["pending", "fulfilled"] as const;
const CLAIMS_CHANNELS = ["public-link", "station"] as const;
const CLAIMS_REWARD_TYPES = ["cash", "voucher", "physical", "points", "none"] as const;

export const Route = createFileRoute("/_workspace/analytics")({
	validateSearch: (search: Record<string, unknown>): AnalyticsSearch => ({
		campaign: typeof search.campaign === "string" && search.campaign.trim()
			? search.campaign.trim()
			: undefined,
		view: ["games", "rewards", "channels", "claims"].includes(String(search.view))
			? search.view as AnalyticsSearch["view"]
			: "overview",
		claimsStatus: CLAIMS_STATUSES.includes(search.claimsStatus as never)
			? search.claimsStatus as AnalyticsSearch["claimsStatus"]
			: undefined,
		claimsChannel: CLAIMS_CHANNELS.includes(search.claimsChannel as never)
			? search.claimsChannel as AnalyticsSearch["claimsChannel"]
			: undefined,
		claimsRewardType: CLAIMS_REWARD_TYPES.includes(search.claimsRewardType as never)
			? search.claimsRewardType as AnalyticsSearch["claimsRewardType"]
			: undefined,
		claimsCode: typeof search.claimsCode === "string" && search.claimsCode.trim()
			? search.claimsCode.trim().slice(0, 64)
			: undefined,
	}),
	head: () => ({
		meta: [
			{ title: "Phân tích | Campaign Game Studio" },
			{ name: "description", content: "Hiệu quả chiến dịch và trò chơi theo phạm vi URL." },
		],
	}),
	component: AnalyticsFeature,
});
