// Operator backend for the ACTUAL CampaignGameEditorFeature and
// DistributionFeature (incl. ShareLinksPanel): synthetic campaigns/*,
// campaignGames/*, shareLinks/* and draw/* queries/mutations with
// deterministic data, deferred save delivery and recorded call arguments.
// In-memory only (no reload-recovery flows on these surfaces). UI
// integration scope only; this is NOT a real backend.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bumpVersion } from "./convex-mock";

const recordedOperatorCalls: Array<Record<string, any>> = [];
let saveMode: "immediate" | "delayed" = "immediate";
const pendingSaves: Array<{ id: number; name: string; resolve: () => void }> = [];
let saveCounter = 0;

const GAME_PRIMARY_LUNAR = "op-game-lunar";
const GAME_WHEEL = "op-game-wheel";
const GAME_SCRATCH = "op-game-scratch";
const GAME_SLOT = "op-game-slot";

const games: Array<Record<string, any>> = [
	{
		id: GAME_PRIMARY_LUNAR,
		name: "Bánh bao lì xì (chính)",
		templateId: "li-xi",
		status: "active",
		config: {
			templateId: "li-xi",
			rewardSource: "campaign-budget",
			rewardMode: "rewarded",
			styleVariant: "lunar",
			noRewardWeight: 0,
			noRewardLabel: "Chúc bạn may mắn",
			publicCopy: {
				headline: "Bánh bao lì xì",
				subtitle: "Primary",
				startCtaLabel: "Bắt đầu",
				collectCtaLabel: "Nhận thưởng",
				waitingMessage: "",
			},
		},
		playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
	},
	{
		id: GAME_WHEEL,
		name: "Vòng quay tri ân",
		templateId: "lucky-wheel",
		status: "active",
		config: {
			templateId: "lucky-wheel",
			rewardSource: "campaign-inventory",
			rewardMode: "rewarded",
			noRewardWeight: 20,
			noRewardLabel: "Chúc bạn may mắn",
			rewardPoolTag: "",
			publicCopy: {
				headline: "Vòng quay tri ân",
				subtitle: "Fixture wheel",
				startCtaLabel: "Bắt đầu",
				collectCtaLabel: "Nhận quà",
				waitingMessage: "",
			},
		},
		playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
	},
	{
		id: GAME_SCRATCH,
		name: "Thẻ cào tri ân",
		templateId: "scratch-card",
		status: "active",
		config: {
			templateId: "scratch-card",
			rewardSource: "campaign-inventory",
			rewardMode: "rewarded",
			noRewardWeight: 15,
			noRewardLabel: "Chúc bạn may mắn",
			rewardPoolTag: "",
			coverStyle: "gold",
			revealThresholdPercent: 55,
			publicCopy: {
				headline: "Thẻ cào tri ân",
				subtitle: "Fixture scratch",
				startCtaLabel: "Bắt đầu",
				collectCtaLabel: "Nhận quà",
				waitingMessage: "",
			},
		},
		playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
	},
	{
		id: GAME_SLOT,
		name: "Máy quay tri ân",
		templateId: "slot-reveal",
		status: "active",
		config: {
			templateId: "slot-reveal",
			rewardSource: "campaign-inventory",
			rewardMode: "rewarded",
			noRewardWeight: 20,
			noRewardLabel: "Chúc bạn may mắn lần sau",
			rewardPoolTag: "",
			reelTheme: "gold",
			publicCopy: {
				headline: "Máy quay tri ân",
				subtitle: "Fixture slot",
				startCtaLabel: "Quay ngay",
				collectCtaLabel: "Nhận quà",
				waitingMessage: "",
			},
		},
		playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
	},
];

const campaign: Record<string, any> = {
	id: "campaign-op",
	name: "Chiến dịch vận hành",
	slug: "operator-fixture",
	brandName: "Brand Op",
	status: "active",
	description: "Operator fixture",
	heroAsset: null,
	campaignGame: games[0],
};


const shareLinks: Array<Record<string, any>> = [];

const station = {
	hasSetup: true,
	pendingLinkSessions: [
		{
			id: "op-legacy-session-1",
			guestNameDisplay: "Khách mời trạm",
			campaignName: "Chiến dịch vận hành",
			publicPlayPath: "/play/1a2b3c4d5e6f7a8b9c0d1e2f",
			sharePath: "/play/1a2b3c4d5e6f7a8b9c0d1e2f",
			expiresAt: Date.now() + 3_600_000,
		},
	],
};


// Operator state changes share the fixture version store so React (via the
// synthetic useQuery) re-renders.
const emit = () => bumpVersion();

