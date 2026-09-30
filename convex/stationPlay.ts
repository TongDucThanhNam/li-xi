import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireResolvedOwner } from "./authorization";
import { recordGenericPlayMetric } from "./analytics";
import {
	genericPlayPolicyForGame,
	publicOutcomeView,
} from "./playEngine";
import {
	admitGenericPlaySession,
	claimDetailView,
	getHeroAssetUrl,
	resolveAdmission,
} from "./publicPlay";
import { getRenderableCampaignGameAssets } from "./assets";
import { getOrCreateParticipant } from "./participants";
import { listActiveRewardInventory } from "./rewardInventory";
import { stationOpenCounterEventKey } from "../lib/analyticsPolicy";
import { validatePin } from "../lib/lixiPolicy";
import { verifyPinHash } from "./security";
import { normalizeCampaignGameConfigForTemplate } from "./campaignGames";
import {
	DEFAULT_MAX_TOTAL_SESSIONS,
	NO_REWARD_SEGMENT_KEY,
	configRewardSource,
	normalizePlayLimits,
	requireGameTemplateId,
	supportsSelfServeStation,
} from "../lib/gameTemplates";
import { assertOpenKey, sanitizeProvidedName } from "../lib/playPolicy";
import { normalizeScheduleWindow, resolveGameScheduleState } from "../lib/schedulePolicy";

/**
 * Stable attribution label for station-admitted generic sessions. Station
 * sessions carry `channel: "station"` end to end (session → metrics →
 * claims); the label only adds a human-readable Vietnamese channel name.
 */
export const STATION_CHANNEL_LABEL = "Trạm chơi";

export type StationInventoryItem = {
	id: Id<"rewardInventory">;
	name: string;
	rewardType: "cash" | "voucher" | "physical" | "points" | "none";
	quantityTotal: number;
	quantityRemaining: number;
};

/**
 * Station capability gate: the template catalog must declare the
 * self-serve-station mode AND the game's normalized reward source must be
 * the campaign inventory. Quiz, slot, and every campaign-budget game fail
 * closed here — li xi keeps its legacy draw station flow, and other
 * templates stay public-link-only until they ship a station mode. (For the
 * current catalog the source half is defense in depth: the config
 * validators and builders pin station-capable templates to
 * campaign-inventory, but this gate never trusts that invariant.)
 */
export function assertStationPlayableGame(campaignGame: Doc<"campaignGames">): void {
	const templateId = requireGameTemplateId(campaignGame.templateId);
	if (!supportsSelfServeStation(templateId)) {
		throw new Error("Mẫu trò chơi này chưa mở chế độ trạm tự phục vụ");
	}
	const config = normalizeCampaignGameConfigForTemplate(templateId, campaignGame.config);
	if (configRewardSource(config) !== "campaign-inventory") {
		throw new Error("Trò chơi này không hỗ trợ chơi tự phục vụ qua kho phần thưởng");
	}
}

/**
 * Owner → campaign → campaignGame authorization chain shared by the three
 * station functions. Every caller derives the owner from the Convex Auth
 * session; client-supplied owner ids are never trusted, and missing or
 * foreign rows fail closed with the same message (no existence leak).
 */
async function requireOwnedActiveCampaignGame(
	ctx: QueryCtx | MutationCtx,
	campaignGameId: string,
) {
	const { ownerId } = await requireResolvedOwner(ctx, undefined, {
		notFoundMessage: "Không tìm thấy host",
		forbiddenMessage: "Bạn không có quyền truy cập trạm chơi này",
	});
	const normalizedId = ctx.db.normalizeId("campaignGames", campaignGameId);
	if (!normalizedId) {
		throw new Error("Không tìm thấy trò chơi");
	}
	const campaignGame = await ctx.db.get(normalizedId);
	if (!campaignGame || campaignGame.ownerId !== ownerId) {
		throw new Error("Không tìm thấy trò chơi");
	}
	const campaign = await ctx.db.get(campaignGame.campaignId);
	if (!campaign || campaign.ownerId !== ownerId) {
		throw new Error("Không tìm thấy trò chơi");
	}
	if (campaign.status !== "active" || campaignGame.status !== "active") {
		throw new Error("Chiến dịch hoặc trò chơi hiện không còn hoạt động");
	}
	return { ownerId, campaign, campaignGame };
}

/**
 * The single active station session for one campaign game, if any. The
 * start mutation enforces at most one, so the first newest row wins.
 */
