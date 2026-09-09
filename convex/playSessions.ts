import type { Id } from "./_generated/dataModel";
import { DEFAULT_GAME_TEMPLATE_ID, type GameTemplateId } from "../lib/gameTemplates";

export type LegacyDrawSessionId = Id<"drawSessions">;

export type LiXiPlaySessionIdentity = {
	gameTemplateId: GameTemplateId;
	legacyDrawSessionId: LegacyDrawSessionId;
	playSessionId: LegacyDrawSessionId;
	status: "pending" | "redeemed" | "cancelled";
};

export type LiXiPublicPlaySession = {
	gameTemplateId: GameTemplateId;
	playSessionStatus: "pending";
};

export function liXiPlaySessionIdentity(
	sessionId: LegacyDrawSessionId,
	status: LiXiPlaySessionIdentity["status"],
): LiXiPlaySessionIdentity {
	return {
		gameTemplateId: DEFAULT_GAME_TEMPLATE_ID,
		legacyDrawSessionId: sessionId,
		playSessionId: sessionId,
		status,
	};
}

export function liXiPublicPlaySession(): LiXiPublicPlaySession {
	return {
		gameTemplateId: DEFAULT_GAME_TEMPLATE_ID,
		playSessionStatus: "pending",
	};
}

export function publicPlayPathForCode(publicCode: string) {
	return `/play/${publicCode}`;
}
