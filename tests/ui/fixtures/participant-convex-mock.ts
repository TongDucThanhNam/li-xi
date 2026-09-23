// Participant backend for the ACTUAL PublicShareEntryFeature: synthetic
// publicPlay.* queries/mutations with deterministic data, deferred response
// controls, and mock-backend persistence in sessionStorage (namespaced
// `pt-backend:` — deliberately separate from the product's localStorage
// keys). UI integration scope only; this is NOT a real backend.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bumpVersion } from "./convex-mock";

export type ParticipantOutcome = {
	kind: "reward" | "no-reward";
	rewardType: "cash" | "voucher" | "physical" | "points" | "none";
	label: string;
	amount: number | null;
	canClaim: boolean;
	segmentKey: string | null;
};

type ParticipantSession = {
	sessionId: string;
	sessionToken: string;
	startKey: string;
	status: "active" | "completed";
	claimed: boolean;
	/** This client played the session in this page's backend instance. */
	playedHere?: boolean;
	outcome: ParticipantOutcome | null;
	secretCode: string | null;
	/** Bounded quiz progression (accepted answers in order). */
	quizAnswers?: Array<{ questionIndex: number; choiceIndex: number }>;
};

type ParticipantBackend = {
	entryState: "open" | "revoked";
	stock: number;
	admissionCount: number;
	sessions: Record<string, ParticipantSession>;
	resultDelivery: "immediate" | "delayed";
	/** Recovery outcome query in flight (undefined) once delayed. */
	resultReady: boolean;
	/** Action-lag window: played here but the reactive read lags (null). */
	actionResultReady: boolean;
	claimDelivery: "immediate" | "delayed";
	claimDelivered: boolean;
	dropNextStart: boolean;
	/** Reveal-action response timing: immediate, held, or failing once. */
	actionDelivery: "immediate" | "delayed" | "fail-once";
	/** fail-once: the first reveal throws before allocating anything. */
	actionFailedOnce: boolean;
	/** A fresh module instance after navigation means the page reloaded. */
	reloaded: boolean;
	opens: number;
	starts: number;
	plays: number;
	claims: number;
};

type ParticipantGame = {
	scenario: string;
	shareCode: string;
	campaignId: string;
	campaignGameId: string;
	templateId: "li-xi" | "lucky-wheel" | "scratch-card" | "slot-reveal";
	gameName: string;
	headline: string;
	engagement: boolean;
	segments: Array<{ key: string; label: string }>;
	noRewardLabel: string;
	noRewardKey: string;
	voucherSecret: string;
	coverStyle?: string;
	revealThresholdPercent?: number;
	reelTheme?: string;
	/** Reward outcome segment key; the slot scenario maps it to a combination. */
	rewardSegmentKey?: string;
	/** Hero Start label override (defaults to the generic "Bắt đầu"). */
	startCtaLabel?: string;
	/** PRIVATE quiz half (answer keys live here, server-side only). */
	quiz?: {
		passCount: number;
		questions: Array<{
			prompt: string;
			choices: string[];
			correctIndex: number;
			explanation: string;
		}>;
	};
	/** Slot scenario: truthful outcome payload per mapped item id. */
	rewardOptions?: Record<
		string,
		{
			rewardType: "cash" | "voucher" | "physical" | "points";
			label: string;
			amount: number | null;
		}
	>;
	/** Active reward segment override for the NEXT rewarded play. */
	activeRewardSegmentKey?: string;
};

