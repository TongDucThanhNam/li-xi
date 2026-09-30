// Repo-owned test fixture: synthetic convex/react for the workspace admin
// surfaces. Test controls may change mock data and response timing only —
// never the product behavior under test. UI scope only; this is NOT a
// real-backend test.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";
import { gameTemplates } from "@/lib/gameTemplates";
import { participantMutation, participantQuery } from "./participant-convex-mock";
import { operatorMutation, operatorQuery } from "./operator-convex-mock";
import {
	isStationCampaignGameId,
	isStationSessionId,
	STATION_CAMPAIGN_ID,
	stationClaimAction,
	stationMutation,
	stationPlayAction,
	stationQuery,
} from "./station-convex-mock";

export const CAMPAIGN_A = "campaign-a";
export const CAMPAIGN_B = "campaign-b";

const listeners = new Set<() => void>();
let version = 0;
let saveMode: "immediate" | "delayed" = "immediate";
/** Campaign-index empty state switch for the /campaigns capture. In-memory
 *  module state resets on reload, so the fixture URL can seed it. */
let campaignsMode: "default" | "empty" =
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).get("campaignsMode") === "empty"
		? "empty"
		: "default";

/** Shared store access for the participant backend (same module instance). */
export function subscribeVersion(listener: () => void) {
	return subscribe(listener);
}
export function bumpVersion() {
	emit();
}
const campaignId = CAMPAIGN_A;
const pendingSaves: Array<{ id: number; campaignId: string; resolve: () => void }> = [];
let saveCounter = 0;
const recordedCalls: Array<Record<string, any>> = [];

