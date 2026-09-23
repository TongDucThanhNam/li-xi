import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	recordGenericPlayMetric,
	rewardedOutcomesByOwner,
	playSessionsByGame,
} from "./analytics";
import { requireResolvedOwner } from "./authorization";
import { normalizeCampaignGameConfigForTemplate } from "./campaignGames";
import { resolveShareLink } from "./shareLinks";
import { listActiveRewardInventory } from "./rewardInventory";
import { assertCanRedeem, ensureRewardAccountingReady } from "./entitlements";
import {
	playSessionCounterEventKey,
	rewardCounterEventKey,
} from "../lib/analyticsPolicy";
import {
	type GameTemplateId,
	buildSlotWinningCombinations,
	configNoRewardLabel,
	configNoRewardWeight,
	configRewardMode,
	configRewardPoolTag,
	configRewardSource,
	configScratchPresentation,
	configSlotPresentation,
	configTemplateId,
	isQuizGameConfig,
	requireGameTemplateId,
	SLOT_MISS_COMBINATION,
	slotRevealDefaultGameConfig,
} from "../lib/gameTemplates";
import { ENVELOPE_COUNT } from "../lib/lixiPolicy";
import {
	assertNonEmptyToken,
	NO_REWARD_OPTION_KEY,
	rewardOutcomeLabel,
	secureRandomInt,
	selectWeightedOption,
} from "../lib/playPolicy";

export type PublicOutcomeView = {
	kind: "reward" | "no-reward";
	rewardType: "cash" | "voucher" | "physical" | "points" | "none";
	label: string;
	amount: number | null;
	canClaim: boolean;
	/** Stable public-safe key used by stages to land the mechanic truthfully. */
	segmentKey: string | null;
};

export function publicOutcomeView(outcome: Doc<"rewardOutcomes">): PublicOutcomeView {
	const isReward = outcome.rewardType !== "none";
	return {
		kind: isReward ? "reward" : "no-reward",
		rewardType: outcome.rewardType,
		label: outcome.label,
		amount: outcome.amount ?? null,
		canClaim: isReward && outcome.status === "granted",
		segmentKey: outcome.rewardItemId ?? null,
	};
}

/** Fails closed unless the caller presents the unguessable session capability. */
export async function verifySessionCapability(
	ctx: MutationCtx | QueryCtx,
	sessionId: string,
	sessionToken: string,
): Promise<Doc<"playSessions">> {
	const normalizedSessionId = ctx.db.normalizeId("playSessions", sessionId);
	if (!normalizedSessionId) {
		throw new Error("Phiên chơi không hợp lệ");
	}
	const verifiedToken = assertNonEmptyToken(sessionToken, "Session token");
	const session = await ctx.db.get(normalizedSessionId);
	if (!session || session.sessionToken !== verifiedToken) {
		throw new Error("Phiên chơi không hợp lệ");
	}
	return session;
}

/** Lifecycle guard: campaign, game, and (when present) link must all be live. */
export async function assertSessionContextPlayable(
	ctx: MutationCtx,
	session: Doc<"playSessions">,
): Promise<void> {
	const campaign = await ctx.db.get(session.campaignId);
	if (!campaign || campaign.ownerId !== session.ownerId || campaign.status !== "active") {
		throw new Error("Chiến dịch không còn hoạt động");
	}
	const campaignGame = await ctx.db.get(session.campaignGameId);
	if (
		!campaignGame ||
		campaignGame.ownerId !== session.ownerId ||
		campaignGame.campaignId !== campaign._id ||
		campaignGame.status !== "active"
	) {
		throw new Error("Trò chơi không còn hoạt động");
	}
	if (session.shareLinkId) {
		const link = await ctx.db.get(session.shareLinkId);
		if (!link || link.status !== "active") {
			throw new Error("Liên kết chơi đã bị thu hồi");
		}
	}
}