const GAMES: Record<string, ParticipantGame> = {
	wheel: {
		scenario: "wheel",
		shareCode: "uiwheel000000000000000",
		campaignId: "campaign-a",
		campaignGameId: "game-wheel",
		templateId: "lucky-wheel",
		gameName: "Vòng quay tri ân",
		headline: "Vòng quay tri ân",
		engagement: false,
		segments: [{ key: "voucher-pool", label: "Voucher quà tặng" }],
		noRewardLabel: "Chúc bạn may mắn",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-STORED-CODE",
	},
	"wheel-engagement": {
		scenario: "wheel-engagement",
		shareCode: "uiwheeleng000000000000",
		campaignId: "campaign-a",
		campaignGameId: "game-wheel-eng",
		templateId: "lucky-wheel",
		gameName: "Vòng quay cảm ơn",
		headline: "Vòng quay cảm ơn",
		engagement: true,
		segments: [],
		noRewardLabel: "Cảm ơn bạn đã tham gia",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-STORED-CODE",
	},
	scratch: {
		scenario: "scratch",
		shareCode: "uiscratch0000000000000", // 22-char
		campaignId: "campaign-a",
		campaignGameId: "game-scratch",
		templateId: "scratch-card",
		gameName: "Thẻ cào tri ân",
		headline: "Thẻ cào tri ân",
		engagement: false,
		segments: [],
		noRewardLabel: "Chúc bạn may mắn",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-SCRATCH-CODE",
		coverStyle: "gold",
		// A single deliberate stroke crosses this, so the presentation
		// auto-clear exercises real measured coverage.
		revealThresholdPercent: 10,
	},
	"scratch-high": {
		scenario: "scratch-high",
		shareCode: "uiscratchhi00000000000", // 22-char
		campaignId: "campaign-a",
		campaignGameId: "game-scratch-high",
		templateId: "scratch-card",
		gameName: "Thẻ cào kỹ niệm",
		headline: "Thẻ cào kỹ niệm",
		engagement: false,
		segments: [],
		noRewardLabel: "Chúc bạn may mắn",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-SCRATCH-CODE",
		coverStyle: "teal",
		// Threshold never releases the coating on its own: the full-clear
		// control is the only immediate bypass in this scenario.
		revealThresholdPercent: 100,
	},
	"scratch-crimson": {
		scenario: "scratch-crimson",
		shareCode: "uiscratchcr00000000000", // 22-char
		campaignId: "campaign-a",
		campaignGameId: "game-scratch-crimson",
		templateId: "scratch-card",
		gameName: "Thẻ cào đỏ hồng",
		headline: "Thẻ cào đỏ hồng",
		engagement: false,
		segments: [],
		noRewardLabel: "Chúc bạn may mắn",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-SCRATCH-CODE",
		coverStyle: "crimson",
		revealThresholdPercent: 100,
	},
	slot: {
		scenario: "slot",
		shareCode: "uislot0000000000000000", // 22-char
		campaignId: "campaign-a",
		campaignGameId: "game-slot",
		templateId: "slot-reveal",
		gameName: "Máy quay tri ân",
		headline: "Máy quay tri ân",
		engagement: false,
		segments: [],
		noRewardLabel: "Chúc bạn may mắn lần sau",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-SLOT-CODE",
		reelTheme: "gold",
		// Default winning combination maps to THIS item id, so the settled
		// reels are verifiable against the outcome identity.
		rewardSegmentKey: "slot-item-voucher",
		startCtaLabel: "Quay ngay",
		// One option per supported inventory reward type plus a duplicate-label
		// sibling (same label + amount, DISTINCT id → distinct combination).
		rewardOptions: {
			"slot-item-cash": { rewardType: "cash", label: "Tiền mặt tri ân", amount: 50000 },
			"slot-item-voucher": { rewardType: "voucher", label: "Voucher quà tặng", amount: null },
			"slot-item-physical": { rewardType: "physical", label: "Hộp quà sự kiện", amount: null },
			"slot-item-points": { rewardType: "points", label: "Điểm thưởng", amount: 25 },
			"slot-item-points-copy": { rewardType: "points", label: "Điểm thưởng", amount: 25 },
		},
	},
	lunar: {
		scenario: "lunar",
		shareCode: "uilunar000000000000000",
		campaignId: "campaign-a",
		campaignGameId: "game-lunar",
		templateId: "li-xi",
		gameName: "Bánh bao lì xì",
		headline: "Bánh bao lì xì",
		engagement: true,
		segments: [],
		noRewardLabel: "Hẹn gặp lại",
		noRewardKey: "__no-reward__",
		voucherSecret: "SYNTHETIC-STORED-CODE",
	},
};

