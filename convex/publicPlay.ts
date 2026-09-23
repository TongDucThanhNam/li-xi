import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { recordGenericPlayMetric, countGameSessionsExact, playSessionsByGame } from "./analytics";
import {
	assertSessionContextPlayable,
	allocateRewardOutcome,
	answerQuizQuestion,
	buildRulesSnapshot,
	genericPlayPolicyForGame,
	getExistingOutcome,
	publicOutcomeView,
	playActionValidator,
	validateActionForTemplate,
	verifySessionCapability,
	type PublicOutcomeView,
} from "./playEngine";
import { resolveShareLink } from "./shareLinks";
import { normalizeCampaignGameConfigForTemplate } from "./campaignGames";
import { getOrCreateParticipant } from "./participants";
import { listActiveRewardInventory } from "./rewardInventory";
import { playSessionCounterEventKey, shareLinkCounterEventKey } from "../lib/analyticsPolicy";
import {
	DEFAULT_MAX_TOTAL_SESSIONS,
	NO_REWARD_SEGMENT_KEY,
	configRewardMode,
	configRewardSource,
	isLuckyWheelGameConfig,
	normalizePlayLimits,
	requireGameTemplateId,
} from "../lib/gameTemplates";
import {
	assertOpenKey,
	assertParticipantToken,
	assertStartKey,
	generateSessionToken,
	normalizeShareCode,
	sanitizeProvidedName,
} from "../lib/playPolicy";
import { getRenderableCampaignAssetUrl, isRenderableCampaignAsset } from "./assets";

/** Bounded readiness probe: does this game have any recorded session? */
async function hasAnyGameSession(
	ctx: QueryCtx,
	campaignGameId: Id<"campaignGames">,
): Promise<boolean> {
	for (const status of ["active", "completed"] as const) {
		const rows = await ctx.db
			.query("playSessions")
			.withIndex("by_campaignGame_status", (q) =>
				q.eq("campaignGameId", campaignGameId).eq("status", status),
			)
			.take(1);
		if (rows.length > 0) {
			return true;
		}
	}
	return false;
}

/**
 * Admission accounting gate. Games at accountingVersion >= 1 count through
 * the exact per-game aggregate; games with historical rows but no completed
 * backfill are hard-gated (safe while initialization is incomplete), and
 * games with zero rows initialize inline on their first admission (mutations
 * only; the read path reports them as sold out so traffic cannot trust an
 * uninitialized counter).
 */
async function resolveAdmission(
	ctx: QueryCtx,
	campaignGame: Doc<"campaignGames">,
	cap: number,
): Promise<{ atCap: boolean; ready: boolean; hasHistory: boolean }> {
	const version = campaignGame.accountingVersion ?? 0;
	if (version >= 1) {
		const counted = await countGameSessionsExact(ctx, campaignGame._id);
		return { atCap: counted >= cap, ready: true, hasHistory: true };
	}
	const hasHistory = await hasAnyGameSession(ctx, campaignGame._id);
	return { atCap: hasHistory, ready: false, hasHistory };
}

async function getHeroAssetUrl(ctx: QueryCtx, campaign: Doc<"campaigns">): Promise<string | null> {
	const heroCandidate = campaign.heroAssetId ? await ctx.db.get(campaign.heroAssetId) : null;
	const heroAsset =
		isRenderableCampaignAsset(heroCandidate, campaign.ownerId) &&
		heroCandidate.campaignId === campaign._id
			? heroCandidate
			: null;
	return heroAsset
		? getRenderableCampaignAssetUrl(ctx, campaign.ownerId, heroAsset.key, campaign._id)
		: null;
}

function entryWheelRewarded(campaignGame: Doc<"campaignGames">): boolean {
	return genericPlayPolicyForGame(campaignGame).rewardMode === "rewarded";
}

