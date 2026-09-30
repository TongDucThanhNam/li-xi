// Station backend for the ACTUAL StationPlayFeature (+ StationSelfServePlay):
// synthetic campaigns/stationPlay/publicPlay/auth functions with
// deterministic data, recorded calls, and sessionStorage persistence
// (`station-backend:` — deliberately separate from the product's
// localStorage) so reload-recovery flows behave like the real query. The
// namespaced ids (`station-game-*`, `station-session-*`) are routed from
// fixtures/convex-mock.ts so the operator and participant backends stay
// untouched. UI integration scope only; this is NOT a real backend.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bumpVersion } from "./convex-mock";

type StationScenario = "wheel" | "scratch" | "quiz" | "lixi";

type StationGame = {
	scenario: StationScenario;
	campaignGameId: string;
	templateId: "lucky-wheel" | "scratch-card" | "quiz" | "li-xi";
	gameName: string;
	headline: string;
	startCtaLabel: string;
	segments: Array<{ key: string; label: string }>;
	noRewardLabel: string;
	secretCode: string;
	coverStyle: string;
	revealThresholdPercent: number;
	/** Live per-game slot images (4d-3); absent/empty renders fallbacks. */
	assetUrls?: Record<string, string>;
};

type StationSession = {
	sessionId: string;
	sessionToken: string;
	status: "active" | "completed";
	claimed: boolean;
	/** Collect/dismiss acknowledgment; mirrors playSessions.resultAcknowledgedAt. */
	acknowledged: boolean;
	secretCode: string | null;
	outcome: {
		kind: "reward" | "no-reward";
		rewardType: "cash" | "voucher" | "physical" | "points" | "none";
		label: string;
		amount: number | null;
		canClaim: boolean;
		segmentKey: string | null;
	} | null;
};

type StationBackend = {
	soldOut: boolean;
	stock: number;
	admissionCount: number;
	session: StationSession | null;
	/** In-memory only: each page load is a new waiting mount by design. */
	opens: string[];
	/** Response timing control for the start admission (not persisted). */
	startPending: boolean;
	/**
	 * Response timing control for the collect acknowledgment (not
	 * persisted): "pending" holds the write in flight, "failing" rejects it.
	 */
	ackMode: "immediate" | "pending" | "failing";
	/**
	 * Play-window simulation (not persisted): mirrors the real
	 * getStationPlayState schedule payload and start admission gate.
	 */
	scheduleState: "open" | "not-started" | "ended";
	/** The relevant bound time for the simulated window state. */
	scheduledAt: number | null;
};

const GAMES: Record<string, StationGame> = {
	wheel: {
		scenario: "wheel",
		campaignGameId: "station-game-wheel",
		templateId: "lucky-wheel",
		gameName: "Vòng quay trạm UI",
		headline: "Vòng quay tri ân",
		startCtaLabel: "Quay ngay",
		segments: [{ key: "station-voucher", label: "Voucher quà tặng" }],
		noRewardLabel: "Chúc bạn may mắn",
		secretCode: "STATION-WHEEL-CODE",
		coverStyle: "gold",
		revealThresholdPercent: 55,
	},
	scratch: {
		scenario: "scratch",
		campaignGameId: "station-game-scratch",
		templateId: "scratch-card",
		gameName: "Thẻ cào trạm UI",
		headline: "Thẻ cào tri ân",
		startCtaLabel: "Bắt đầu",
		segments: [],
		noRewardLabel: "Chúc bạn may mắn",
		secretCode: "STATION-SCRATCH-CODE",
		coverStyle: "gold",
		// One deliberate stroke crosses this threshold.
		revealThresholdPercent: 10,
	},
	quiz: {
		scenario: "quiz",
		campaignGameId: "station-game-quiz",
		templateId: "quiz",
		gameName: "Trắc nghiệm trạm UI",
		headline: "Trắc nghiệm tri ân",
		startCtaLabel: "Bắt đầu",
		segments: [],
		noRewardLabel: "Chưa đạt",
		secretCode: "STATION-QUIZ-CODE",
		coverStyle: "gold",
		revealThresholdPercent: 55,
	},
	// Legacy li-xi budget station: the host hands each session over from the
	// operator console and this screen plays the pending draw session
	// reactively through draw:getStationState / draw:redeem.
	lixi: {
		scenario: "lixi",
		campaignGameId: "station-game-lixi",
		templateId: "li-xi",
		gameName: "Lì xì trạm UI",
		headline: "Lì xì tri ân",
		startCtaLabel: "Những chiếc phong bao đó",
		segments: [],
		noRewardLabel: "",
		secretCode: "",
		coverStyle: "gold",
		revealThresholdPercent: 55,
	},
};