function defaultBackend(): ParticipantBackend {
	return {
		entryState: "open",
		stock: 5,
		admissionCount: 0,
		sessions: {},
		resultDelivery: "immediate",
		resultReady: true,
		actionResultReady: true,
		claimDelivery: "immediate",
		claimDelivered: true,
		dropNextStart: false,
		actionDelivery: "immediate",
		actionFailedOnce: false,
		reloaded: false,
		opens: 0,
		starts: 0,
		plays: 0,
		claims: 0,
	};
}

	const backends = new Map<string, ParticipantBackend>();
const recordedParticipantCalls: Array<Record<string, any>> = [];
/** Held reveal-action resolvers for `actionDelivery: "delayed"`. */
const pendingActions = new Map<string, Array<() => void>>();
let activeShareCode = "wheel";

// The participant backend shares the inventory mock's version store: React
// (via the synthetic useQuery) subscribes to THAT listener set.
const emit = () => {
	persist(activeShareCode);
	bumpVersion();
};

function persist(shareCode: string) {
	if (typeof sessionStorage === "undefined") return;
	const backend = backends.get(shareCode);
	if (backend) {
		sessionStorage.setItem(`pt-backend:${shareCode}`, JSON.stringify(backend));
	}
}

function backendFor(shareCode: string): ParticipantBackend {
	let backend = backends.get(shareCode);
	if (!backend) {
		const stored = typeof sessionStorage !== "undefined"
			? sessionStorage.getItem(`pt-backend:${shareCode}`)
			: null;
		backend = stored ? (JSON.parse(stored) as ParticipantBackend) : defaultBackend();
		// A backend restored from storage means this module instance loaded
		// after a reload: recovery queries model the in-flight state.
		backend.reloaded = Boolean(stored);
		applySeed(shareCode, backend);
		backends.set(shareCode, backend);
	}
	return backend;
}

/** Deterministic named seed: `?seed=saved-unclaimed|saved-claimed`. */
function applySeed(shareCode: string, backend: ParticipantBackend) {
	if (backend.sessions["saved-session-1"]) {
		// Seed only absent records: a stored claimed session survives reloads.
		return;
	}
	const seed = typeof location !== "undefined"
		? new URLSearchParams(location.search).get("seed")
		: null;
	if (shareCode !== GAMES.wheel.shareCode || !seed?.startsWith("saved-")) return;
	const outcome: ParticipantOutcome = {
		kind: "reward", rewardType: "voucher", label: "Voucher đã lưu",
		amount: null, canClaim: true, segmentKey: "voucher-pool",
	};
	backend.sessions["saved-session-1"] = {
		sessionId: "saved-session-1",
		sessionToken: "saved-token-1",
		startKey: "saved-startkey-1",
		status: "completed",
		claimed: seed === "saved-claimed",
		outcome,
		secretCode: seed === "saved-claimed" ? "SAVED-CLAIMED-CODE" : "SAVED-STORED-CODE",
	};
}

/** Real-shaped share codes use the product's 22-character format. */
export function resolveParticipantShareCode(scenario: string): string {
	const game = Object.values(GAMES).find((entry) => entry.scenario === scenario);
	return game?.shareCode ?? GAMES.wheel.shareCode;
}

function gameByShareCode(shareCode: string): ParticipantGame {
	return Object.values(GAMES).find((game) => game.shareCode === shareCode) ?? GAMES.wheel;
}