export async function getExistingOutcome(
	ctx: MutationCtx | QueryCtx,
	playSessionId: Id<"playSessions">,
): Promise<Doc<"rewardOutcomes"> | null> {
	const outcome = await ctx.db
		.query("rewardOutcomes")
		.withIndex("by_playSession", (q) => q.eq("playSessionId", playSessionId))
		.unique();
	return outcome ?? null;
}

/** Frozen game rules captured at admission and used for the whole session. */
export type GameRulesSnapshot = NonNullable<Doc<"playSessions">["rulesSnapshot"]>;

export function buildRulesSnapshot(
	campaignGame: Doc<"campaignGames">,
	wheelSegments?: Array<{ key: string; label: string }>,
	slotCandidateIds?: readonly string[],
): GameRulesSnapshot {
	const config = normalizeCampaignGameConfigForTemplate(campaignGame.templateId, campaignGame.config);
	return {
		templateId: requireGameTemplateId(campaignGame.templateId),
		rewardSource: configRewardSource(config),
		rewardMode: configRewardMode(config),
		noRewardWeight: configNoRewardWeight(config),
		noRewardLabel: configNoRewardLabel(config),
		rewardPoolTag: configRewardPoolTag(config),
		publicCopy: config.publicCopy,
		wheelSegments,
		// Frozen decorative scratch presentation; edits after admission never
		// rewrite an admitted card's foil or threshold hint.
		scratchCard:
			configTemplateId(config) === "scratch-card"
				? configScratchPresentation(config)
				: undefined,
		// Frozen slot presentation + documented combinations: the candidate set
		// and mapping freeze at admission so live pool edits cannot change an
		// in-flight play or add an ambiguous reward identity.
		slotReels:
			configTemplateId(config) === "slot-reveal"
				? {
						reelTheme: configSlotPresentation(config)?.reelTheme ??
							slotRevealDefaultGameConfig.reelTheme,
						winningCombinations: buildSlotWinningCombinations(slotCandidateIds ?? []),
						missCombination: [...SLOT_MISS_COMBINATION],
					}
				: undefined,
		// Frozen PRIVATE quiz half (answer key + explanations + pass rule).
		// Public surfaces project only prompts/choices/passCount.
		quiz:
			configTemplateId(config) === "quiz" && isQuizGameConfig(config)
				? {
						passCount: config.passCount,
						questions: config.questions.map((question) => ({
							prompt: question.prompt,
							choices: [...question.choices],
							correctIndex: question.correctIndex,
							...(question.explanation
								? { explanation: question.explanation }
								: {}),
						})),
					}
				: undefined,
	};
}

/**
 * Admitted sessions play by their frozen snapshot. Rows created before
 * snapshots existed lazily freeze from the current config on their next
 * action; every new session snapshots at admission.
 */
export async function requireSessionRules(
	ctx: MutationCtx,
	session: Doc<"playSessions">,
): Promise<GameRulesSnapshot> {
	if (session.rulesSnapshot) {
		return session.rulesSnapshot;
	}
	const campaignGame = await ctx.db.get(session.campaignGameId);
	if (!campaignGame || campaignGame.ownerId !== session.ownerId) {
		throw new Error("Trò chơi không hợp lệ");
	}
	const snapshot = buildRulesSnapshot(campaignGame);
	await ctx.db.patch(session._id, { rulesSnapshot: snapshot, updatedAt: Date.now() });
	return snapshot;
}

export type GenericPlayPolicy = {
	templateId: GameTemplateId;
	rewardMode: "rewarded" | "engagement";
	noRewardWeight: number;
	noRewardLabel: string;
	rewardPoolTag: string;
	publicCopy: GameRulesSnapshot["publicCopy"];
	wheelSegments?: Array<{ key: string; label: string }>;
	/** Frozen scratch presentation (decorative; threshold is not a gate). */
	scratchCard?: {
		coverStyle: "gold" | "teal" | "crimson";
		revealThresholdPercent: number;
	};
	/** Frozen slot combinations; the candidate set bounds slot allocation. */
	slotReels?: {
		reelTheme: "gold" | "neon" | "festive";
		winningCombinations: Array<{ itemId: string; symbolKeys: string[] }>;
		missCombination: string[];
	};
	/**
	 * PRIVATE quiz half (frozen): answer key + explanations + pass rule.
	 * Server-only — never projected through public surfaces.
	 */
	quiz?: {
		passCount: number;
		questions: Array<{
			prompt: string;
			choices: string[];
			correctIndex: number;
			explanation?: string;
		}>;
	};
};