const HOST_PIN = "246810";

/** Station fixture campaign id — the shared dispatcher routes on it. */
export const STATION_CAMPAIGN_ID = "campaign-station";

function defaultBackend(): StationBackend {
	return {
		soldOut: false,
		stock: 4,
		admissionCount: 0,
		session: null,
		opens: [],
		startPending: false,
		ackMode: "immediate",
		scheduleState: "open",
		scheduledAt: null,
	};
}

const backends = new Map<string, StationBackend>();
const recordedStationCalls: Array<Record<string, any>> = [];
const pendingStarts: Array<() => void> = [];
const pendingAcks: Array<() => void> = [];

function saveBackend(campaignGameId: string) {
	if (typeof sessionStorage === "undefined") return;
	const backend = backends.get(campaignGameId);
	if (!backend) return;
	const persisted = {
		soldOut: backend.soldOut,
		stock: backend.stock,
		admissionCount: backend.admissionCount,
		session: backend.session,
	};
	sessionStorage.setItem(
		`station-backend:${campaignGameId}`,
		JSON.stringify(persisted),
	);
}

function restoreBackend(campaignGameId: string): StationBackend | null {
	if (typeof sessionStorage === "undefined") return null;
	const stored = sessionStorage.getItem(`station-backend:${campaignGameId}`);
	if (!stored) return null;
			try {
			const parsed = JSON.parse(stored) as Partial<StationBackend>;
			return {
				soldOut: Boolean(parsed.soldOut),
				stock: Number(parsed.stock ?? 4),
				admissionCount: Number(parsed.admissionCount ?? 0),
				session: parsed.session ?? null,
				opens: [],
				startPending: false,
				// The acknowledgment timing simulation is deliberately not persisted.
				ackMode: "immediate",
				// The window simulation is deliberately not persisted.
				scheduleState: "open",
				scheduledAt: null,
			};
		} catch {
			return null;
		}
	}

function backendFor(campaignGameId: string): StationBackend {
	let backend = backends.get(campaignGameId);
	if (!backend) {
		backend = restoreBackend(campaignGameId) ?? defaultBackend();
		backends.set(campaignGameId, backend);
	}
	return backend;
}

function gameFor(campaignGameId: string): StationGame | null {
	return (
		Object.values(GAMES).find((game) => game.campaignGameId === campaignGameId) ??
		null
	);
}

/** Station ids are namespaced so the shared dispatcher can route safely. */
export function isStationCampaignGameId(campaignGameId: unknown): boolean {
	return typeof campaignGameId === "string" && campaignGameId.startsWith("station-game-");
}

export function isStationSessionId(sessionId: unknown): boolean {
	return typeof sessionId === "string" && sessionId.startsWith("station-session-");
}

function campaignContext(game: StationGame) {
	return {
		campaign: {
			id: STATION_CAMPAIGN_ID,
			name: "Chiến dịch trạm UI",
			slug: "station-ui",
			brandName: "Brand Station",
			description: "Fixture station campaign",
			claimHeadline: "",
			claimSubtitle: "",
			claimCtaLabel: "",
			claimCollectLabel: "",
			claimWaitingMessage: "",
			theme: "brand",
			gameTemplateId: game.templateId,
			status: "active",
			heroAsset: null,
			heroAssetUrl: null,
			createdAt: 1,
			updatedAt: 1,
		},
		campaignGame: {
			id: game.campaignGameId,
			campaignId: STATION_CAMPAIGN_ID,
			templateId: game.templateId,
			name: game.gameName,
			config: {
				templateId: game.templateId,
				// Legacy li-xi budget games draw from the campaign budget; the
				// self-serve station templates draw from campaign inventory.
				rewardSource:
					game.templateId === "li-xi" ? "campaign-budget" : "campaign-inventory",
				rewardMode: "rewarded",
				noRewardWeight: 0,
				noRewardLabel: game.noRewardLabel,
				rewardPoolTag: "default",
				...(game.templateId === "scratch-card"
					? { coverStyle: game.coverStyle, revealThresholdPercent: game.revealThresholdPercent }
					: {}),
				publicCopy: {
					headline: game.headline,
					subtitle: "Fixture station subtitle",
					startCtaLabel: game.startCtaLabel,
					collectCtaLabel: "Nhận quà",
					waitingMessage: "Chờ lượt tiếp theo",
				},
			},
			playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
			status: "active",
			createdAt: 1,
			updatedAt: 1,
		},
	};
}