export function participantQuery(name: string, args: any) {
	const shareCode: string = args.shareCode ?? activeShareCode;
	const game = gameByShareCode(shareCode);
	const backend = backendFor(shareCode);

	if (name === "publicPlay:getPublicShareEntry") {
		if (backend.entryState !== "open") return { state: backend.entryState };
		return {
			state: "open",
			shareCode,
			channel: "ui-fixture",
			campaign: {
				name: "Chiến dịch UI", brandName: "Brand UI",
				description: "Fixture", heroAssetUrl: null,
			},
			game: {
				campaignGameId: game.campaignGameId,
				templateId: game.templateId,
				gameName: game.gameName,
				selfServe: true,
				publicCopy: {
					headline: game.headline,
					subtitle: "UI fixture",
					startCtaLabel: game.startCtaLabel ?? "Bắt đầu",
					collectCtaLabel: "Nhận quà",
					waitingMessage: "",
				},
				wheel:
					game.templateId === "lucky-wheel"
						? { segments: game.segments, noRewardLabel: game.noRewardLabel, noRewardKey: game.noRewardKey }
						: undefined,
				playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
			},
			availability: { soldOut: false },
			viewer: { canPlay: true, reason: null },
		};
	}

	// Capability reads validate session id AND token; a wrong token means the
	// capability is unknown (matching publicPlay handler rejection semantics).
	const session =
		backend.sessions[args.sessionId as string]?.sessionToken === args.sessionToken
			? backend.sessions[args.sessionId as string]
			: undefined;

	if (name === "publicPlay:getPublicSessionOutcome") {
		if (!session) return null;
		if (session.status !== "completed") return null;
		if (backend.reloaded) {
			// After a reload the recovery query is in flight until delivered.
			if (!backend.resultReady) return undefined;
		} else if (session.playedHere && !backend.actionResultReady) {
			// Pre-reload action lag: loaded, no outcome yet — the in-hand
			// action response keeps the local result visible.
			return null;
		}
		// canClaim is evaluated at read time: a claimed session reports false
		// so the recovered surface renders Finish, not another claim action.
		return {
			outcome: {
				...session.outcome,
				canClaim: session.outcome?.kind === "reward" && !session.claimed,
			},
		};
	}
	if (name === "publicPlay:getPublicClaimDetail") {
		if (backend.claimDelivery === "delayed" && !backend.claimDelivered) return undefined;
		if (!session?.claimed) return null;
		return {
			claim: {
				label: session.outcome?.label ?? "Phần thưởng",
				rewardType: session.outcome?.rewardType ?? "voucher",
				amount: session.outcome?.amount ?? null,
				secretCode: session.secretCode,
				instructions: "Hướng dẫn nhận thưởng (fixture).",
			},
		};
	}
	if (name === "publicPlay:getPublicSessionSnapshot") {
		if (!session) return null;
		return {
			rules: {
				templateId: game.templateId,
				publicCopy: {
					headline: game.headline,
					subtitle: "UI fixture",
					startCtaLabel: game.startCtaLabel ?? "Bắt đầu",
					collectCtaLabel: "Nhận quà",
					waitingMessage: "",
				},
				...(game.templateId === "lucky-wheel"
					? {
							wheel: {
								segments: game.segments,
								noRewardLabel: game.noRewardLabel,
								noRewardKey: game.noRewardKey,
							},
						}
					: {}),
				...(game.templateId === "scratch-card"
					? {
							scratchCard: {
								coverStyle: game.coverStyle ?? "gold",
								revealThresholdPercent: game.revealThresholdPercent ?? 55,
							},
						}
					: {}),
				...(game.templateId === "slot-reveal"
					? {
							slotReels: {
								reelTheme: game.reelTheme ?? "gold",
								winningCombinations: [
									{
										itemId: "slot-item-voucher",
										symbolKeys: ["bell", "bell", "bell"],
									},
									{
										itemId: "slot-item-cash",
										symbolKeys: ["star", "star", "star"],
									},
									{
										itemId: "slot-item-physical",
										symbolKeys: ["gem", "gem", "gem"],
									},
									{
										itemId: "slot-item-points",
										symbolKeys: ["heart", "heart", "heart"],
									},
									{
										// Duplicate label/amount sibling: DISTINCT id and
										// therefore a DISTINCT documented combination.
										itemId: "slot-item-points-copy",
										symbolKeys: ["clover", "clover", "clover"],
									},
								],
								missCombination: ["moon", "star", "clover"],
							},
						}
					: {}),
			},
		};
	}
	if (name === "publicPlay:getSavedRewardSummaries") {
		const entries = (args.entries as Array<{ sessionId: string; sessionToken: string }>).slice(0, 20);
		return {
			entries: entries.map((entry) => {
				const saved = backend.sessions[entry.sessionId];
				if (!saved || saved.sessionToken !== entry.sessionToken) {
					return { sessionId: entry.sessionId, status: "invalid" };
				}
				if (saved.status !== "completed") {
					return { sessionId: entry.sessionId, status: "active" };
				}
				return {
					sessionId: entry.sessionId,
					status: "completed",
					claimed: saved.claimed,
					outcome: {
						...saved.outcome,
						secretCode: saved.claimed ? saved.secretCode : null,
					},
				};
			}),
		};
	}
	throw new Error(`Unsupported synthetic participant query: ${name}`);
}