export function operatorQuery(name: string, args: any) {
	if (name === "campaigns:getCampaignGameRouteContext") {
		const game = games.find((g) => g.id === args.campaignGameId);
		if (!game) return null;
		return { campaign, campaignGame: game };
	}
	if (name === "campaigns:getCampaignGamesRouteContext") {
		return { campaign, campaignGames: games.map((game) => ({ ...game })) };
	}
	if (name === "campaigns:getCampaignRouteContext") {
		return { ...campaign };
	}
	if (name === "draw:getStationState") {
		return { hasSetup: station.hasSetup, pendingLinkSessions: station.pendingLinkSessions };
	}
	if (name === "shareLinks:listShareLinks") {
		return { links: structuredClone(shareLinks) };
	}
	throw new Error(`Unsupported synthetic operator query: ${name}`);
}

export function operatorMutation(name: string, args: any) {
	// args.name (the game name) must not clobber the mutation-name key.
	// The mutation name rides in a separate `operation` field so the full
	// argument object (including args.name) is preserved verbatim.
	recordedOperatorCalls.push(
		JSON.parse(JSON.stringify({ operation: name, args: structuredClone(args) })),
	);
	const deferredNames = [
		"campaignGames:updateCampaignGame",
		"campaigns:saveCampaign",
		"shareLinks:createShareLink",
	];
	if (saveMode === "delayed" && deferredNames.includes(name)) {
		const id = ++saveCounter;
		const pending = { id, name, resolve: () => {} };
		const promise = new Promise<void>((resolve) => {
			pending.resolve = resolve;
		});
		pendingSaves.push(pending);
		void promise.then(() => applyMutation(name, args));
		emit();
		return promise.then(() => ({ deferred: true }));
	}
	const result = applyMutation(name, args);
	emit();
	return result;
}

function applyMutation(name: string, args: any): any {
	if (name === "campaignGames:updateCampaignGame") {
		const game = games.find((g) => g.id === args.campaignGameId);
		if (!game) throw new Error("Synthetic game not found");
		if (args.config) game.config = args.config;
		if (args.playLimits) game.playLimits = args.playLimits;
		if (args.status) game.status = args.status;
		return { campaignGameId: game.id, templateId: game.templateId, name: game.name };
	}
	if (name === "campaigns:saveCampaign") {
		Object.assign(campaign, args);
		return { campaignId: campaign.id, campaignGameId: campaign.campaignGame.id };
	}
	if (name === "shareLinks:createShareLink") {
		const game = games.find((g) => g.id === args.campaignGameId);
		if (!game || game.status !== "active") {
			throw new Error("Synthetic game is not active");
		}
		const link = {
			id: `op-link-${++saveCounter}`,
			shareCode: `opsharelink${saveCounter}`.slice(0, 22).padEnd(22, "0"),
			channel: args.channel || "direct",
			label: args.label,
			status: "active",
			campaignGameName: game.name,
			campaignGameId: args.campaignGameId,
			createdAt: Date.now(),
		};
		shareLinks.push(link);
		return link;
	}
	if (name === "shareLinks:revokeShareLink") {
		const link = shareLinks.find((l) => l.id === args.shareLinkId);
		if (link) link.status = "revoked";
		return { revoked: true };
	}
	if (name === "shareLinks:restoreShareLink") {
		const link = shareLinks.find((l) => l.id === args.shareLinkId);
		if (link) link.status = "active";
		return { restored: true };
	}
	throw new Error(`Unsupported synthetic operator mutation: ${name}`);
}

/** Typed programmatic controls for Playwright: timing and data only. */
export type OperatorFixtureApi = {
	setSaveMode(mode: "immediate" | "delayed"): void;
	pendingSaveCount(): number;
	releaseSave(): void;
	releaseNewestSave(): void;
	calls(name: string): Array<Record<string, unknown>>;
	shareLinkIds(): string[];
	closeAllGames(): void;
	games(): Array<{ id: string; name: string; status: string }>;
};

export const operatorFixtureApi: OperatorFixtureApi = {
	setSaveMode(mode: "immediate" | "delayed" = "delayed") {
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
			recordedOperatorCalls.filter((call) => call.operation === name),
		).map((call) => call.args);
	},
	shareLinkIds() {
		return shareLinks.map((link) => link.id);
	},
	closeAllGames() {
		games.forEach((game) => {
			game.status = "archived";
		});
		emit();
	},
	games() {
		return games.map((game) => ({ id: game.id, name: game.name, status: game.status }));
	},
};

if (typeof window !== "undefined") {
	(window as unknown as { __operatorFixture: OperatorFixtureApi }).__operatorFixture =
		operatorFixtureApi;
}