async function activeStationSession(
	ctx: QueryCtx | MutationCtx,
	campaignGameId: Id<"campaignGames">,
): Promise<Doc<"playSessions"> | null> {
	const activeRows = await ctx.db
		.query("playSessions")
		.withIndex("by_campaignGame_status", (q) =>
			q.eq("campaignGameId", campaignGameId).eq("status", "active"),
		)
		.collect();
	return (
		activeRows
			.filter((row) => row.channel === "station")
			.sort((left, right) => right.startedAt - left.startedAt)[0] ?? null
	);
}

/**
 * Scan bound for recovery: newest completed sessions first, stopping at the
 * first unhandled station session. The station waiting screen blocks new
 * starts while a result pends, so an unhandled station session always sits
 * near the top; the bound only caps the degenerate case of a game flooded
 * with interleaved public-link completions.
 */
const RECOVERABLE_SCAN_LIMIT = 512;

/**
 * The most recent completed station session whose result the host has not
 * handled yet (no collect and no dismiss). Engagement and no-reward
 * completions have nothing to collect and are handled at the caller.
 */
async function recoverableStationSession(
	ctx: QueryCtx | MutationCtx,
	campaignGameId: Id<"campaignGames">,
): Promise<Doc<"playSessions"> | null> {
	const completedRows = await ctx.db
		.query("playSessions")
		.withIndex("by_campaignGame_status", (q) =>
			q.eq("campaignGameId", campaignGameId).eq("status", "completed"),
		)
		.order("desc")
		.take(RECOVERABLE_SCAN_LIMIT);
	return (
		completedRows
			.filter((row) => row.channel === "station" && !row.resultAcknowledgedAt)
			.sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))[0] ?? null
	);
}

/**
 * Snapshot-derived presentation context for the station play stage,
 * projected exactly like the public session snapshot (frozen at admission;
 * owner config edits never rewrite an admitted play).
 */
function stationPlayContext(session: Doc<"playSessions">): Record<string, unknown> | null {
	const snapshot = session.rulesSnapshot;
	if (!snapshot) {
		return null;
	}
	if (snapshot.templateId === "lucky-wheel") {
		return {
			noRewardLabel: snapshot.noRewardLabel,
			segments: snapshot.wheelSegments ?? [],
			noRewardKey: NO_REWARD_SEGMENT_KEY,
		};
	}
	if (snapshot.templateId === "scratch-card" && snapshot.scratchCard) {
		return {
			coverStyle: snapshot.scratchCard.coverStyle,
			revealThresholdPercent: snapshot.scratchCard.revealThresholdPercent,
		};
	}
	return null;
}

/**
 * Owner-authorized station state for the reusable self-serve templates.
 * Returns the campaign/template context, the waiting copy, an inventory
 * summary, THE active station session (if any) with its capability and
 * snapshot-derived play context, and the recoverable completed session (a
 * rewarded result the host has not collected or dismissed) with the same
 * owner-only capability rule — the capability is safe to return only
 * because this query requires the owner session; the station page runs in
 * the host's authenticated browser, and the capability never touches
 * localStorage or sessionStorage on the shared kiosk.
 */