export const getPublicShareEntry = query({
	args: {
		shareCode: v.string(),
		participantToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const resolution = await resolveShareLink(ctx, args.shareCode);
		if (resolution.state !== "open") {
			return { state: resolution.state };
		}
		const { link, campaignGame, campaign } = resolution.resolved;
		const templateId = requireGameTemplateId(campaignGame.templateId);
		const config = normalizeCampaignGameConfigForTemplate(campaignGame.templateId, campaignGame.config);
		const selfServe = configRewardSource(config) === "campaign-inventory";
		const rewardMode = configRewardMode(config);
		const playLimits = normalizePlayLimits(campaignGame.playLimits);
		const totalCap = playLimits.maxTotalSessions ?? DEFAULT_MAX_TOTAL_SESSIONS;
		const admission = await resolveAdmission(ctx, campaignGame, totalCap);
		// Uninitialized games with historical rows are hard-gated (sold out);
		// empty uninitialized games are available and self-initialize at the
		// first admission.
		const soldOut = admission.atCap;

		const poolTag = selfServe ? genericPlayPolicyForGame(campaignGame).rewardPoolTag : undefined;
		const inventory =
			selfServe && rewardMode === "rewarded"
				? await listActiveRewardInventory(ctx, campaign.ownerId, campaign._id, poolTag)
				: [];
		const wheel =
			templateId === "lucky-wheel" && isLuckyWheelGameConfig(config)
				? {
					noRewardLabel: config.noRewardLabel,
					// Stable keys (not formatted labels) let the stage land the
					// mechanic on the awarded outcome truthfully. Engagement-mode
					// wheels render only the configured thank-you wedge.
					segments:
						rewardMode === "engagement"
							? []
							: inventory.map((item) => ({ key: item._id, label: item.name })),
					noRewardKey: NO_REWARD_SEGMENT_KEY,
				}
				: undefined;

		let viewer: { canPlay: boolean; reason: "limit" | null } | null = null;
		if (args.participantToken) {
			const token = args.participantToken.trim();
			const participant = await ctx.db
				.query("participants")
				.withIndex("by_token_campaign", (q) =>
					q.eq("token", token).eq("campaignId", campaign._id),
				)
				.first();
			if (participant) {
				const activeSessions = await ctx.db
					.query("playSessions")
					.withIndex("by_participant_game_status", (q) =>
						q
							.eq("participantId", participant._id)
							.eq("campaignGameId", campaignGame._id)
							.eq("status", "active"),
					)
					.collect();
				const completedSessions = await ctx.db
					.query("playSessions")
					.withIndex("by_participant_game_status", (q) =>
						q
							.eq("participantId", participant._id)
							.eq("campaignGameId", campaignGame._id)
							.eq("status", "completed"),
					)
					.collect();
				const canResume = activeSessions.length > 0;
				const withinLimit = completedSessions.length < playLimits.maxSessionsPerParticipant;
				// An admitted session stays playable even when the game is sold
				// out for new admissions.
				viewer = {
					canPlay: canResume || (withinLimit && !soldOut),
					reason: canResume || withinLimit ? null : "limit",
				};
			}
		}

		return {
			state: "open" as const,
			shareCode: link.shareCode,
			channel: link.channel,
			campaign: {
				name: campaign.name,
				brandName: campaign.brandName ?? null,
				description: campaign.description ?? null,
				heroAssetUrl: await getHeroAssetUrl(ctx, campaign),
			},
			game: {
				campaignGameId: campaignGame._id,
				templateId,
				gameName: campaignGame.name ?? null,
				selfServe,
				publicCopy: config.publicCopy,
				wheel,
				playLimits,
			},
			availability: { soldOut },
			viewer,
		};
	},
});