/**
 * Generic self-serve play only works for inventory-sourced games. Rules come
 * from the session snapshot (frozen at admission), so owner config edits
 * never change an admitted participant's challenge or reward mapping.
 */
export function genericPlayPolicyFromSnapshot(snapshot: GameRulesSnapshot): GenericPlayPolicy {
	if (snapshot.rewardSource !== "campaign-inventory") {
		throw new Error("Trò chơi này không hỗ trợ chơi tự phục vụ qua kho phần thưởng");
	}
	return {
		templateId: snapshot.templateId,
		rewardMode: snapshot.rewardMode,
		noRewardWeight: snapshot.noRewardWeight,
		noRewardLabel: snapshot.noRewardLabel,
		rewardPoolTag: snapshot.rewardPoolTag,
		publicCopy: snapshot.publicCopy,
		wheelSegments: snapshot.wheelSegments,
		scratchCard: snapshot.scratchCard,
		slotReels: snapshot.slotReels,
		quiz: snapshot.quiz,
	};
}

/** Live-config variant used at admission time only (never for actions). */
export function genericPlayPolicyForGame(
	campaignGame: Doc<"campaignGames">,
): GenericPlayPolicy {
	const config = normalizeCampaignGameConfigForTemplate(campaignGame.templateId, campaignGame.config);
	if (configRewardSource(config) !== "campaign-inventory") {
		throw new Error("Trò chơi này không hỗ trợ chơi tự phục vụ qua kho phần thưởng");
	}
	return {
		templateId: requireGameTemplateId(campaignGame.templateId),
		rewardMode: configRewardMode(config),
		noRewardWeight: configNoRewardWeight(config),
		noRewardLabel: configNoRewardLabel(config),
		rewardPoolTag: configRewardPoolTag(config),
		publicCopy: config.publicCopy,
		scratchCard:
			configTemplateId(config) === "scratch-card"
				? configScratchPresentation(config)
				: undefined,
		// Live-config view used at admission/validation only: the frozen
		// combinations derive from the pool at admission, never here.
		slotReels:
			configTemplateId(config) === "slot-reveal"
				? {
						reelTheme: configSlotPresentation(config)?.reelTheme ??
							slotRevealDefaultGameConfig.reelTheme,
						winningCombinations: [],
						missCombination: [...SLOT_MISS_COMBINATION],
					}
				: undefined,
		// Live-config PRIVATE quiz half; progression only ever lives on the
		// session, so nothing here is mutable game state.
		quiz:
			configTemplateId(config) === "quiz" && isQuizGameConfig(config)
				? {
						passCount: config.passCount,
						questions: config.questions.map((question) => ({
							prompt: question.prompt,
							choices: [...question.choices],
							correctIndex: question.correctIndex,
							...(question.explanation
								? { explanation: question.explanation }
								: {}),
						})),
					}
				: undefined,
	};
}

export type AllocationResult = {
	outcome: Doc<"rewardOutcomes">;
	session: Doc<"playSessions">;
};

/** Patches the session to completed exactly once and keeps the admission
 * aggregate + completion metric exact. Shared by every completion path. */