function publicCopyFor(game: StationGame) {
	return {
		headline: game.headline,
		subtitle: "Fixture station subtitle",
		startCtaLabel: game.startCtaLabel,
		collectCtaLabel: "Nhận quà",
		waitingMessage: "Chờ lượt tiếp theo",
	};
}

function playContextFor(game: StationGame) {
	if (game.templateId === "lucky-wheel") {
		return {
			noRewardLabel: game.noRewardLabel,
			segments: game.segments,
			noRewardKey: "__no-reward__",
		};
	}
	if (game.templateId === "scratch-card") {
		return {
			coverStyle: game.coverStyle,
			revealThresholdPercent: game.revealThresholdPercent,
		};
	}
	return null;
}

export function stationQuery(name: string, args: any) {
	if (name === "campaigns:getCampaignGameRouteContext") {
		const game = gameFor(args.campaignGameId);
		if (!game) return null;
		return campaignContext(game);
	}
	if (
		name === "draw:getStationState" &&
		args?.campaignId === STATION_CAMPAIGN_ID
	) {
		// The legacy li-xi station screen reads the operator-created draw
		// session; the query carries only the campaign id, so the game comes
		// from the fixture's single li-xi scenario.
		const game = gameFor("station-game-lixi");
		if (!game || game.templateId !== "li-xi") {
			throw new Error(`Unsupported synthetic station query: ${name}`);
		}
		// Mirrors convex/draw.ts getStationState: an open pending session the
		// operator created, with a capacity-preserving reward pool view.
		const lixiCampaign = {
			name: "Chiến dịch trạm UI",
			brandName: "Brand Station",
			description: "Fixture station campaign",
			claimHeadline: game.headline,
			claimSubtitle: "Fixture station subtitle",
			claimCtaLabel: game.startCtaLabel,
			claimCollectLabel: "Nhận quà",
			claimWaitingMessage: "Đang chờ lượt chơi tiếp theo",
			theme: "lunar",
			heroAssetUrl: null,
		};
		return {
			hasSetup: true,
			budget: { totalBudget: 500000, remainingBudget: 380000 },
			activeCampaign: { id: STATION_CAMPAIGN_ID, ...lixiCampaign },
			availableUnits: 4,
			budgetItems: [],
			pendingSession: {
				gameTemplateId: "li-xi",
				legacyDrawSessionId: "station-session-lixi-1",
				playSessionId: "station-session-lixi-1",
				status: "pending",
				id: "station-session-lixi-1",
				publicCode: null,
				sharePath: null,
				publicPlayPath: null,
				guestNameDisplay: "Khách trạm",
				campaign: lixiCampaign,
				rewardPool: [
					{ amount: 50000, rarity: "common", remainingQuantity: 2 },
					{ amount: 100000, rarity: "rare", remainingQuantity: 1 },
					{ amount: 200000, rarity: "legend", remainingQuantity: 1 },
				],
				createdAt: 1,
			},
			pendingLinkSessions: [],
			recentRedemptions: [],
		};
	}

	const campaignGameId: string = args.campaignGameId;
	const game = gameFor(campaignGameId);
	if (!game) throw new Error(`Unknown synthetic station game: ${campaignGameId}`);
	const backend = backendFor(campaignGameId);

	if (name === "stationPlay:getStationPlayState") {
		const session = backend.session;
		// Recoverable: completed rewarded result the host has not collected
		// ("Hoàn tất") or PIN-dismissed — mirrors convex/stationPlay.ts.
		const recoverableOutcome = session?.outcome ?? null;
		const recoverable =
			session && session.status === "completed" && !session.acknowledged && recoverableOutcome
				? {
						sessionId: session.sessionId,
						sessionToken: session.sessionToken,
						participantDisplayName: null,
						completedAt: 1,
						outcome: {
							...recoverableOutcome,
							canClaim: recoverableOutcome.kind === "reward" && !session.claimed,
						},
						claim:
							session.claimed && recoverableOutcome.kind === "reward"
								? {
										label: recoverableOutcome.label,
										rewardType: recoverableOutcome.rewardType,
										amount: recoverableOutcome.amount,
										secretCode: session.secretCode,
										instructions: "Hướng dẫn nhận thưởng (fixture).",
									}
								: null,
						copy: publicCopyFor(game),
						playContext: playContextFor(game),
					}
				: null;
		return {
			state: "open",
			campaignGameId,
			templateId: game.templateId,
			gameName: game.gameName,
			campaign: {
				name: "Chiến dịch trạm UI",
				brandName: "Brand Station",
				description: "Fixture station campaign",
				heroAssetUrl: null,
			},
			copy: publicCopyFor(game),
			assetUrls: game.assetUrls ? { ...game.assetUrls } : {},
			schedule: {
				startsAt: backend.scheduleState === "not-started" ? backend.scheduledAt : null,
				endsAt: backend.scheduleState === "ended" ? backend.scheduledAt : null,
				state: backend.scheduleState,
			},
			availability: { soldOut: backend.soldOut },
			inventory: [
				{
					id: "station-inv-1",
					name: "Voucher quà tặng",
					rewardType: "voucher",
					quantityTotal: 4,
					quantityRemaining: backend.stock,
				},
			],
			playSession:
				session && session.status === "active"
					? {
							sessionId: session.sessionId,
							sessionToken: session.sessionToken,
							participantDisplayName: null,
							copy: publicCopyFor(game),
							playContext: playContextFor(game),
						}
					: null,
			recoverable,
		};
	}
	throw new Error(`Unsupported synthetic station query: ${name}`);
}