export const recordShareEntryOpen = mutation({
	args: {
		shareCode: v.string(),
		openKey: v.string(),
	},
	handler: async (ctx, args) => {
		const openKey = assertOpenKey(args.openKey);
		const resolution = await resolveShareLink(ctx, args.shareCode);
		if (resolution.state !== "open") {
			return { recorded: false };
		}
		const { link, campaignGame, campaign } = resolution.resolved;

		await recordGenericPlayMetric(ctx, {
			eventKey: shareLinkCounterEventKey(link._id, openKey, "public_play_link_open"),
			ownerId: link.ownerId,
			campaignId: campaign._id,
			campaignGameId: campaignGame._id,
			shareLinkId: link._id,
			channel: "public-link",
			channelLabel: link.channel,
			metric: "public_play_link_open",
		});
		await recordGenericPlayMetric(ctx, {
			eventKey: shareLinkCounterEventKey(link._id, openKey, "game_open"),
			ownerId: link.ownerId,
			campaignId: campaign._id,
			campaignGameId: campaignGame._id,
			shareLinkId: link._id,
			channel: "public-link",
			channelLabel: link.channel,
			metric: "game_open",
		});

		return { recorded: true };
	},
});

export const startPublicPlaySession = mutation({
	args: {
		shareCode: v.string(),
		participantToken: v.optional(v.string()),
		displayName: v.optional(v.string()),
		startKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const resolution = await resolveShareLink(ctx, args.shareCode);
		if (resolution.state === "invalid") {
			throw new Error("Liên kết chơi không hợp lệ");
		}
		if (resolution.state === "revoked") {
			throw new Error("Liên kết chơi đã bị thu hồi");
		}
		if (resolution.state === "closed") {
			throw new Error("Trò chơi hiện chưa mở");
		}
		const { link, campaignGame, campaign } = resolution.resolved;
		const templateId = requireGameTemplateId(campaignGame.templateId);

		const startKey = args.startKey ? assertStartKey(args.startKey) : undefined;

		// 1. Idempotent start recovery: a persisted start key always resolves to
		// the originally created session, so a lost first response can never
		// allocate an orphan duplicate — even when that session filled the
		// game's final capacity slot.
		if (startKey) {
			const startKeyMatches = await ctx.db
				.query("playSessions")
				.withIndex("by_shareLink_startKey", (q) =>
					q.eq("shareLinkId", link._id).eq("startKey", startKey),
				)
				.collect();
			if (startKeyMatches.length > 1) {
				throw new Error("Dữ liệu phiên chơi không nhất quán");
			}
			const startKeySession = startKeyMatches[0];
			if (startKeySession) {
				const participant = await ctx.db.get(startKeySession.participantId);
				return {
					sessionId: startKeySession._id,
					sessionToken: startKeySession.sessionToken,
					participantToken: participant?.token ?? null,
					participantDisplayName: participant?.displayName ?? null,
					resumed: true,
					templateId,
				};
			}
		}

		// 2. Resume the same participant's active session before any new-session
		// capacity gate runs; an admitted session always stays playable.
		const validatedParticipantToken =
			args.participantToken !== undefined
				? assertParticipantToken(args.participantToken)
				: undefined;
		const displayName = sanitizeProvidedName(args.displayName);
		const { participant } = await getOrCreateParticipant(ctx, {
			ownerId: link.ownerId,
			campaignId: campaign._id,
			participantToken: validatedParticipantToken,
			displayName,
		});

		const activeSessions = await ctx.db
			.query("playSessions")
			.withIndex("by_participant_game_status", (q) =>
				q
					.eq("participantId", participant._id)
					.eq("campaignGameId", campaignGame._id)
					.eq("status", "active"),
			)
			.collect();
		if (activeSessions.length > 0) {
			const resumable = activeSessions.sort((left, right) => right.startedAt - left.startedAt)[0];
			if (startKey && !resumable.startKey) {
				await ctx.db.patch(resumable._id, { startKey });
			}
			return {
				sessionId: resumable._id,
				sessionToken: resumable.sessionToken,
				participantToken: participant.token,
				participantDisplayName: participant.displayName ?? null,
				resumed: true,
				templateId,
			};
		}

		// 3. New-session capacity gate: only sessions that would actually be
		// newly admitted consume a slot. Uninitialized games with historical
		// rows require the maintenance backfill first; empty games initialize
		// inline on their first admission.
		const playLimits = normalizePlayLimits(campaignGame.playLimits);
		const totalCap = playLimits.maxTotalSessions ?? DEFAULT_MAX_TOTAL_SESSIONS;
		const admission = await resolveAdmission(ctx, campaignGame, totalCap);
		if (!admission.ready && admission.hasHistory) {
			throw new Error(
				"Trò chơi cần khởi tạo bộ đếm lượt chơi (playMaintenance:backfillGameAccountingPage) trước khi nhận lượt mới",
			);
		}
		if (admission.atCap) {
			throw new Error("Trò chơi đã hết lượt tham gia");
		}

		const completedSessions = await ctx.db
			.query("playSessions")
			.withIndex("by_participant_game_status", (q) =>
				q
					.eq("participantId", participant._id)
					.eq("campaignGameId", campaignGame._id)
					.eq("status", "completed"),
			)
			.collect();
		if (completedSessions.length >= playLimits.maxSessionsPerParticipant) {
			throw new Error("Bạn đã hết lượt tham gia trò chơi này");
		}

		// Self-serve play requires an inventory-sourced game; fail before
		// consuming an admission slot.
		genericPlayPolicyForGame(campaignGame);

		const now = Date.now();
		const sessionToken = generateSessionToken();
		// Freeze the admitted rules for the whole session: gameplay validation,
		// reward strategy, and participant presentation use this snapshot, so
		// owner config edits cannot change an admitted participant's rules.
		// Wheel segments and slot candidate combinations both derive from the
		// pool AT ADMISSION, in display order.
		const admissionTemplateId = templateId;
		const admissionRewarded = entryWheelRewarded(campaignGame);
		const admissionPool =
			(admissionTemplateId === "lucky-wheel" || admissionTemplateId === "slot-reveal") &&
			admissionRewarded
				? await listActiveRewardInventory(
						ctx,
						link.ownerId,
						campaign._id,
						genericPlayPolicyForGame(campaignGame).rewardPoolTag,
					)
				: [];
		const rulesSnapshot = buildRulesSnapshot(
			campaignGame,
			admissionTemplateId === "lucky-wheel"
				? admissionPool.map((item) => ({ key: item._id, label: item.name }))
				: [],
			admissionTemplateId === "slot-reveal"
				? admissionPool.map((item) => item._id)
				: undefined,
		);
		const sessionId = await ctx.db.insert("playSessions", {
			ownerId: link.ownerId,
			campaignId: campaign._id,
			campaignGameId: campaignGame._id,
			participantId: participant._id,
			shareLinkId: link._id,
			channel: "public-link",
			channelLabel: link.channel,
			sessionToken,
			startKey,
			rulesSnapshot,
			status: "active",
			startedAt: now,
			createdAt: now,
			updatedAt: now,
		});
		const storedSession = await ctx.db.get(sessionId);
		if (!storedSession) {
			throw new Error("Không thể tạo phiên chơi");
		}
		await playSessionsByGame.insert(ctx, storedSession);
		if (!admission.ready) {
			// First admission of an empty game: mark accounting exact inline.
			await ctx.db.patch(campaignGame._id, { accountingVersion: 1 });
		}

		await recordGenericPlayMetric(ctx, {
			eventKey: playSessionCounterEventKey(sessionId, "game_start"),
			ownerId: link.ownerId,
			campaignId: campaign._id,
			campaignGameId: campaignGame._id,
			shareLinkId: link._id,
			channel: "public-link",
			channelLabel: link.channel,
			metric: "game_start",
		});

		return {
			sessionId,
			sessionToken,
			participantToken: participant.token,
			participantDisplayName: participant.displayName ?? null,
			resumed: false,
			templateId,
		};
	},
});