async function finalizeSessionCompletion(
	ctx: MutationCtx,
	session: Doc<"playSessions">,
	outcomeId: Id<"rewardOutcomes">,
	now: number,
): Promise<AllocationResult> {
	await ctx.db.patch(session._id, {
		status: "completed",
		outcomeId,
		completedAt: now,
		updatedAt: now,
	});
	// A completion moves the session into the completed bucket; keep the
	// admission aggregate exact (dedup for already-counted rows).
	const sessionAfterPatch = await ctx.db.get(session._id);
	if (sessionAfterPatch) {
		await playSessionsByGame.insertIfDoesNotExist(ctx, sessionAfterPatch);
	}
	await recordGenericPlayMetric(ctx, {
		eventKey: playSessionCounterEventKey(session._id, "game_completion"),
		ownerId: session.ownerId,
		campaignId: session.campaignId,
		campaignGameId: session.campaignGameId,
		shareLinkId: session.shareLinkId,
		channel: session.channel,
		channelLabel: session.channelLabel,
		metric: "game_completion",
	});
	const outcome = await ctx.db.get(outcomeId);
	if (!outcome) {
		throw new Error("Không thể ghi nhận kết quả chơi");
	}
	const completedSession = await ctx.db.get(session._id);
	if (!completedSession) {
		throw new Error("Phiên chơi không hợp lệ");
	}
	return { outcome, session: completedSession };
}

/** Truthful no-reward completion (engagement mode / failed quiz / grader
 * decision): records the thank-you outcome and completes WITHOUT touching
 * stock, reward quota or claimable state. */
async function completeSessionWithNoReward(
	ctx: MutationCtx,
	session: Doc<"playSessions">,
	policy: GenericPlayPolicy,
	label: string,
	now: number,
): Promise<AllocationResult> {
	const outcomeId = await ctx.db.insert("rewardOutcomes", {
		ownerId: session.ownerId,
		campaignId: session.campaignId,
		campaignGameId: session.campaignGameId,
		playSessionId: session._id,
		rewardType: "none",
		label,
		status: "granted",
		grantedAt: now,
	});
	return finalizeSessionCompletion(ctx, session, outcomeId, now);
}

/**
 * Atomic server-side allocation, played strictly by the session's frozen
 * rules snapshot. Convex mutations serialize, so the
 * read → weighted pick → quota check → decrement → insert sequence cannot
 * double-spend a last unit: the second concurrent completion observes the
 * decremented stock.
 *
 * Engagement-mode games never allocate inventory, consume reward quota, or
 * create claimable outcomes — completing the play records the configured
 * thank-you result regardless of pool stock. Rewarded selections consume the
 * shared account reward quota once (assertCanRedeem reads legacy redemptions
 * + rewarded generic outcomes); chance-based no-reward results never consume
 * or get blocked by it.
 */