export const getStationPlayState = query({
	args: {
		campaignGameId: v.string(),
	},
	handler: async (ctx, args) => {
		const { ownerId, campaign, campaignGame } = await requireOwnedActiveCampaignGame(
			ctx,
			args.campaignGameId,
		);
		assertStationPlayableGame(campaignGame);
		// Inventory-sourced policy (pool tag + live copy); fails closed the
		// same way the admission core will.
		const policy = genericPlayPolicyForGame(campaignGame);
		const templateId = requireGameTemplateId(campaignGame.templateId);
		const playLimits = normalizePlayLimits(campaignGame.playLimits);
		const totalCap = playLimits.maxTotalSessions ?? DEFAULT_MAX_TOTAL_SESSIONS;
		// Same availability read as the public entry: uninitialized games with
		// historical rows report sold out until the accounting backfill runs.
		const admission = await resolveAdmission(ctx, campaignGame, totalCap);
		const inventory = await listActiveRewardInventory(
			ctx,
			ownerId,
			campaign._id,
			policy.rewardPoolTag,
		);
		const session = await activeStationSession(ctx, campaignGame._id);
		const sessionParticipant = session ? await ctx.db.get(session.participantId) : null;
		const snapshot = session?.rulesSnapshot ?? null;
		// Recovery only applies while no station session is active: a pending
		// result must never compete with a live play. Rewarded outcomes that
		// were never collected (or claimed but not acknowledged) resurface;
		// engagement and no-reward completions have nothing to recover.
		const recoverableSession = session ? null : await recoverableStationSession(ctx, campaignGame._id);
		const recoverableParticipant = recoverableSession
			? await ctx.db.get(recoverableSession.participantId)
			: null;
		const recoverableOutcome =
			recoverableSession?.outcomeId != null
				? await ctx.db.get(recoverableSession.outcomeId)
				: null;
		const recoverable =
			recoverableSession &&
			recoverableOutcome &&
			recoverableOutcome.rewardType !== "none"
				? {
						sessionId: recoverableSession._id,
						sessionToken: recoverableSession.sessionToken,
						participantDisplayName: recoverableParticipant?.displayName ?? null,
						completedAt: recoverableSession.completedAt ?? recoverableSession.updatedAt,
						outcome: publicOutcomeView(recoverableOutcome),
						// A claimed-but-unacknowledged code re-reveals through the
						// same immutable claim view; unclaimed outcomes stay hidden
						// behind the guest's own idempotent claim action.
							claim:
								recoverableOutcome.status === "claimed"
									? await claimDetailView(
											ctx,
											recoverableOutcome,
											recoverableSession.rulesSnapshot?.publicCopy ?? null,
										)
									: null,
						copy: recoverableSession.rulesSnapshot?.publicCopy ?? policy.publicCopy,
						playContext: stationPlayContext(recoverableSession),
					}
				: null;

		return {
			state: "open" as const,
			campaignGameId: campaignGame._id,
			templateId,
			gameName: campaignGame.name ?? null,
			campaign: {
				name: campaign.name,
				brandName: campaign.brandName ?? null,
				description: campaign.description ?? null,
				heroAssetUrl: await getHeroAssetUrl(ctx, campaign),
			},
			// Live per-game template slot URLs (usage → URL) for the station's
			// waiting hero and play stage; presentation only, never snapshotted.
			assetUrls: Object.fromEntries(
				(
					await getRenderableCampaignGameAssets(
						ctx,
						ownerId,
						campaign._id,
						campaignGame._id,
					)
				).map((asset) => [asset.usage, asset.url]),
			),
			copy: policy.publicCopy,
			// Live play-window status for the waiting screen: the station shows
			// "Chưa đến giờ"/"Đã kết thúc" instead of Start; enforcement stays
			// server-side in the shared admission core.
			schedule: {
				...normalizeScheduleWindow(campaignGame),
				state: resolveGameScheduleState(campaignGame, Date.now()),
			},
			availability: { soldOut: admission.atCap },
			inventory: inventory.map(
				(item): StationInventoryItem => ({
					id: item._id,
					name: item.name,
					rewardType: item.rewardType,
					quantityTotal: item.quantityTotal,
					quantityRemaining: item.quantityRemaining,
				}),
			),
			playSession: session
				? {
						sessionId: session._id,
						sessionToken: session.sessionToken,
						participantDisplayName: sessionParticipant?.displayName ?? null,
						// Frozen admitted copy wins over live config edits, exactly
						// like the public session snapshot projection.
						copy: snapshot?.publicCopy ?? policy.publicCopy,
						playContext: stationPlayContext(session),
					}
				: null,
			recoverable,
		};
	},
});

/**
 * Station self-admission under the owner session. The participant taps
 * Start on the station screen; the host's authenticated page calls this
 * mutation, which admits a generic play session with `channel: "station"`
 * through the SAME admission core as the public path (capacity gate,
 * snapshot freeze, aggregate insert, game_start). No Host PIN: exactly like
 * li xi, the PIN guards station exit, not participant starts. Each play
 * creates a fresh participant (display name optional, display-only, no
 * device token), so per-participant device limits never block a kiosk.
 */
export const startStationPlaySession = mutation({
	args: {
		campaignGameId: v.string(),
		displayName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { ownerId, campaign, campaignGame } = await requireOwnedActiveCampaignGame(
			ctx,
			args.campaignGameId,
		);
		assertStationPlayableGame(campaignGame);
		const templateId = requireGameTemplateId(campaignGame.templateId);

		// Single active station session per game: a retry, a double tap, or a
		// refresh-mid-play returns the existing session idempotently instead
		// of admitting a second one.
		const existing = await activeStationSession(ctx, campaignGame._id);
		if (existing) {
			const participant = await ctx.db.get(existing.participantId);
			return {
				sessionId: existing._id,
				sessionToken: existing.sessionToken,
				participantDisplayName: participant?.displayName ?? null,
				resumed: true as const,
				templateId,
			};
		}

		const displayName = sanitizeProvidedName(args.displayName);
		const { participant } = await getOrCreateParticipant(ctx, {
			ownerId,
			campaignId: campaign._id,
			displayName,
		});
		const admission = await admitGenericPlaySession(ctx, {
			ownerId,
			campaign,
			campaignGame,
			participantId: participant._id,
			channel: "station",
			channelLabel: STATION_CHANNEL_LABEL,
		});
		return {
			sessionId: admission.sessionId,
			sessionToken: admission.sessionToken,
			participantDisplayName: participant.displayName ?? null,
			resumed: false as const,
			templateId,
		};
	},
});