export function participantMutation(name: string, args: any) {
	const shareCode: string = args.shareCode ?? activeShareCode;
	const game = gameByShareCode(shareCode);
	const backend = backendFor(shareCode);
	recordedParticipantCalls.push(JSON.parse(JSON.stringify({ name, ...args })));
	emit();

	if (name === "publicPlay:recordShareEntryOpen") {
		backend.opens += 1;
		emit();
		return { recorded: true };
	}
	if (name === "publicPlay:startPublicPlaySession") {
		backend.starts += 1;
		// Lost-response simulation: the first attempt commits server-side but
		// its response is dropped; retry with the same persisted start key
		// recovers exactly one admitted session.
		const existing = Object.values(backend.sessions).find(
			(session) => session.startKey === args.startKey,
		);
		if (existing) {
			emit();
			return {
				sessionId: existing.sessionId,
				sessionToken: existing.sessionToken,
				participantToken: "pt-fixture-participant",
				participantDisplayName: null,
				resumed: true,
				templateId: game.templateId,
			};
		}
		backend.admissionCount += 1;
		const sessionId = `${shareCode}-session-${backend.admissionCount}`;
		backend.sessions[sessionId] = {
			sessionId,
			sessionToken: `${sessionId}-token`,
			startKey: args.startKey,
			status: "active",
			claimed: false,
			outcome: null,
			secretCode: null,
		};
		if (backend.dropNextStart) {
			backend.dropNextStart = false;
			emit();
			throw new Error("Mất phản hồi bắt đầu (mô phỏng)");
		}
		emit();
		return {
			sessionId,
			sessionToken: `${sessionId}-token`,
			participantToken: "pt-fixture-participant",
			participantDisplayName: null,
			resumed: false,
			templateId: game.templateId,
		};
	}
	const session = backend.sessions[args.sessionId as string];
	if (!session || args.sessionToken !== session.sessionToken) {
		throw new Error("Invalid synthetic participant capability");
	}
	if (name === "publicPlay:playSessionAction") {
		backend.plays += 1;
		// Replay of a completed session preserves the original allocation.
		if (session.status === "completed" && session.outcome) {
			emit();
			return { outcome: session.outcome };
		}
		// fail-once: the FIRST unfinished reveal rejects WITHOUT allocating;
		// the retry replays the same capability and succeeds exactly once.
		if (backend.actionDelivery === "fail-once" && !backend.actionFailedOnce) {
			backend.actionFailedOnce = true;
			emit();
			throw new Error(
				game.templateId === "slot-reveal"
					? "Mất phản hồi quay máy (mô phỏng)"
					: "Mất phản hồi mở thẻ (mô phỏng)",
			);
		}
		const runReveal = () => {
			session.status = "completed";
			session.playedHere = true;
			if (game.engagement || backend.stock <= 0) {
				session.outcome = {
					kind: "no-reward", rewardType: "none", label: game.noRewardLabel,
					amount: null, canClaim: false, segmentKey: game.noRewardKey,
				};
			} else {
				// Stock and the immutable secret are allocated ONCE at rewarded
				// play (mirrors playEngine allocation), never at claim.
				backend.stock -= 1;
				const segmentKey =
					game.activeRewardSegmentKey ??
					game.rewardSegmentKey ??
					"voucher-pool";
				const option = game.rewardOptions?.[segmentKey];
				const isVoucher = option ? option.rewardType === "voucher" : true;
				session.secretCode = isVoucher ? game.voucherSecret : null;
				session.outcome = {
					kind: "reward",
					rewardType: option?.rewardType ?? "voucher",
					label: option?.label ?? "Voucher quà tặng",
					amount: option?.amount ?? null,
					canClaim: true,
					segmentKey,
				};
			}
			emit();
			return { outcome: session.outcome };
		};
		// delayed: the whole reveal (allocation included) is held until the
		// harness calls deliverActions(); strokes keep erasing meanwhile.
		if (backend.actionDelivery === "delayed") {
			const resolvers = pendingActions.get(shareCode) ?? [];
			return new Promise<{ outcome: ParticipantOutcome }>((resolve) => {
				resolvers.push(() => resolve(runReveal()));
				pendingActions.set(shareCode, resolvers);
			});
		}
		return runReveal();
	}
	if (name === "publicPlay:claimPublicReward") {
		backend.claims += 1;
		// Claim is read-only with respect to stock; the allocated code is
		// immutable and replay returns the same claim.
		if (!session.claimed) {
			session.claimed = true;
		}
		emit();
		return {
			claim: {
				label: session.outcome?.label ?? "Phần thưởng",
				rewardType: session.outcome?.rewardType ?? "voucher",
				amount: session.outcome?.amount ?? null,
				secretCode: session.secretCode,
				instructions: "Hướng dẫn nhận thưởng (fixture).",
			},
		};
	}
	throw new Error(`Unsupported synthetic participant mutation: ${name}`);
}