export function stationMutation(name: string, args: any) {
	recordedStationCalls.push(JSON.parse(JSON.stringify({ name, ...args })));

	if (name === "auth:verifyHostPin") {
		if (args.pin !== HOST_PIN) {
			throw new Error("PIN host không đúng");
		}
		return { verified: true };
	}

	if (name === "draw:redeem") {
		// Legacy li-xi station reveal: the FortuneStage only consumes
		// amount/rarity; the local collect state resets the stage.
		return { amount: 50000, rarity: "common", redemptionId: "station-redemption-lixi-1" };
	}

	if (name === "stationPlay:recordStationPlayOpen") {
		const backend = backendFor(args.campaignGameId);
		if (!backend.opens.includes(args.openKey)) {
			backend.opens.push(args.openKey);
		}
		bumpVersion();
		return { recorded: true };
	}

	if (name === "stationPlay:acknowledgeStationPlayResult") {
		const backend = backendFor(args.campaignGameId);
		if (backend.ackMode === "failing") {
			throw new Error("Acknowledge unavailable (fixture)");
		}
		const located = locateOwnedSession(args.sessionId);
		const session = located.session;
		if (session.status !== "completed") {
			throw new Error("Chỉ có thể hoàn tất kết quả của lượt chơi đã hoàn thành");
		}
		const finishAck = () => {
			session.acknowledged = true;
			saveBackend(located.campaignGameId);
			bumpVersion();
		};
		if (backend.ackMode === "pending") {
			// Held in flight: the write has NOT landed until deliverAck().
			return new Promise((resolve) => {
				pendingAcks.push(() => {
					finishAck();
					resolve({ acknowledged: true });
				});
			});
		}
		finishAck();
		return { acknowledged: true };
	}

	if (name === "stationPlay:dismissStationPlayResult") {
		if (args.pin !== HOST_PIN) {
			throw new Error("PIN host không đúng");
		}
		const located = locateOwnedSession(args.sessionId);
		const session = located.session;
		if (session.status !== "completed") {
			throw new Error("Chỉ có thể bỏ kết quả của lượt chơi đã hoàn thành");
		}
		session.acknowledged = true;
		saveBackend(located.campaignGameId);
		bumpVersion();
		return { dismissed: true };
	}

	const campaignGameId: string = args.campaignGameId;
	const game = gameFor(campaignGameId);
	if (!game) throw new Error(`Unknown synthetic station game: ${campaignGameId}`);
	const backend = backendFor(campaignGameId);

	if (name === "stationPlay:startStationPlaySession") {
		// Idempotent resume wins over the window (mirrors the real order:
		// an already-admitted session may finish after the window closes);
		// only NEW admissions hit the play-window gate below.
		if (backend.session && backend.session.status === "active") {
			bumpVersion();
			return {
				sessionId: backend.session.sessionId,
				sessionToken: backend.session.sessionToken,
				participantDisplayName: null,
				resumed: true,
				templateId: game.templateId,
			};
		}
		// Admission-time window gate, mirroring convex/stationPlay.ts +
		// lib/schedulePolicy.ts (server authority for new sessions).
		if (backend.scheduleState === "not-started") {
			throw new Error(
				backend.scheduledAt !== null
					? `Trò chơi chưa mở cửa sổ chơi (mở lúc ${new Date(backend.scheduledAt).toLocaleString("vi-VN")})`
					: "Trò chơi chưa mở cửa sổ chơi",
			);
		}
		if (backend.scheduleState === "ended") {
			throw new Error("Trò chơi đã kết thúc cửa sổ chơi");
		}
		backend.admissionCount += 1;
		const sessionId = `station-session-${backend.admissionCount}`;
		backend.session = {
			sessionId,
			sessionToken: `${sessionId}-token`,
			status: "active",
			claimed: false,
			acknowledged: false,
			secretCode: null,
			outcome: null,
		};
		saveBackend(campaignGameId);
		if (backend.startPending) {
			return new Promise((resolve) => {
				pendingStarts.push(() => {
					saveBackend(campaignGameId);
					bumpVersion();
					resolve({
						sessionId,
						sessionToken: `${sessionId}-token`,
						participantDisplayName: null,
						resumed: false,
						templateId: game.templateId,
					});
				});
			});
		}
		saveBackend(campaignGameId);
		bumpVersion();
		return {
			sessionId,
			sessionToken: `${sessionId}-token`,
			participantDisplayName: null,
			resumed: false,
			templateId: game.templateId,
		};
	}

	throw new Error(`Unsupported synthetic station mutation: ${name}`);
}