export const playSessionAction = mutation({
	args: {
		sessionId: v.string(),
		sessionToken: v.string(),
		action: playActionValidator,
	},
	handler: async (ctx, args) => {
		const session = await verifySessionCapability(ctx, args.sessionId, args.sessionToken);

		if (session.status === "completed") {
			const existing = await getExistingOutcome(ctx, session._id);
			if (!existing) {
				throw new Error("Phiên chơi không hợp lệ");
			}
			return { outcome: publicOutcomeView(existing) };
		}
		if (session.status !== "active") {
			throw new Error("Phiên chơi không còn hiệu lực");
		}

		await assertSessionContextPlayable(ctx, session);
		// Gameplay rules come from the frozen session snapshot, not from the
		// mutable campaign-game row.
		validateActionForTemplate(
			session.rulesSnapshot?.templateId ??
				(await sessionGameTemplateIdFallback(ctx, session)),
			args.action,
		);

		// Multi-step quiz answers progress the session; only the final answer
		// grades and (maybe) allocates. Intermediate answers return a typed
		// step state and create no outcome/completion.
		if (args.action.type === "quiz-answer") {
			const result = await answerQuizQuestion(ctx, session, args.action);
			if (result.status === "in-progress") {
				return {
					quizStep: {
						totalQuestions: result.totalQuestions,
						answeredCount: result.answeredCount,
					},
				};
			}
			return {
				outcome: publicOutcomeView(result.outcome),
				quizResult: { score: result.score, passed: result.passed },
			};
		}

		const { outcome } = await allocateRewardOutcome(ctx, session);
		return { outcome: publicOutcomeView(outcome) };
	},
});