export async function allocateRewardOutcome(
	ctx: MutationCtx,
	session: Doc<"playSessions">,
): Promise<AllocationResult> {
	const policy = genericPlayPolicyFromSnapshot(await requireSessionRules(ctx, session));
	const now = Date.now();

	if (policy.rewardMode === "engagement") {
		return completeSessionWithNoReward(
			ctx,
			session,
			policy,
			policy.noRewardLabel,
			now,
		);
	}

	const items = await listActiveRewardInventory(
		ctx,
		session.ownerId,
		session.campaignId,
		policy.rewardPoolTag,
	);
	// Slot sessions play by the frozen candidate set: items added to the pool
	// after admission (or beyond the bounded symbol mapping) never enter the
	// weighted pick, so every awardable reward keeps its unambiguous
	// documented combination.
	const slotCandidates = policy.slotReels?.winningCombinations
		? new Set(policy.slotReels.winningCombinations.map((combination) => combination.itemId))
		: null;
	const eligibleItems =
		slotCandidates !== null
			? items.filter((item) => slotCandidates.has(item._id))
			: items;
	const options = eligibleItems.map((item) => ({
		key: item._id,
		weight: item.weight,
	}));

	const totalWeight = options.reduce((sum, option) => sum + option.weight, policy.noRewardWeight);
	let selectedKey: string | null = null;
	if (totalWeight > 0) {
		const selected = selectWeightedOption(options, policy.noRewardWeight, secureRandomInt(totalWeight));
		selectedKey = selected?.key ?? null;
	}
	const isReward = Boolean(selectedKey && selectedKey !== NO_REWARD_OPTION_KEY);
	if (isReward) {
		await ensureRewardAccountingReady(ctx, session.ownerId);
		await assertCanRedeem(ctx, session.ownerId);
	}

	let outcomeId: Id<"rewardOutcomes">;

	if (!isReward || !selectedKey) {
		const exhausted = totalWeight <= 0 || options.every((option) => option.weight <= 0);
		const label = exhausted
			? "Phần thưởng đã hết, cảm ơn bạn đã tham gia!"
			: policy.noRewardLabel;
		outcomeId = await ctx.db.insert("rewardOutcomes", {
			ownerId: session.ownerId,
			campaignId: session.campaignId,
			campaignGameId: session.campaignGameId,
			playSessionId: session._id,
			rewardType: "none",
			label,
			status: "granted",
			grantedAt: now,
		});
	} else {
		const selectedItem = eligibleItems.find((item) => item._id === selectedKey);
		if (!selectedItem || selectedItem.quantityRemaining <= 0) {
			throw new Error("Tồn kho phần thưởng không hợp lệ, vui lòng thử lại");
		}
		const nextRemaining = selectedItem.quantityRemaining - 1;
		await ctx.db.patch(selectedItem._id, {
			quantityRemaining: nextRemaining,
			isActive: nextRemaining > 0,
			updatedAt: now,
		});

		outcomeId = await ctx.db.insert("rewardOutcomes", {
			ownerId: session.ownerId,
			campaignId: session.campaignId,
			campaignGameId: session.campaignGameId,
			playSessionId: session._id,
			rewardItemId: selectedItem._id,
			rewardType: selectedItem.rewardType,
			label: rewardOutcomeLabel({
				rewardType: selectedItem.rewardType,
				name: selectedItem.name,
				amount: selectedItem.amount,
			}),
			amount: selectedItem.amount,
			// Immutable award snapshot: claim recovery never depends on later
			// inventory edits. Server-private; never in public catalog data.
			awardSecretCode: selectedItem.secretCode,
			status: "granted",
			grantedAt: now,
		});
	}

	await ctx.db.patch(session._id, {
		status: "completed",
		outcomeId,
		completedAt: now,
		updatedAt: now,
	});
	// Status move active → completed: keep the admission aggregate exact for
	// sessions that complete while (or before) their backfill page runs.
	const completedSessionForAggregate = await ctx.db.get(session._id);
	if (completedSessionForAggregate) {
		await playSessionsByGame.insertIfDoesNotExist(ctx, completedSessionForAggregate);
	}

	const outcome = await ctx.db.get(outcomeId);
	if (!outcome) {
		throw new Error("Không thể ghi nhận kết quả chơi");
	}
	if (outcome.rewardType !== "none") {
		await rewardedOutcomesByOwner.insert(ctx, outcome);
	}

	await recordGenericPlayMetric(ctx, {
		eventKey: playSessionCounterEventKey(session._id, "game_completion"),
		ownerId: session.ownerId,
		campaignId: session.campaignId,
		campaignGameId: session.campaignGameId,
		shareLinkId: session.shareLinkId,
		channel: session.channel,
		channelLabel: session.channelLabel,
		metric: "game_completion",
	});
	if (outcome.rewardType !== "none") {
		await recordGenericPlayMetric(ctx, {
			eventKey: rewardCounterEventKey(outcome._id, "reward_outcome"),
			ownerId: session.ownerId,
			campaignId: session.campaignId,
			campaignGameId: session.campaignGameId,
			shareLinkId: session.shareLinkId,
			channel: session.channel,
			channelLabel: session.channelLabel,
			metric: "reward_outcome",
		});
	}

	const completedSession = await ctx.db.get(session._id);
	if (!completedSession) {
		throw new Error("Phiên chơi không hợp lệ");
	}
	return { outcome, session: completedSession };
}