/** publicPlay actions bound to a station-session capability. */
export function stationPlayAction(args: any) {
	recordedStationCalls.push(JSON.parse(JSON.stringify({ name: "publicPlay:playSessionAction", ...args })));
	const located = locateSession(args.sessionId, args.sessionToken);
	const backend = located.backend;
	const session = located.session;
	const game = Object.values(GAMES).find(
		(entry) => entry.campaignGameId === located.campaignGameId,
	);
	if (session.status === "completed" && session.outcome) {
		bumpVersion();
		return { outcome: session.outcome };
	}
	if (args.action?.type !== "spin" && args.action?.type !== "scratch-reveal") {
		throw new Error("Unsupported synthetic station action");
	}
	backend.stock -= 1;
	session.status = "completed";
	session.secretCode = game?.secretCode ?? "STATION-CODE";
	session.outcome = {
		kind: "reward",
		rewardType: "voucher",
		label: "Voucher quà tặng",
		amount: null,
		canClaim: true,
		segmentKey: game?.segments[0]?.key ?? "station-voucher",
	};
	saveBackend(located.campaignGameId);
	bumpVersion();
	return { outcome: session.outcome };
}

export function stationClaimAction(args: any) {
	recordedStationCalls.push(JSON.parse(JSON.stringify({ name: "publicPlay:claimPublicReward", ...args })));
	const located = locateSession(args.sessionId, args.sessionToken);
	const session = located.session;
	const alreadyClaimed = session.claimed;
	session.claimed = true;
	saveBackend(located.campaignGameId);
	bumpVersion();
	return {
		claim: {
			label: session.outcome?.label ?? "Voucher quà tặng",
			rewardType: "voucher",
			amount: null,
			secretCode: session.secretCode,
			instructions: "Hướng dẫn nhận thưởng (fixture).",
		},
		alreadyClaimed,
	};
}

function locateSession(sessionId: string, sessionToken: string): {
	campaignGameId: string;
	backend: StationBackend;
	session: StationSession;
} {
	for (const [campaignGameId, backend] of backends) {
		const session = backend.session;
		if (session?.sessionId === sessionId) {
			if (session.sessionToken !== sessionToken) {
				throw new Error("Invalid synthetic station capability");
			}
			return { campaignGameId, backend, session };
		}
	}
	// A reloaded page restores backends lazily: pull every known game's
	// persisted backend before giving up.
	for (const candidate of Object.values(GAMES)) {
		const backend = backendFor(candidate.campaignGameId);
		const session = backend.session;
		if (session?.sessionId === sessionId) {
			if (session.sessionToken !== sessionToken) {
				throw new Error("Invalid synthetic station capability");
			}
			return { campaignGameId: candidate.campaignGameId, backend, session };
		}
	}
	throw new Error("Invalid synthetic station capability");
}