const inventories: Record<string, any[]> = {
	[CAMPAIGN_A]: [
		{
			id: "inv-a-voucher", name: "Voucher quà tặng A", rewardType: "voucher",
			rewardTypeLabel: "Voucher / mã quà", amount: null, hasSecretCode: true,
			quantityTotal: 20, quantityRemaining: 20, weight: 20, isActive: true, poolTag: "vip",
		},
	],
	[CAMPAIGN_B]: [
		{
			id: "inv-b-points", name: "Điểm thưởng B", rewardType: "points",
			rewardTypeLabel: "Điểm", amount: 25, hasSecretCode: false,
			quantityTotal: 50, quantityRemaining: 50, weight: 30, isActive: true, poolTag: "loyalty",
		},
	],
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
const emit = () => {
	version += 1;
	listeners.forEach((listener) => listener());
};

// ---------------------------------------------------------------------------
// Analytics fixture data (claims queue + breakdowns). Fixed timestamps keep
// snapshots deterministic; shapes mirror the real backend payloads.
// ---------------------------------------------------------------------------
export const FIXED_CLAIM_TS = Date.parse("2026-09-12T00:20:00+07:00");
export const FIXED_CLAIM_FULFILLED_TS = Date.parse("2026-09-12T00:25:00+07:00");
export const FIXED_REDEMPTION_TS = Date.parse("2026-09-12T00:10:00+07:00");

const secretCodesByClaim: Record<string, string> = {
	"claim-a-1": "voucher-full-4821",
	"claim-a-2": "cash-code-1092",
};

const claimsByCampaign: Record<string, any[]> = {
	[CAMPAIGN_A]: [
		{
			claimId: "claim-a-1",
			claimedAt: FIXED_CLAIM_TS,
			fulfilmentState: "pending",
			fulfilledAt: null,
			channel: "public-link",
			channelLabel: "qr",
			participantDisplayName: "Nguyễn Văn A",
			game: { campaignGameId: "op-game-wheel", name: "Vòng quay tri ân", templateId: "lucky-wheel" },
			reward: { label: "Voucher quà tặng A", rewardType: "voucher", amount: null },
			maskedCode: "••••4821",
		},
		{
			claimId: "claim-a-2",
			claimedAt: FIXED_CLAIM_TS + 60_000,
			fulfilmentState: "pending",
			fulfilledAt: null,
			channel: "station",
			channelLabel: "Trạm chơi",
			participantDisplayName: "Trần Thị B",
			game: { campaignGameId: "op-game-wheel", name: "Vòng quay tri ân", templateId: "lucky-wheel" },
			reward: { label: "Tiền mặt 50.000", rewardType: "cash", amount: 50000 },
			maskedCode: "••••1092",
		},
		{
			claimId: "claim-a-3",
			claimedAt: FIXED_CLAIM_TS + 120_000,
			fulfilmentState: "fulfilled",
			fulfilledAt: FIXED_CLAIM_FULFILLED_TS,
			channel: "station",
			channelLabel: "Trạm chơi",
			participantDisplayName: "Lê Văn C",
			game: { campaignGameId: "op-game-scratch", name: "Thẻ cào tri ân", templateId: "scratch-card" },
			reward: { label: "Quà tặng lưu niệm", rewardType: "physical", amount: null },
			maskedCode: null,
		},
	],
	[CAMPAIGN_B]: [
		{
			claimId: "claim-b-1",
			claimedAt: FIXED_CLAIM_TS + 180_000,
			fulfilmentState: "pending",
			fulfilledAt: null,
			channel: "public-link",
			channelLabel: "facebook",
			participantDisplayName: "Phạm D",
			game: { campaignGameId: "op-game-b", name: "Vòng quay chiến dịch B", templateId: "lucky-wheel" },
			reward: { label: "Điểm thưởng B", rewardType: "points", amount: 25 },
			maskedCode: null,
		},
	],
};

// Deterministic data-URI stand-ins for attached R2 assets (4d-3): slot
// previews, guest-stage slot images and the brand logo render offline and
// decode fast enough for snapshot waits.
const FIXTURE_IMAGE_HUB =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwJfLbFa2gyH8OITBAtxmr/N1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYBJpwxh1uw6/IAAAAASUVORK5CYII=";
const FIXTURE_IMAGE_BACKDROP =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABICAIAAACx52pFAAAAm0lEQVR4nO3RQQ0AIAzAwBnANwIQjIw9ekkFNLk572qxWT+IBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0O4DNU3GaNqnfFwAAAAASUVORK5CYII=";
const FIXTURE_IMAGE_LOGO =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeUlEQVR4nO3PwQkAIBDAsHu5srO6jUP4CEKhA6Rz9vq64YIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALHruZ2WE8C6W85gAAAABJRU5ErkJggg==";

/** Slot-image map as the real backend resolves it (usage → URL). */
function gameAssetUrls(game: Record<string, any>): Record<string, string> {
	return Object.fromEntries(
		(game.assets ?? [])
			.filter((asset: any) => asset.usage && asset.url)
			.map((asset: any) => [asset.usage, asset.url]),
	);
}

const workspaceCampaignViews: Array<Record<string, any>> = [
	{
		id: CAMPAIGN_A,
		name: "Chiến dịch tri ân A",
		slug: "campaign-a",
		brandName: "Thương hiệu A",
		description: "Chiến dịch tri ân khách hàng mùa trung thu.",
		status: "active",
		campaignGame: { id: "wf-game-lunar" },
		// 4d-3 brand identity (workspace metadata only): the overview shows the
		// metadata chips + fields, the campaigns list shows logo/color/audience.
		brandColor: "#7c3aed",
		logoAsset: { id: "wf-asset-logo", url: FIXTURE_IMAGE_LOGO },
		audienceTags: ["new-customers", "event-guests"],
		audienceNote: "Ưu tiên khách vãng lai tại sự kiện mở hàng.",
	},
	{
		id: CAMPAIGN_B,
		name: "Chiến dịch tri ân B",
		slug: "campaign-b",
		brandName: "Thương hiệu B",
		description: "Chiến dịch chạy thử mẫu vòng quay.",
		status: "active",
		campaignGame: { id: "op-game-b" },
		// Campaign B keeps the pre-4d-3 view shape (the real backend still
		// returns the defaulted fields), so the list renders the fallback icon
		// and no chips for it.
		brandColor: null,
		logoAsset: null,
		audienceTags: [],
		audienceNote: "",
	},
];

const legacyHistoryRows = [
	{
		id: "redemption-a-1",
		guestNameDisplay: "Nguyễn Văn A",
		amount: 50000,
		rarity: "rare",
		campaignName: "Chiến dịch tri ân A",
		campaignBrandName: "Thương hiệu A",
		deliveryMode: "link",
		createdAt: FIXED_REDEMPTION_TS,
		envelopeIndex: 0,
	},
	{
		id: "redemption-a-2",
		guestNameDisplay: "Trần Thị B",
		amount: 120000,
		rarity: "legend",
		campaignName: "Chiến dịch tri ân A",
		campaignBrandName: "Thương hiệu A",
		deliveryMode: "station",
		createdAt: FIXED_REDEMPTION_TS + 60_000,
		envelopeIndex: 1,
	},
];

const ownerAnalytics = {
	gameMetrics: {
		opens: 120,
		starts: 96,
		completions: 84,
		rewardOutcomes: 84,
		claims: 78,
		conversion: 0.65,
		channelSharePerformance: { publicPlayLinkOpens: 88 },
	},
};

const campaignGameBreakdownRows = [
	{
		campaignId: CAMPAIGN_A,
		campaignGameId: "op-game-wheel",
		gameName: "Vòng quay tri ân",
		gameTemplateId: "lucky-wheel",
		opens: 120,
		starts: 96,
		completions: 84,
		rewardOutcomes: 84,
		claims: 78,
		conversion: 0.65,
	},
	{
		campaignId: CAMPAIGN_A,
		campaignGameId: "op-game-scratch",
		gameName: "Thẻ cào tri ân",
		gameTemplateId: "scratch-card",
		opens: 40,
		starts: 30,
		completions: 26,
		rewardOutcomes: 26,
		claims: 24,
		conversion: 0.6,
	},
];

const campaignChannelBreakdownRows = [
	{
		key: "public-link",
		label: "Liên kết công khai",
		opens: 88,
		starts: 70,
		completions: 62,
		rewardOutcomes: 62,
		claims: 58,
		conversion: 0.659,
	},
	{
		key: "station",
		label: "Trạm chơi",
		opens: 26,
		starts: 26,
		completions: 22,
		rewardOutcomes: 22,
		claims: 20,
		conversion: 0.769,
	},
	{
		key: "legacy",
		label: "li xi (legacy)",
		opens: 6,
		starts: 0,
		completions: 0,
		rewardOutcomes: 0,
		claims: 0,
		conversion: 0,
	},
];

const campaignShareLinkBreakdownRows = [
	{
		shareLinkId: "sharelink-a-qr",
		campaignId: CAMPAIGN_A,
		campaignGameId: "op-game-wheel",
		label: "Link QR",
		channel: "qr",
		linkOpens: 52,
		opens: 50,
		starts: 42,
		completions: 38,
		rewardOutcomes: 38,
		claims: 36,
		conversion: 0.72,
	},
	{
		shareLinkId: "sharelink-a-fb",
		campaignId: CAMPAIGN_A,
		campaignGameId: "op-game-wheel",
		label: "Facebook",
		channel: "facebook",
		linkOpens: 36,
		opens: 38,
		starts: 28,
		completions: 24,
		rewardOutcomes: 24,
		claims: 22,
		conversion: 0.579,
	},
];

// ---------------------------------------------------------------------------
// Workspace fixture data: one coherent campaign (CAMPAIGN_A) with five
// template-configured games, shared by /campaigns, editors, distribution,
// operate and onboarding surfaces mounted in the real workspace chrome.
// ---------------------------------------------------------------------------
export const WORKSPACE_GAME_IDS = {
	lunar: "wf-game-lunar",
	wheel: "wf-game-wheel",
	scratch: "wf-game-scratch",
	slot: "wf-game-slot",
	quiz: "wf-game-quiz",
} as const;

const WORKSPACE_TEMPLATE_BY_KEY = {
	lunar: "li-xi",
	wheel: "lucky-wheel",
	scratch: "scratch-card",
	slot: "slot-reveal",
	quiz: "quiz",
} as const;

function workspaceGame(key: keyof typeof WORKSPACE_GAME_IDS & string, overrides: Record<string, any> = {}) {
	const templateId = WORKSPACE_TEMPLATE_BY_KEY[key];
	const catalog = gameTemplates[templateId];
	return {
		id: WORKSPACE_GAME_IDS[key],
		name: catalog.name,
		templateId,
		status: "active",
		config: structuredClone(catalog.initialCampaignConfig),
		playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
		// Real-shaped play window (absent bounds = open); tests override.
		schedule: { startsAt: null, endsAt: null },
		// Live per-game slot assets (4d-3); empty renders template fallbacks.
		assets: [] as Array<{ usage: string; assetId: string; url: string }>,
		...overrides,
	};
}

const workspaceGames: Array<Record<string, any>> = [
	workspaceGame("lunar", {
		name: "Bánh bao lì xì (chính)",
		config: {
			templateId: "li-xi",
			rewardSource: "campaign-budget",
			rewardMode: "rewarded",
			styleVariant: "lunar",
			noRewardWeight: 0,
			noRewardLabel: "Chúc bạn may mắn",
			publicCopy: {
				headline: "Bánh bao lì xì",
				subtitle: "Tri ân khách hàng",
				startCtaLabel: "Bắt đầu",
				collectCtaLabel: "Nhận thưởng",
				waitingMessage: "",
			},
		},
	}),
	// Bounded window OPEN now (relative epochs stay deterministic). The wheel
	// carries its template's hub slot so the editor slot card and the station
	// waiting screen show the uploaded image.
	workspaceGame("wheel", {
		schedule: {
			startsAt: Date.now() - 24 * 60 * 60 * 1000,
			endsAt: Date.now() + 24 * 60 * 60 * 1000,
		},
		assets: [
			{ usage: "game-wheel-hub", assetId: "wf-asset-wheel-hub", url: FIXTURE_IMAGE_HUB },
		],
	}),
	workspaceGame("scratch"),
	workspaceGame("slot"),
	// Future window: the games list shows the "Chưa mở cửa sổ" chip. The quiz
	// carries its backdrop slot for the editor slot card.
	workspaceGame("quiz", {
		schedule: {
			startsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
			endsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
		},
		assets: [
			{ usage: "game-quiz-backdrop", assetId: "wf-asset-quiz-backdrop", url: FIXTURE_IMAGE_BACKDROP },
		],
	}),
];

function findWorkspaceGame(campaignGameId: unknown) {
	return workspaceGames.find((game) => game.id === campaignGameId) ?? null;
}

export function isWorkspaceGameId(campaignGameId: unknown): boolean {
	return typeof campaignGameId === "string" && campaignGameId.startsWith("wf-game-");
}

const workspaceCampaignRecord: Record<string, any> = {
	...structuredClone(workspaceCampaignViews[0]),
	theme: "brand",
	gameTemplateId: "li-xi",
	gameConfig: workspaceGames[0].config,
	heroAsset: null,
	claimHeadline: workspaceGames[0].config.publicCopy.headline,
	claimSubtitle: workspaceGames[0].config.publicCopy.subtitle,
	claimCtaLabel: workspaceGames[0].config.publicCopy.startCtaLabel,
	claimCollectLabel: workspaceGames[0].config.publicCopy.collectCtaLabel,
	claimWaitingMessage: workspaceGames[0].config.publicCopy.waitingMessage,
};

const workspacePendingLinks = [
	{
		id: "wf-legacy-session-1",
		guestNameDisplay: "Khách mời trạm",
		campaignName: workspaceCampaignRecord.name,
		publicPlayPath: "/play/1a2b3c4d5e6f7a8b9c0d1e2f",
		sharePath: "/play/1a2b3c4d5e6f7a8b9c0d1e2f",
		expiresAt: Date.parse("2026-09-30T00:00:00+07:00"),
	},
];

const workspaceSetupState = {
	hasSetup: true,
	canConfigure: true,
	hasHostPin: true,
	campaigns: [{ id: CAMPAIGN_A }],
	items: [
		{ amount: 50000, initialQuantity: 15, rarity: "common" },
		{ amount: 120000, initialQuantity: 10, rarity: "legend" },
	],
	budget: { totalBudget: 1950000, remainingBudget: 1650000 },
};

const workspacePlanState = {
	tier: "free",
	label: "Miễn phí",
	source: "default",
	subscription: null,
	billingError: null,
	resources: {
		assets: { used: 1, limit: 10, isFull: false, isExceeded: false },
		budgetItems: { used: 2, limit: 50, isFull: false, isExceeded: false },
		campaigns: { used: 2, limit: 5, isFull: false, isExceeded: false },
		openSessions: { used: 1, limit: 20, isFull: false, isExceeded: false },
		redemptions: { used: 170, limit: null, isFull: false, isExceeded: false },
	},
};

const workspaceProducts = {
	pro: {
		id: "prod_pro",
		isRecurring: true,
		name: "Pro",
		prices: [{ amountType: "fixed", priceAmount: 290000, priceCurrency: "vnd" }],
		recurringInterval: "month",
	},
	business: {
		id: "prod_business",
		isRecurring: true,
		name: "Business",
		prices: [{ amountType: "fixed", priceAmount: 890000, priceCurrency: "vnd" }],
		recurringInterval: "month",
	},
};

function workspaceReadinessCheck(key: string, label: string) {
	return { key, label, required: true, ready: true };
}

const workspaceReadiness = {
	allRequiredReady: true,
	runtimeChecks: {
		oauth: [
			workspaceReadinessCheck("googleClientIdShape", "Google OAuth client ID hợp lệ"),
			workspaceReadinessCheck("googleClientSecretShape", "Google OAuth client secret hợp lệ"),
			workspaceReadinessCheck("jwksShape", "JWKS của Convex Auth hợp lệ"),
		],
		operations: [
			workspaceReadinessCheck("legacyAccountAuthDisabled", "Đã tắt đăng nhập tài khoản cũ"),
			workspaceReadinessCheck("siteUrlHttps", "Địa chỉ ứng dụng dùng HTTPS"),
		],
		polar: [
			workspaceReadinessCheck("polarOrganizationTokenShape", "Token tổ chức Polar hợp lệ"),
			workspaceReadinessCheck("uniqueConfiguredProducts", "Sản phẩm Polar Pro và Business tách biệt"),
		],
		r2: [
			workspaceReadinessCheck("r2BucketNameSafe", "Tên bucket R2 an toàn"),
			workspaceReadinessCheck("r2EndpointHttpsOrigin", "Điểm gốc R2 dùng HTTPS"),
		],
	},
	endpoints: {
		convexSiteOrigin: "https://fixture.convex.site",
		googleCallbackUrl: "https://fixture.app/api/auth/callback/google",
		polarWebhookUrl: "https://fixture.app/api/polar/webhook",
		siteUrlOrigin: "https://fixture.app",
	},
};

/** Campaign/game contexts for the workspace fixture's own ids; undefined falls through. */
export function workspaceQueryValue(name: string, args: any): unknown {
	if (name === "campaigns:getCampaignRouteContext" && args?.campaignId === CAMPAIGN_A) {
		return structuredClone(workspaceCampaignRecord);
	}
	if (name === "campaigns:getCampaignGamesRouteContext" && args?.campaignId === CAMPAIGN_A) {
		return {
			campaign: structuredClone(workspaceCampaignRecord),
			campaignGames: structuredClone(workspaceGames),
		};
	}
	if (name === "campaigns:getCampaignGameRouteContext" && isWorkspaceGameId(args?.campaignGameId)) {
		const game = findWorkspaceGame(args.campaignGameId);
		if (!game) return null;
		return { campaign: structuredClone(workspaceCampaignRecord), campaignGame: structuredClone(game) };
	}
	if (name === "stationPlay:getStationPlayState" && isWorkspaceGameId(args?.campaignGameId)) {
		const game = findWorkspaceGame(args.campaignGameId);
		if (!game) return null;
		const schedule = game.schedule ?? { startsAt: null, endsAt: null };
		return {
			state: "open",
			campaignGameId: game.id,
			templateId: game.templateId,
			gameName: game.name,
			campaign: {
				name: workspaceCampaignRecord.name,
				brandName: workspaceCampaignRecord.brandName,
				description: workspaceCampaignRecord.description,
				heroAssetUrl: null,
			},
			copy: game.config.publicCopy,
			assetUrls: gameAssetUrls(game),
			schedule: {
				...schedule,
				state:
					typeof schedule.startsAt === "number" && schedule.startsAt > Date.now()
						? "not-started"
						: typeof schedule.endsAt === "number" && schedule.endsAt < Date.now()
							? "ended"
							: "open",
			},
			availability: { soldOut: false },
			inventory: structuredClone(inventories[CAMPAIGN_A] ?? []),
			playSession: null,
		};
	}
	if (name === "draw:getStationState" && args?.campaignId === CAMPAIGN_A) {
		return { hasSetup: true, pendingLinkSessions: structuredClone(workspacePendingLinks) };
	}
	if (name === "setup:getSetupState") {
		return structuredClone(workspaceSetupState);
	}
	if (name === "entitlements:getPlanState") {
		return structuredClone(workspacePlanState);
	}
	if (name === "billing:getConfiguredProducts") {
		return structuredClone(workspaceProducts);
	}
	if (name === "ops:getHostSaaSReadiness") {
		return structuredClone(workspaceReadiness);
	}
	return undefined;
}

/** Mutations for workspace-scoped ids; undefined falls through. */
export function workspaceMutationValue(name: string, args: any): unknown {
	if (name === "draw:createSession" && args?.campaignId === CAMPAIGN_A) {
		const session = {
			id: `wf-legacy-session-${workspacePendingLinks.length + 1}`,
			guestNameDisplay: args.guestName,
			campaignName: workspaceCampaignRecord.name,
			publicPlayPath: `/play/${String(workspacePendingLinks.length).padStart(24, "0")}play`,
			sharePath: `/play/${String(workspacePendingLinks.length).padStart(24, "0")}play`,
			expiresAt: Date.now() + 3_600_000,
		};
		workspacePendingLinks.push(session);
		return { sessionId: session.id, publicPlayPath: session.publicPlayPath };
	}
	if (name === "draw:cancelSession" && args?.campaignId === CAMPAIGN_A) {
		const index = workspacePendingLinks.findIndex((session) => session.id === args.sessionId);
		if (index >= 0) workspacePendingLinks.splice(index, 1);
		return { canceled: true };
	}
	if (name === "campaigns:ensureDefaultCampaign") {
		return { campaignId: CAMPAIGN_A };
	}
	if (name === "campaigns:ensureCampaignGameForRoute" && args?.campaignId === CAMPAIGN_A) {
		return { campaignGameId: workspaceGames[0]?.id };
	}
	if (name === "campaignGames:createCampaignGame" && args?.campaignId === CAMPAIGN_A) {
		const key = (Object.keys(WORKSPACE_TEMPLATE_BY_KEY) as Array<keyof typeof WORKSPACE_TEMPLATE_BY_KEY>)
			.find((candidate) => WORKSPACE_TEMPLATE_BY_KEY[candidate] === args.templateId);
		if (!key) throw new Error(`Unsupported synthetic template: ${args.templateId}`);
		const overrides: Record<string, any> = {
			id: `wf-game-created-${workspaceGames.length + 1}`,
			status: args.status ?? "draft",
		};
		if (args.name) overrides.name = args.name;
		const game = workspaceGame(key, overrides);
		workspaceGames.push(game);
		return { campaignGameId: game.id, name: game.name };
	}
	if (name === "campaignGames:updateCampaignGame" && isWorkspaceGameId(args?.campaignGameId)) {
		const game = findWorkspaceGame(args.campaignGameId);
		if (!game) throw new Error("Synthetic workspace game not found");
		if (args.config) game.config = args.config;
		if (args.playLimits) game.playLimits = args.playLimits;
		if (args.status) game.status = args.status;
		// Optional bounds mirror the server write path: an omitted bound
		// clears that side of the window.
		if (args.startsAt !== undefined || args.endsAt !== undefined) {
			game.schedule = {
				startsAt: typeof args.startsAt === "number" ? args.startsAt : null,
				endsAt: typeof args.endsAt === "number" ? args.endsAt : null,
			};
		}
		return { campaignGameId: game.id, templateId: game.templateId, name: game.name };
	}
	if (name === "setup:configureBudget" && args?.campaignId === CAMPAIGN_A) {
		return { saved: true };
	}
	if (name === "auth:setHostPin") {
		return { saved: true };
	}
	if (name === "assets:generateUploadUrl") {
		return { url: "https://fixture.invalid/upload", key: "fixture-asset-key" };
	}
	if (name === "assets:syncMetadata") {
		return { ok: true };
	}
	if (name === "campaigns:saveCampaign") {
		// Brand identity follows the real write semantics: an omitted optional
		// field clears it, so callers round-trip the values they keep.
		const view = workspaceCampaignViews[0];
		const applyBrand = (record: Record<string, any>) => {
			record.brandColor = typeof args.brandColor === "string" ? args.brandColor : undefined;
			record.audienceTags = Array.isArray(args.audienceTags) ? [...args.audienceTags] : undefined;
			record.audienceNote = typeof args.audienceNote === "string" ? args.audienceNote : undefined;
			if (typeof args.logoAssetId === "string") {
				record.logoAsset = {
					id: args.logoAssetId,
					url: record.logoAsset?.id === args.logoAssetId
						? record.logoAsset?.url
						: FIXTURE_IMAGE_LOGO,
				};
			} else if ("logoAssetId" in args) {
				record.logoAsset = undefined;
			}
		};
		applyBrand(view);
		applyBrand(workspaceCampaignRecord);
		return { campaignId: CAMPAIGN_A, campaignGameId: workspaceGames[0]?.id };
	}
	if (name === "campaigns:attachUploadedAsset") {
		// Mirror the real attach: a game-slot usage binds the slot on that
		// game; brand-logo points the campaign at the logo; the legacy default
		// is the campaign hero.
		const assetId = `wf-asset-${++saveCounter}`;
		if (typeof args.usage === "string" && args.usage.startsWith("game-")) {
			const game = findWorkspaceGame(args.campaignGameId);
			if (!game) throw new Error("Synthetic workspace game not found");
			game.assets = (game.assets ?? []).filter((asset: any) => asset.usage !== args.usage);
			game.assets.push({ usage: args.usage, assetId, url: FIXTURE_IMAGE_HUB });
		} else if (args.usage === "brand-logo") {
			workspaceCampaignViews[0].logoAsset = { id: assetId, url: FIXTURE_IMAGE_LOGO };
			workspaceCampaignRecord.logoAsset = { id: assetId, url: FIXTURE_IMAGE_LOGO };
		} else {
			workspaceCampaignRecord.heroAsset = { id: assetId, url: FIXTURE_IMAGE_HUB };
		}
		return { campaignAssetId: assetId };
	}
	if (name === "campaigns:detachCampaignAsset") {
		for (const game of workspaceGames) {
			const before = game.assets?.length ?? 0;
			game.assets = (game.assets ?? []).filter((asset: any) => asset.assetId !== args.assetId);
			if (game.assets.length !== before) {
				return { assetId: args.assetId, detached: true };
			}
		}
		for (const record of [workspaceCampaignViews[0], workspaceCampaignRecord]) {
			if (record.logoAsset?.id === args.assetId) record.logoAsset = undefined;
			if (record.heroAsset?.id === args.assetId) record.heroAsset = null;
		}
		return { assetId: args.assetId, detached: true };
	}
	return undefined;
}

/** Billing actions (useAction) for the settings fixtures. */
export function workspaceActionValue(name: string, args: any): unknown {
	if (name === "billing:generateCheckoutLink") {
		void args;
		return { url: "https://fixture.invalid/checkout" };
	}
	if (name === "billing:generateCustomerPortalUrl") {
		return { url: "https://fixture.invalid/portal" };
	}
	if (name === "billing:changeCurrentSubscription") {
		return { ok: true };
	}
	throw new Error(`Unsupported synthetic action: ${name}`);
}

function analyticsQueryValue(name: string, args: any): unknown {
	if (name === "auth:getCurrentUser") {
		return { username: "operator" };
	}
	if (name === "campaigns:getWorkspace") {
		return campaignsMode === "empty"
			? { activeCampaign: null, campaigns: [] }
			: {
				activeCampaign: workspaceCampaignViews[0] ?? null,
				campaigns: structuredClone(workspaceCampaignViews),
			};
	}
	if (name === "leaderboard:getOwnerLeaderboard" || name === "leaderboard:getCampaignLeaderboard") {
		return structuredClone(
			legacyHistoryRows.map((row, index) => ({ ...row, rank: index + 1 })),
		);
	}
	if (name === "leaderboard:getOwnerHistory" || name === "leaderboard:getCampaignHistory") {
		return structuredClone(legacyHistoryRows);
	}
	if (name === "analytics:getOwnerAnalytics" || name === "analytics:getCampaignAnalytics") {
		return structuredClone(ownerAnalytics);
	}
	if (name === "analytics:getCampaignGameBreakdown") {
		return {
			rows: structuredClone(
				args?.campaignId && args.campaignId !== CAMPAIGN_A
					? []
					: campaignGameBreakdownRows,
			),
		};
	}
	if (name === "analytics:getCampaignChannelBreakdown") {
		return {
			rows: structuredClone(
				args?.campaignId && args.campaignId !== CAMPAIGN_A
					? []
					: campaignChannelBreakdownRows,
			),
		};
	}
	if (name === "analytics:getCampaignShareLinkBreakdown") {
		return {
			rows: structuredClone(
				args?.campaignId && args.campaignId !== CAMPAIGN_A
					? []
					: campaignShareLinkBreakdownRows,
			),
		};
	}
	if (name === "rewardClaims:revealRewardClaimCode") {
		const row = Object.values(claimsByCampaign)
			.flat()
			.find((claim) => claim.claimId === args?.claimId);
		if (!row) {
			throw new Error("Không tìm thấy yêu cầu nhận thưởng");
		}
		return {
			claimId: row.claimId,
			claim: {
				label: row.reward.label,
				rewardType: row.reward.rewardType,
				amount: row.reward.amount ?? null,
				secretCode: secretCodesByClaim[row.claimId] ?? null,
				instructions: row.reward.rewardType === "voucher"
					? "Lưu lại mã này để đổi thưởng với nhân viên chiến dịch."
					: null,
			},
		};
	}
	if (name === "rewardClaims:listRewardClaims") {
		let rows = structuredClone(claimsByCampaign[args?.campaignId] ?? []);
		if (args?.fulfilmentState) {
			rows = rows.filter((claim) => claim.fulfilmentState === args.fulfilmentState);
		}
		if (args?.channel) {
			rows = rows.filter((claim) => claim.channel === args.channel);
		}
		if (args?.rewardType) {
			rows = rows.filter((claim) => claim.reward.rewardType === args.rewardType);
		}
		if (args?.codeSearch) {
			rows = rows.filter(
				(claim) =>
					(secretCodesByClaim[claim.claimId] ?? "").toLowerCase() ===
					String(args.codeSearch).trim().toLowerCase(),
			);
		}
		return { page: rows, isDone: true, continueCursor: "" };
	}
	return undefined;
}

// Version-keyed result cache: identities stay stable between renders until
// the backing data changes, so product effects keyed on query identity do
// not loop (React maximum-update-depth).
const queryCache = new Map<string, { version: number; value: unknown }>();

export function useQuery(ref: any, args: any) {
	const snapshotVersion = useSyncExternalStore(subscribe, () => version, () => version);
	if (args === "skip") return undefined;
	const name = getFunctionName(ref);
	const cacheKey = JSON.stringify([name, args]);
	const cached = queryCache.get(cacheKey);
	if (cached && cached.version === snapshotVersion) {
		return cached.value;
	}
	let value: unknown;
		const workspaceValue = workspaceQueryValue(name, args);
		if (workspaceValue !== undefined) {
			value = workspaceValue;
		} else if (name === "rewardInventory:getRewardInventory") {
			value = { items: structuredClone(inventories[args.campaignId] ?? []) };
		} else if (name.startsWith("stationPlay:")) {
			// Station kiosk ids belong to the station backend; operator ids hit
			// the operator backend's launch-card state synthesis.
			value = isStationCampaignGameId(args?.campaignGameId)
				? stationQuery(name, args)
				: operatorQuery(name, args);
		} else if (
			name === "campaigns:getCampaignGameRouteContext" &&
			isStationCampaignGameId(args?.campaignGameId)
		) {
			value = stationQuery(name, args);
		} else if (
			name === "draw:getStationState" &&
			args?.campaignId === STATION_CAMPAIGN_ID
		) {
			// The legacy li-xi station screen plays the operator-created draw
			// session; the console keeps its own draw:getStationState shape.
			value = stationQuery(name, args);
		} else if (name.startsWith("publicPlay:")) {
		value = participantQuery(name, args);
	} else if (name === "campaigns:getWorkspace") {
		// Analytics workspace synthesis; the operator fixture synthesizes its
		// own per-feature campaigns:/shareLinks: shapes.
		value = analyticsQueryValue(name, args);
	} else if (
		name.startsWith("campaigns:") ||
		name.startsWith("campaignGames:") ||
		name.startsWith("shareLinks:") ||
		name.startsWith("draw:")
	) {
		value = operatorQuery(name, args);
	} else {
		const analyticsValue = analyticsQueryValue(name, args);
		if (analyticsValue === undefined) {
			throw new Error(`Unsupported synthetic query: ${name}`);
		}
		value = analyticsValue;
	}
	queryCache.set(cacheKey, { version: snapshotVersion, value });
	return value;
}

/** The fixture workspace is always signed in through the Convex Auth bridge. */
export function useConvexAuth() {
	return { isAuthenticated: true, isLoading: false };
}

/** Synthetic actions (billing settings); recorded like mutations. */
export function useAction(ref: any) {
	const name = getFunctionName(ref);
	return useCallback(
		async (args: any) => {
			const value = workspaceActionValue(name, args);
			recordedCalls.push(JSON.parse(JSON.stringify({ name, ...args })));
			emit();
			return value;
		},
		[name],
	);
}

/**
 * Synthetic paginated query: the mock claims list always fits one page, so
 * every resolved page reports "Exhausted" and loadMore stays a no-op.
 */
export function usePaginatedQuery(ref: any, args: any, options: { initialNumItems: number }) {
	const result = useQuery(
		ref,
		args === "skip"
			? args
			: { ...args, paginationOpts: { numItems: options.initialNumItems, cursor: null } },
	) as { page: any[] } | undefined;
	if (result === undefined) {
		return {
			results: [] as any[],
			status: "LoadingFirstPage" as const,
			isLoading: true,
			loadMore: () => {},
		};
	}
	return {
		results: result.page,
		status: "Exhausted" as const,
		isLoading: false,
		loadMore: () => {},
	};
}

export function useMutation(ref: any) {
	const name = getFunctionName(ref);
	return useCallback(
		async (args: any) => {
			{
				// Workspace-scoped mutations (setup, assets, host PIN, campaign-a
				// draw sessions, workspace game ids) before the station/operator
				// dispatchers, which own their own id namespaces.
			const workspaceValue = workspaceMutationValue(name, args);
			if (workspaceValue !== undefined) {
				// fixtureMutationName survives args that carry their own `name`
				// (e.g. saveCampaign's campaign name) so calls() can filter.
				recordedCalls.push(
					JSON.parse(JSON.stringify({ name, fixtureMutationName: name, ...args })),
				);
				emit();
				return workspaceValue;
			}
			}
			if (name.startsWith("stationPlay:") || name.startsWith("auth:")) {
				return stationMutation(name, args);
			}
			if (name === "draw:redeem" && isStationSessionId(args?.sessionId)) {
				// Legacy li-xi station reveal for the fixture draw session.
				return stationMutation(name, args);
			}
			if (name.startsWith("publicPlay:")) {
				if (isStationSessionId(args?.sessionId)) {
					return name === "publicPlay:claimPublicReward"
						? stationClaimAction(args)
						: stationPlayAction(args);
				}
				return participantMutation(name, args);
			}
			if (
				name.startsWith("campaigns:") ||
				name.startsWith("campaignGames:") ||
				name.startsWith("shareLinks:")
			) {
				return operatorMutation(name, args);
			}
			if (
				name === "rewardClaims:markRewardClaimFulfilled" ||
				name === "rewardClaims:undoRewardClaimFulfilment"
			) {
				// Metadata-only fulfilment flip; the real authorization and audit
				// contract is covered by convex/rewardClaims.test.ts.
				recordedCalls.push(JSON.parse(JSON.stringify({ name, ...args })));
				const claim = Object.values(claimsByCampaign)
					.flat()
					.find((row) => row.claimId === args?.claimId);
				if (!claim) {
					throw new Error("Không tìm thấy yêu cầu nhận thưởng");
				}
				if (name === "rewardClaims:markRewardClaimFulfilled") {
					claim.fulfilmentState = "fulfilled";
					claim.fulfilledAt = FIXED_CLAIM_FULFILLED_TS;
				} else {
					claim.fulfilmentState = "pending";
					claim.fulfilledAt = null;
				}
				emit();
				return { claimId: claim.claimId, fulfilmentState: claim.fulfilmentState };
			}
			if (name !== "rewardInventory:configureRewardInventory") {
				throw new Error(`Unsupported synthetic mutation: ${name}`);
			}
			recordedCalls.push(JSON.parse(JSON.stringify({ name, ...args })));
			if (saveMode === "delayed") {
				const id = ++saveCounter;
				await new Promise<void>((resolve) => {
					pendingSaves.push({ id, campaignId: args.campaignId, resolve });
					emit();
				});
			}
			// Metadata-only implementation of the owner response contract; the
			// real handler contract is covered by convex/rewardInventory.test.ts.
			const previous = inventories[args.campaignId] ?? [];
			const ids = args.items.map(
				(item: any, index: number) =>
					item.existingItemId ?? `inv-created-${saveCounter}-${index}`,
			);
			for (const item of args.items) {
				if (item.existingItemId && !previous.some((row: any) => row.id === item.existingItemId)) {
					throw new Error("Synthetic existing inventory row is foreign");
				}
			}
			inventories[args.campaignId] = args.items.map((item: any, index: number) => {
				const old = previous.find((row: any) => row.id === item.existingItemId);
				return {
					id: ids[index],
					name: item.name,
					rewardType: item.rewardType,
					rewardTypeLabel: item.rewardType,
					amount: item.amount ?? null,
					hasSecretCode:
						item.rewardType === "voucher" &&
						!item.removeSecretCode &&
						(Boolean(item.secretCode?.trim()) || Boolean(old?.hasSecretCode)),
					quantityTotal: item.quantity,
					quantityRemaining: item.quantity,
					weight: item.weight,
					isActive: item.isActive,
					poolTag: item.poolTag?.trim().slice(0, 24) || "default",
				};
			});
			emit();
			return { count: args.items.length, ids };
		},
		[name],
	);
}

let setCampaignIdHook: ((id: string) => void) | null = null;

/** Programmatic controls for Playwright: response timing and data only. */
export const fixtureApi = {
	campaigns: { A: CAMPAIGN_A, B: CAMPAIGN_B },
	switchCampaign(id: string) {
		setCampaignIdHook?.(id);
	},
	setSaveMode(mode: "immediate" | "delayed") {
		saveMode = mode;
		emit();
	},
	pendingSaveCount() {
		return pendingSaves.length;
	},
	releaseSave() {
		const oldest = pendingSaves.shift();
		oldest?.resolve();
		emit();
	},
	releaseNewestSave() {
		const newest = pendingSaves.pop();
		newest?.resolve();
		emit();
	},
	calls(name: string) {
		return structuredClone(
			recordedCalls.filter((call) => (call.fixtureMutationName ?? call.name) === name),
		);
	},
	claims(campaignId: string) {
		return structuredClone(claimsByCampaign[campaignId] ?? []);
	},
	setClaimFulfilled(claimId: string, fulfilled: boolean) {
		const claim = Object.values(claimsByCampaign)
			.flat()
			.find((row) => row.claimId === claimId);
		if (!claim) {
			throw new Error(`Unknown fixture claim: ${claimId}`);
		}
		claim.fulfilmentState = fulfilled ? "fulfilled" : "pending";
		claim.fulfilledAt = fulfilled ? FIXED_CLAIM_FULFILLED_TS : null;
		emit();
	},
	state() {
		return { campaignId, saveMode, pendingSaves: pendingSaves.length };
	},
	setCampaignsMode(mode: "default" | "empty") {
		campaignsMode = mode;
		emit();
	},
	workspaceGames() {
		return workspaceGames.map((game) => ({
			id: game.id,
			name: game.name,
			templateId: game.templateId,
			status: game.status,
		}));
	},
	/** Sets or clears one game's live slot assets (4d-3); null empties the
	 * map so the editor and station screens fall back to template visuals. */
	setSlotAssets(
		gameId: string,
		assets: Array<{ usage: string; url: string }> | null,
	) {
		const game = findWorkspaceGame(gameId);
		if (!game) throw new Error(`Unknown fixture game: ${gameId}`);
		game.assets = (assets ?? []).map((asset, index) => ({
			usage: asset.usage,
			assetId: `wf-asset-slot-${gameId}-${index}`,
			url: asset.url,
		}));
		emit();
	},
	/** Sets or clears CAMPAIGN_A's brand identity metadata (4d-3); null
	 * restores the pre-4d-3 shape (no fields). */
	setBrandIdentity(
		brand: {
			brandColor?: string;
			logoAsset?: { id: string; url: string };
			audienceTags?: string[];
			audienceNote?: string;
		} | null,
	) {
		const view = workspaceCampaignViews[0];
		view.brandColor = brand?.brandColor;
		view.logoAsset = brand?.logoAsset;
		view.audienceTags = brand?.audienceTags;
		view.audienceNote = brand?.audienceNote;
		workspaceCampaignRecord.brandColor = view.brandColor;
		workspaceCampaignRecord.logoAsset = view.logoAsset;
		workspaceCampaignRecord.audienceTags = view.audienceTags
			? [...view.audienceTags]
			: view.audienceTags;
		workspaceCampaignRecord.audienceNote = view.audienceNote;
		emit();
	},
	__registerCampaignSetter(setter: (id: string) => void) {
		setCampaignIdHook = setter;
	},
};

if (typeof window !== "undefined") {
	(window as any).__inventoryFixture = fixtureApi;
	(window as any).__analyticsFixture = fixtureApi;
	(window as any).__workspaceFixture = fixtureApi;
}