async function sessionGameTemplateIdFallback(ctx: QueryCtx, session: Doc<"playSessions">) {
	const campaignGame = await ctx.db.get(session.campaignGameId);
	if (!campaignGame) {
		throw new Error("Trò chơi không hợp lệ");
	}
	return campaignGame.templateId;
}

/** Capability-authorized recovery of a completed session's outcome. */
export const getPublicSessionOutcome = query({
	args: {
		sessionId: v.string(),
		sessionToken: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await verifySessionCapability(ctx, args.sessionId, args.sessionToken);
		if (session.status !== "completed") {
			return null;
		}
		const outcome = await getExistingOutcome(ctx, session._id);
		if (!outcome) {
			return null;
		}
		return { outcome: publicOutcomeView(outcome) };
	},
});

const MAX_SAVED_ENTRIES = 20;

/**
 * Participant-facing saved-results recovery. Each entry carries its own
 * unguessable capability; entries are scoped to the share link and never
 * expose other participants. Claimed entries include the private code (the
 * same reveal rule as claimPublicReward); unclaimed ones return a claimable
 * outcome so the UI can reopen them without touching the active session,
 * starting a play, or allocating stock.
 */
export const getSavedRewardSummaries = query({
	args: {
		shareCode: v.string(),
		entries: v.array(
			v.object({
				sessionId: v.string(),
				sessionToken: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const shareCode = normalizeShareCode(args.shareCode);
		if (!shareCode) {
			return { entries: [] };
		}
		const link = await ctx.db
			.query("publicPlayLinks")
			.withIndex("by_shareCode", (q) => q.eq("shareCode", shareCode))
			.first();
		if (!link) {
			return { entries: [] };
		}

		const bounded = args.entries.slice(0, MAX_SAVED_ENTRIES);
		const summaries = await Promise.all(
			bounded.map(async ({ sessionId, sessionToken }) => {
				const normalizedSessionId = ctx.db.normalizeId("playSessions", sessionId);
				if (!normalizedSessionId) {
					return { sessionId, status: "invalid" as const };
				}
				const session = await ctx.db.get(normalizedSessionId);
				if (
					!session ||
					session.shareLinkId !== link._id ||
					session.sessionToken !== sessionToken
				) {
					return { sessionId, status: "invalid" as const };
				}
				const outcome = await ctx.db
					.query("rewardOutcomes")
					.withIndex("by_playSession", (q) => q.eq("playSessionId", session._id))
					.unique();
				if (!outcome) {
					return { sessionId, status: "active" as const };
				}
				const claimed = outcome.status === "claimed";
				let secretCode: string | null = null;
				if (claimed && outcome.rewardType === "voucher" && outcome.rewardItemId) {
					const item = await ctx.db.get(outcome.rewardItemId);
					secretCode = item?.secretCode?.trim() || null;
				}
				return {
					sessionId,
					status: "completed" as const,
					claimed,
					outcome: {
						kind: outcome.rewardType === "none" ? ("no-reward" as const) : ("reward" as const),
						rewardType: outcome.rewardType,
						label: outcome.label,
						amount: outcome.amount ?? null,
						canClaim: outcome.rewardType !== "none" && !claimed,
						// Secret is only attached to already-claimed vouchers.
						secretCode:
							claimed && outcome.rewardType === "voucher"
								? outcome.awardSecretCode?.trim() || secretCode
								: null,
					},
				};
			}),
		);
		return { entries: summaries };
	},
});

/**
 * Capability-authorized frozen-rules view for an admitted session:
 * participant presentation (copy, wheel segments) uses the snapshot, so
 * owner edits cannot rewrite an admitted participant's experience.
 */
export const getPublicSessionSnapshot = query({
	args: {
		sessionId: v.string(),
		sessionToken: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await verifySessionCapability(ctx, args.sessionId, args.sessionToken);
		const snapshot = session.rulesSnapshot;
		if (!snapshot) {
			return null;
		}
		return {
			rules: {
				templateId: snapshot.templateId,
				publicCopy: snapshot.publicCopy,
				// Wheel presentation projects only for wheel sessions; scratch
				// sessions project their own decorative cover context.
				...(snapshot.templateId === "lucky-wheel"
					? {
							wheel: {
								noRewardLabel: snapshot.noRewardLabel,
								segments: snapshot.wheelSegments ?? [],
								noRewardKey: NO_REWARD_SEGMENT_KEY,
							},
						}
					: {}),
				...(snapshot.templateId === "scratch-card" && snapshot.scratchCard
					? { scratchCard: snapshot.scratchCard }
					: {}),
				...(snapshot.templateId === "slot-reveal" && snapshot.slotReels
					? {
							slotReels: {
								reelTheme: snapshot.slotReels.reelTheme,
								winningCombinations: snapshot.slotReels.winningCombinations,
								missCombination: snapshot.slotReels.missCombination,
							},
						}
					: {}),
				// Quiz PUBLIC half only: prompts/choices/passCount. The private
				// answer key and explanations never leave the server here.
				...(snapshot.templateId === "quiz" && snapshot.quiz
					? {
							quiz: {
								passCount: snapshot.quiz.passCount,
								questions: snapshot.quiz.questions.map((question) => ({
									prompt: question.prompt,
									choices: question.choices,
								})),
							},
						}
					: {}),
			},
		};
	},
});

/**
 * Capability-authorized quiz progression state. Before completion it
 * projects ONLY safe progress (current index/count — never the answer key);
 * AFTER completion it adds the authoritative score/pass and the permitted
 * answer review (correct choice + explanation). Binds to the exact session
 * capability; a wrong token fails closed.
 */
export const getPublicQuizState = query({
	args: {
		sessionId: v.string(),
		sessionToken: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await verifySessionCapability(ctx, args.sessionId, args.sessionToken);
		const snapshot = session.rulesSnapshot;
		if (!snapshot || snapshot.templateId !== "quiz" || !snapshot.quiz) {
			return null;
		}
		const questions = snapshot.quiz.questions;
		const total = questions.length;
		const answers = session.quizProgress?.answers ?? [];
		const completed = session.status === "completed" && Boolean(session.outcomeId);
		if (!completed) {
			const currentIndex = Math.min(answers.length, total);
			const currentQuestion =
				currentIndex < total
					? {
							index: currentIndex,
							prompt: questions[currentIndex].prompt,
							choices: questions[currentIndex].choices,
						}
					: null;
			return {
				totalQuestions: total,
				answeredCount: answers.length,
				currentIndex,
				completed: false,
				currentQuestion,
			};
		}
		// Completed: authoritative score/pass plus the permitted review.
		let score = 0;
		const review = answers.map((answer) => {
			const question = questions[answer.questionIndex];
			const correctIndex = question?.correctIndex ?? -1;
			const correct = correctIndex === answer.choiceIndex;
			if (correct) {
				score += 1;
			}
			return {
				questionIndex: answer.questionIndex,
				choiceIndex: answer.choiceIndex,
				correctIndex,
				correct,
				explanation: question?.explanation ?? null,
			};
		});
		return {
			totalQuestions: total,
			answeredCount: answers.length,
			currentIndex: total,
			completed: true,
			score,
			passed: score >= snapshot.quiz.passCount,
			review,
		};
	},
});

export type PublicClaimDetailView = {
	label: string;
	rewardType: "cash" | "voucher" | "physical" | "points" | "none";
	amount: number | null;
	secretCode: string | null;
	instructions: string | null;
};

/**
 * Claim detail comes from the immutable award snapshot on the outcome, so a
 * repeated capability-authorized claim recovers the original code even after
 * the owner edited or replaced the inventory.
 */
async function claimDetailView(
	ctx: QueryCtx,
	outcome: Doc<"rewardOutcomes">,
): Promise<PublicClaimDetailView> {
	let secretCode: string | null = null;
	if (outcome.rewardType === "voucher" && outcome.rewardItemId) {
		const item = await ctx.db.get(outcome.rewardItemId);
		secretCode = item?.secretCode?.trim() || null;
	}
	return {
		label: outcome.label,
		rewardType: outcome.rewardType,
		amount: outcome.amount ?? null,
		secretCode: outcome.awardSecretCode?.trim() || secretCode,
		instructions:
			outcome.rewardType === "voucher"
				? "Lưu lại mã này để đổi thưởng với nhân viên chiến dịch."
				: null,
	};
}

/** Capability-authorized recovery of an already-claimed reward's details. */
export const getPublicClaimDetail = query({
	args: {
		sessionId: v.string(),
		sessionToken: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await verifySessionCapability(ctx, args.sessionId, args.sessionToken);
		if (session.status !== "completed") {
			return null;
		}
		const outcome = await getExistingOutcome(ctx, session._id);
		if (!outcome || outcome.status !== "claimed") {
			return null;
		}
		return { claim: await claimDetailView(ctx, outcome) };
	},
});

export const claimPublicReward = mutation({
	args: {
		sessionId: v.string(),
		sessionToken: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await verifySessionCapability(ctx, args.sessionId, args.sessionToken);
		if (session.status !== "completed") {
			throw new Error("Chỉ có thể nhận thưởng sau khi hoàn thành lượt chơi");
		}
		const outcome = await getExistingOutcome(ctx, session._id);
		if (!outcome) {
			throw new Error("Phiên chơi chưa có kết quả");
		}

		const existingClaim = await ctx.db
			.query("rewardClaims")
			.withIndex("by_outcome", (q) => q.eq("outcomeId", outcome._id))
			.unique();
		if (existingClaim) {
			return {
				claim: await claimDetailView(ctx, outcome),
				alreadyClaimed: true,
			};
		}
		if (outcome.rewardType === "none") {
			throw new Error("Lượt chơi này không có phần thưởng để nhận");
		}
		if (outcome.status === "claimed") {
			throw new Error("Phần thưởng này đã được nhận");
		}

		const now = Date.now();
		const claimId = await ctx.db.insert("rewardClaims", {
			ownerId: session.ownerId,
			campaignId: session.campaignId,
			campaignGameId: session.campaignGameId,
			outcomeId: outcome._id,
			playSessionId: session._id,
			participantId: session.participantId,
			channel: session.channel,
			channelLabel: session.channelLabel,
			fulfilmentState: "pending",
			claimedAt: now,
		});
		await ctx.db.patch(outcome._id, {
			status: "claimed",
			claimedAt: now,
		});

		await recordGenericPlayMetric(ctx, {
			eventKey: `reward-claim:${claimId}:reward_claim`,
			ownerId: session.ownerId,
			campaignId: session.campaignId,
			campaignGameId: session.campaignGameId,
			shareLinkId: session.shareLinkId,
			channel: session.channel,
			channelLabel: session.channelLabel,
			metric: "reward_claim",
		});

		return {
			claim: await claimDetailView(ctx, outcome),
			alreadyClaimed: false,
		};
	},
});

export type { PublicOutcomeView };