/** Owner-authorized lookup (no capability): acknowledge/dismiss paths. */
function locateOwnedSession(sessionId: string): {
	campaignGameId: string;
	backend: StationBackend;
	session: StationSession;
} {
	for (const [campaignGameId, backend] of backends) {
		const session = backend.session;
		if (session?.sessionId === sessionId) {
			return { campaignGameId, backend, session };
		}
	}
	for (const candidate of Object.values(GAMES)) {
		const backend = backendFor(candidate.campaignGameId);
		const session = backend.session;
		if (session?.sessionId === sessionId) {
			return { campaignGameId: candidate.campaignGameId, backend, session };
		}
	}
	throw new Error("Không tìm thấy trò chơi");
}

/** Programmatic controls for Playwright: data and timing only. */
export type StationFixtureApi = {
	games: Record<"wheel" | "scratch" | "quiz", string>;
	setSoldOut(soldOut: boolean, campaignGameId?: string): void;
	setStartPending(pending: boolean, campaignGameId?: string): void;
	/**
	 * Simulates the collect acknowledgment timing: "pending" holds the write
	 * in flight until deliverAck(), "failing" rejects it, "immediate" (the
	 * default) resolves normally.
	 */
	setAckMode(
		mode: "immediate" | "pending" | "failing",
		campaignGameId?: string,
	): void;
	deliverAck(campaignGameId?: string): void;
	/**
	 * Simulates the play window ("open" restores normal admission): drives
	 * both the state payload and the start admission gate.
	 */
	setScheduleState(
		state: "open" | "not-started" | "ended",
		scheduledAt?: number,
		campaignGameId?: string,
	): void;
	setAssetUrls(urls: Record<string, string> | null, campaignGameId?: string): void;
	deliverStart(campaignGameId?: string): void;
	pin(): string;
	wrongPin(): string;
	counters(campaignGameId: string): {
		opens: number;
		admissionCount: number;
		stock: number;
		sessionStatus: string | null;
	};
	calls(name: string): Array<Record<string, unknown>>;
};

export const stationFixtureApi: StationFixtureApi = {
	games: {
		wheel: GAMES.wheel.campaignGameId,
		scratch: GAMES.scratch.campaignGameId,
		quiz: GAMES.quiz.campaignGameId,
	},
	setSoldOut(soldOut, campaignGameId = GAMES.wheel.campaignGameId) {
		backendFor(campaignGameId).soldOut = soldOut;
		saveBackend(campaignGameId);
		bumpVersion();
	},
	setStartPending(pending, campaignGameId = GAMES.wheel.campaignGameId) {
		backendFor(campaignGameId).startPending = pending;
		bumpVersion();
	},
	setAckMode(
		mode: "immediate" | "pending" | "failing",
		campaignGameId = GAMES.wheel.campaignGameId,
	) {
		backendFor(campaignGameId).ackMode = mode;
		bumpVersion();
	},
	deliverAck(campaignGameId = GAMES.wheel.campaignGameId) {
		void campaignGameId;
		const resolve = pendingAcks.shift();
		resolve?.();
	},
	setScheduleState(
		state: "open" | "not-started" | "ended",
		scheduledAt: number | undefined = undefined,
		campaignGameId = GAMES.wheel.campaignGameId,
	) {
		const backend = backendFor(campaignGameId);
		backend.scheduleState = state;
		backend.scheduledAt = state === "open" ? null : scheduledAt ?? null;
		bumpVersion();
	},
	setAssetUrls(urls: Record<string, string> | null, campaignGameId = GAMES.wheel.campaignGameId) {
		const game = Object.values(GAMES).find(
			(candidate) => candidate.campaignGameId === campaignGameId,
		);
		if (!game) return;
		game.assetUrls = urls ?? undefined;
		bumpVersion();
	},
	deliverStart(campaignGameId = GAMES.wheel.campaignGameId) {
		void campaignGameId;
		const resolve = pendingStarts.shift();
		resolve?.();
	},
	pin() {
		return HOST_PIN;
	},
	wrongPin() {
		return "000000";
	},
	counters(campaignGameId) {
		const backend = backendFor(campaignGameId);
		return {
			opens: backend.opens.length,
			admissionCount: backend.admissionCount,
			stock: backend.stock,
			sessionStatus: backend.session?.status ?? null,
		};
	},
	calls(name) {
		return structuredClone(recordedStationCalls.filter((call) => call.name === name));
	},
};

if (typeof window !== "undefined") {
	(window as unknown as { __stationFixture: StationFixtureApi }).__stationFixture =
		stationFixtureApi;
}