export type QuizAnswerResult =
	| {
			status: "in-progress";
			totalQuestions: number;
			answeredCount: number;
	  }
	| {
			status: "completed";
			score: number;
			passed: boolean;
			outcome: Doc<"rewardOutcomes">;
	  };

/**
 * Authoritative multi-step quiz answering (docs/design-quiz.md).
 *
 * Revision contract: `revision` is the caller's count of already-accepted
 * answers. A NEW answer must carry `revision === answeredCount` and target
 * exactly the current question (no skipping). `revision === answeredCount-1`
 * matching the LAST recorded answer is an idempotent lost-response retry.
 * Anything else is a stale/conflicting revision and rejects. Convex
 * serialization makes overlapping submissions safe: the second identical
 * submission degrades to a retry; a conflicting one rejects — the progress
 * can never advance twice.
 *
 * Intermediate answers only persist bounded progression. The FINAL answer
 * grades ONCE against the frozen private key: a pass makes the participant
 * reward-eligible under the frozen policy (atomic allocation, exactly-once);
 * a fail (or an engagement-only game) completes with a truthful no-reward
 * outcome and never touches stock or reward quota.
 */
export async function answerQuizQuestion(
	ctx: MutationCtx,
	session: Doc<"playSessions">,
	action: { type: "quiz-answer"; questionIndex: number; choiceIndex: number; revision: number },
): Promise<QuizAnswerResult> {
	const policy = genericPlayPolicyFromSnapshot(await requireSessionRules(ctx, session));
	const quiz = policy.quiz;
	if (!quiz || quiz.questions.length === 0) {
		throw new Error("Trắc nghiệm này chưa được cấu hình");
	}
	const total = quiz.questions.length;
	const answers = session.quizProgress?.answers ?? [];
	const now = Date.now();

	if (
		!Number.isInteger(action.questionIndex) ||
		action.questionIndex < 0 ||
		action.questionIndex >= total
	) {
		throw new Error("Câu hỏi không hợp lệ");
	}
	const question = quiz.questions[action.questionIndex];
	if (
		!Number.isInteger(action.choiceIndex) ||
		action.choiceIndex < 0 ||
		action.choiceIndex >= question.choices.length
	) {
		throw new Error("Lựa chọn không hợp lệ");
	}
	if (!Number.isInteger(action.revision) || action.revision < 0) {
		throw new Error("Phiên trả lời không hợp lệ");
	}

	// Idempotent retry: identical replay of the LAST accepted answer.
	if (action.revision === answers.length - 1 && answers.length > 0) {
		const last = answers[answers.length - 1];
		if (
			last.questionIndex === action.questionIndex &&
			last.choiceIndex === action.choiceIndex
		) {
			return {
				status: "in-progress",
				totalQuestions: total,
				answeredCount: answers.length,
			};
		}
		throw new Error("Câu trả lời đã cũ hoặc không khớp tiến độ");
	}
	// Any other mismatched revision is stale or conflicting.
	if (action.revision !== answers.length) {
		throw new Error("Câu trả lời đã cũ hoặc không khớp tiến độ");
	}
	// No skipping: a new answer must target the current question.
	if (action.questionIndex !== answers.length) {
		throw new Error("Chỉ được trả lời câu hỏi hiện tại");
	}

	const nextAnswers = [
		...answers,
		{ questionIndex: action.questionIndex, choiceIndex: action.choiceIndex },
	];
	await ctx.db.patch(session._id, {
		quizProgress: { answers: nextAnswers },
		updatedAt: now,
	});

	if (nextAnswers.length < total) {
		return {
			status: "in-progress",
			totalQuestions: total,
			answeredCount: nextAnswers.length,
		};
	}

	// Final grading: recompute the score from the frozen private key.
	let score = 0;
	for (const answer of nextAnswers) {
		if (quiz.questions[answer.questionIndex]?.correctIndex === answer.choiceIndex) {
			score += 1;
		}
	}
	const passed = score >= quiz.passCount;
	if (passed) {
		// Passing establishes reward ELIGIBILITY under the frozen policy:
		// rewarded mode allocates atomically (exactly-once, stock/quota
		// checked); engagement mode completes with the thank-you outcome.
		const allocation = await allocateRewardOutcome(ctx, session);
		return {
			status: "completed",
			score,
			passed,
			outcome: allocation.outcome,
		};
	}
	// Fail (rewarded or engagement): truthful no-reward completion — no
	// stock, no quota, no claimable outcome.
	const completed = await completeSessionWithNoReward(
		ctx,
		session,
		policy,
		policy.noRewardLabel,
		now,
	);
	return {
		status: "completed",
		score,
		passed,
		outcome: completed.outcome,
	};
}