/** Typed programmatic controls for Playwright: response timing and data
 * only — never product state. */
export type ParticipantFixtureApi = {
	shareCodes: Record<
		| "wheel"
		| "wheel-engagement"
		| "lunar"
		| "scratch"
		| "scratch-high"
		| "scratch-crimson"
		| "slot",
		string
	>;
	setActiveShareCode(shareCode: string): void;
	closeEntry(shareCode?: string): void;
	setResultDelivery(mode: "immediate" | "delayed", shareCode?: string): void;
	deliverOutcomes(shareCode?: string): void;
	setClaimDelivery(mode: "immediate" | "delayed", shareCode?: string): void;
	deliverClaim(shareCode?: string): void;
	dropNextStart(shareCode?: string): void;
	setActionDelivery(
		mode: "immediate" | "delayed" | "fail-once",
		shareCode?: string,
	): void;
	deliverActions(shareCode?: string): void;
	setEngagement(enabled: boolean, shareCode?: string): void;
	completeSessionRemotely(shareCode?: string): void;
	setRewardSegmentKey(segmentKey: string | null, shareCode?: string): void;
	setStock(value: number, shareCode?: string): void;
	counters(shareCode?: string): {
		opens: number;
		starts: number;
		plays: number;
		claims: number;
		admissionCount: number;
		stock: number;
	};
	lastClaim(): { sessionId: string; sessionToken: string } | null;
	lastPlay(): { sessionId: string; sessionToken: string } | null;
	createdSessions(shareCode?: string): Array<{
		sessionId: string;
		sessionToken: string;
		startKey: string;
		status: string;
		claimed: boolean;
	}>;
	calls(name: string): Array<Record<string, unknown>>;
	session(
		shareCode: string,
		sessionId: string,
	): Omit<ParticipantSession, "outcome"> | null;
	probeOutcome(
		args: { sessionId: string; sessionToken: string },
		shareCode?: string,
	): { resultReady: boolean; result?: unknown; error?: string };
};