/**
 * One station `game_open` per waiting-screen mount. The client generates a
 * stable open key per mount and retries the same key, so a failed request
 * (or a replay) can never split or double count; starts/completions/claims
 * flow through the shared per-transition event keys instead.
 */
export const recordStationPlayOpen = mutation({
	args: {
		campaignGameId: v.string(),
		openKey: v.string(),
	},
	handler: async (ctx, args) => {
		const { ownerId, campaign, campaignGame } = await requireOwnedActiveCampaignGame(
			ctx,
			args.campaignGameId,
		);
		assertStationPlayableGame(campaignGame);
		const openKey = assertOpenKey(args.openKey);

		await recordGenericPlayMetric(ctx, {
			eventKey: stationOpenCounterEventKey(campaignGame._id, openKey, "game_open"),
			ownerId,
			campaignId: campaign._id,
			campaignGameId: campaignGame._id,
			channel: "station",
			channelLabel: STATION_CHANNEL_LABEL,
			metric: "game_open",
		});
		return { recorded: true };
	},
});

/**
 * Session resolution shared by the acknowledge and dismiss mutations: the
 * id must resolve to a station-channel session of the already-authorized
 * game; missing, malformed, or foreign rows share the same fail-closed
 * message (no existence leak).
 */
async function requireOwnedStationSession(
	ctx: QueryCtx | MutationCtx,
	campaignGameId: Id<"campaignGames">,
	sessionId: string,
): Promise<Doc<"playSessions">> {
	const normalizedSessionId = ctx.db.normalizeId("playSessions", sessionId);
	if (!normalizedSessionId) {
		throw new Error("Không tìm thấy trò chơi");
	}
	const session = await ctx.db.get(normalizedSessionId);
	if (!session || session.campaignGameId !== campaignGameId || session.channel !== "station") {
		throw new Error("Không tìm thấy trò chơi");
	}
	return session;
}

/**
 * Collect acknowledgment ("Hoàn tất"): the host's station page marks a
 * completed station session's result as handled so it never resurfaces as
 * recoverable. No Host PIN: collecting is the normal end of a guest's play,
 * exactly like the station exit's PIN only guards leaving the station.
 * Idempotent — a session that is already handled stays handled.
 */
export const acknowledgeStationPlayResult = mutation({
	args: {
		campaignGameId: v.string(),
		sessionId: v.string(),
	},
	handler: async (ctx, args) => {
		const { campaignGame } = await requireOwnedActiveCampaignGame(ctx, args.campaignGameId);
		const session = await requireOwnedStationSession(ctx, campaignGame._id, args.sessionId);
		if (session.status !== "completed") {
			throw new Error("Chỉ có thể hoàn tất kết quả của lượt chơi đã hoàn thành");
		}
		if (!session.resultAcknowledgedAt) {
			await ctx.db.patch(session._id, {
				resultAcknowledgedAt: Date.now(),
				updatedAt: Date.now(),
			});
		}
		return { acknowledged: true };
	},
});

/**
 * Host dismissal of a pending station result: abandons a guest's uncollected
 * (or unacknowledged claimed) reward, so it requires the SAME Host PIN
 * verification as the station exit — verified server-side with the same
 * hash check as auth.verifyHostPin. The outcome row, claim row, and burned
 * stock stay untouched (no destructive changes); the session only stops
 * resurfacing on the waiting screen.
 */
export const dismissStationPlayResult = mutation({
	args: {
		campaignGameId: v.string(),
		sessionId: v.string(),
		pin: v.string(),
	},
	handler: async (ctx, args) => {
		const { campaignGame } = await requireOwnedActiveCampaignGame(ctx, args.campaignGameId);
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Cần đăng nhập để xác minh PIN host");
		}
		const user = await ctx.db.get(userId);
		if (!user || typeof user.pinHash !== "string" || typeof user.pinSalt !== "string") {
			throw new Error("Host chưa thiết lập PIN");
		}
		const pin = validatePin(args.pin);
		if (!(await verifyPinHash(pin, user.pinSalt, user.pinHash))) {
			throw new Error("PIN host không đúng");
		}
		const session = await requireOwnedStationSession(ctx, campaignGame._id, args.sessionId);
		if (session.status !== "completed") {
			throw new Error("Chỉ có thể bỏ kết quả của lượt chơi đã hoàn thành");
		}
		if (!session.resultAcknowledgedAt) {
			await ctx.db.patch(session._id, {
				resultAcknowledgedAt: Date.now(),
				updatedAt: Date.now(),
			});
		}
		return { dismissed: true };
	},
});