export const playActionValidator = v.union(
	v.object({
		type: v.literal("reveal-envelope"),
		envelopeIndex: v.number(),
	}),
	v.object({
		type: v.literal("spin"),
	}),
	v.object({
		type: v.literal("scratch-reveal"),
	}),
	v.object({
		type: v.literal("spin-reels"),
	}),
	v.object({
		type: v.literal("quiz-answer"),
		questionIndex: v.number(),
		choiceIndex: v.number(),
		// Stable retry identity: the client's count of already-accepted
		// answers. Same-value replays are idempotent; conflicting ones reject.
		revision: v.number(),
	}),
);

export function validateActionForTemplate(
	templateId: string,
	action:
		| { type: "reveal-envelope"; envelopeIndex: number }
		| { type: "spin" }
		| { type: "scratch-reveal" }
		| { type: "spin-reels" }
		| {
				type: "quiz-answer";
				questionIndex: number;
				choiceIndex: number;
				revision: number;
		  },
) {
	const resolvedTemplateId = requireGameTemplateId(templateId);
	if (resolvedTemplateId === "lucky-wheel") {
		if (action.type !== "spin") {
			throw new Error("Hành động không hợp lệ cho vòng quay may mắn");
		}
		return action;
	}
	if (resolvedTemplateId === "scratch-card") {
		if (action.type !== "scratch-reveal") {
			throw new Error("Hành động không hợp lệ cho thẻ cào may mắn");
		}
		return action;
	}
	if (resolvedTemplateId === "slot-reveal") {
		if (action.type !== "spin-reels") {
			throw new Error("Hành động không hợp lệ cho máy quay tri ân");
		}
		return action;
	}
	if (resolvedTemplateId === "quiz") {
		if (action.type !== "quiz-answer") {
			throw new Error("Hành động không hợp lệ cho trắc nghiệm tri ân");
		}
		return action;
	}
	if (action.type !== "reveal-envelope") {
		throw new Error("Hành động không hợp lệ cho trò chơi này");
	}
	if (
		!Number.isInteger(action.envelopeIndex) ||
		action.envelopeIndex < 0 ||
		action.envelopeIndex >= ENVELOPE_COUNT
	) {
		throw new Error(`Phong bao không hợp lệ (0-${ENVELOPE_COUNT - 1})`);
	}
	return action;
}

export async function requireSessionOwnerContextForAdmin(
	ctx: MutationCtx,
	sessionId: string,
): Promise<Doc<"playSessions">> {
	const { ownerId } = await requireResolvedOwner(ctx, undefined, {
		notFoundMessage: "Không tìm thấy host",
		forbiddenMessage: "Bạn không có quyền thao tác phiên chơi này",
	});
	const normalizedSessionId = ctx.db.normalizeId("playSessions", sessionId);
	if (!normalizedSessionId) {
		throw new Error("Phiên chơi không hợp lệ");
	}
	const session = await ctx.db.get(normalizedSessionId);
	if (!session || session.ownerId !== ownerId) {
		throw new Error("Không tìm thấy phiên chơi");
	}
	return session;
}

export { resolveShareLink };