export const participantFixtureApi: ParticipantFixtureApi = {
	shareCodes: {
		wheel: "wheel",
		"wheel-engagement": "wheel-engagement",
		lunar: "lunar",
		scratch: "scratch",
		"scratch-high": "scratch-high",
		"scratch-crimson": "scratch-crimson",
		slot: "slot",
	},
	setActiveShareCode(shareCode: string) {
		activeShareCode = shareCode;
	},
	closeEntry(shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		backend.entryState = "revoked";
		emit();
	},
	setResultDelivery(mode: "immediate" | "delayed" = "delayed", shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		backend.resultDelivery = mode;
		// Delayed mode models the recovery query in flight AND the action-lag
		// window; delivery resolves both.
		backend.resultReady = mode === "immediate";
		backend.actionResultReady = mode === "immediate";
		emit();
	},
	deliverOutcomes(shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		backend.resultReady = true;
		backend.actionResultReady = true;
		emit();
	},
	setClaimDelivery(mode: "immediate" | "delayed" = "delayed", shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		backend.claimDelivery = mode;
		backend.claimDelivered = mode === "immediate";
		emit();
	},
	deliverClaim(shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		backend.claimDelivered = true;
		emit();
	},
	dropNextStart(shareCode = activeShareCode) {
		backendFor(shareCode).dropNextStart = true;
	},
	setActionDelivery(
		mode: "immediate" | "delayed" | "fail-once" = "delayed",
		shareCode = activeShareCode,
	) {
		backendFor(shareCode).actionDelivery = mode;
		backendFor(shareCode).actionFailedOnce = false;
		emit();
	},
	deliverActions(shareCode = activeShareCode) {
		const resolvers = pendingActions.get(shareCode) ?? [];
		pendingActions.set(shareCode, []);
		resolvers.forEach((resolve) => resolve());
		emit();
	},
	setEngagement(enabled: boolean, shareCode = activeShareCode) {
		const game = gameByShareCode(shareCode);
		game.engagement = enabled;
		emit();
	},
	/** Slots the NEXT rewarded play's outcome identity (typed synthetic
	 * control): a mapped item id, a duplicate-label sibling id, or an
	 * UNMAPPED id for the truthful-fallback robustness case. */
	setRewardSegmentKey(segmentKey: string | null, shareCode = activeShareCode) {
		const game = gameByShareCode(shareCode);
		game.activeRewardSegmentKey = segmentKey ?? undefined;
		emit();
	},
	setStock(value: number, shareCode = activeShareCode) {
		backendFor(shareCode).stock = value;
		emit();
	},
	/** Models the play completing OUTSIDE this client (another device/tab):
	 * the active session completes server-side with the standard outcome,
	 * never marking it as played here. */
	completeSessionRemotely(shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		const game = gameByShareCode(shareCode);
		const session = Object.values(backend.sessions).find(
			(candidate) => candidate.status === "active",
		);
		if (!session) return;
		session.status = "completed";
		session.playedHere = false;
		if (game.engagement || backend.stock <= 0) {
			session.outcome = {
				kind: "no-reward", rewardType: "none", label: game.noRewardLabel,
				amount: null, canClaim: false, segmentKey: game.noRewardKey,
			};
		} else {
			backend.stock -= 1;
			session.secretCode = game.voucherSecret;
			session.outcome = {
				kind: "reward", rewardType: "voucher", label: "Voucher quà tặng",
				amount: null, canClaim: true,
				segmentKey: game.rewardSegmentKey ?? "voucher-pool",
			};
		}
		emit();
	},
	counters(shareCode = activeShareCode) {
		const backend = backendFor(shareCode);
		const { opens, starts, plays, claims, admissionCount, stock } = backend;
		return { opens, starts, plays, claims, admissionCount, stock };
	},
	createdSessions(shareCode = activeShareCode) {
		return Object.values(backendFor(shareCode).sessions).map((session) => ({
			sessionId: session.sessionId,
			sessionToken: session.sessionToken,
			startKey: session.startKey,
			status: session.status,
			claimed: session.claimed,
		}));
	},
	session(shareCode: string, sessionId: string) {
		const session = backendFor(shareCode).sessions[sessionId];
		return session
			? { ...session, outcome: undefined }
			: null;
	},
	lastClaim() {
		const claim = [...recordedParticipantCalls]
			.reverse()
			.find((call) => call.name === "publicPlay:claimPublicReward");
		return claim
			? { sessionId: claim.sessionId, sessionToken: claim.sessionToken }
			: null;
	},
	lastPlay() {
		const play = [...recordedParticipantCalls]
			.reverse()
			.find((call) => call.name === "publicPlay:playSessionAction");
		return play
			? { sessionId: play.sessionId, sessionToken: play.sessionToken }
			: null;
	},
	calls(name: string) {
		return structuredClone(recordedParticipantCalls.filter((call) => call.name === name));
	},
	probeOutcome(args: { sessionId: string; sessionToken: string }, shareCode = activeShareCode) {
		const snapshot = { resultReady: backendFor(shareCode).resultReady };
		try {
			return {
				...snapshot,
				result: participantQuery("publicPlay:getPublicSessionOutcome", args),
			};
		} catch (error) {
			return { ...snapshot, error: String(error) };
		}
	},
};

if (typeof window !== "undefined") {
	(window as any).__participantFixture = participantFixtureApi;
}
