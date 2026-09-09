import { describe, expect, test } from "vitest";
import {
	liXiPlaySessionIdentity,
	liXiPublicPlaySession,
	publicPlayPathForCode,
} from "./playSessions";
import type { Id } from "./_generated/dataModel";

describe("li xi play-session compatibility", () => {
	test("new public links use the canonical play route", () => {
		expect(publicPlayPathForCode("abcdefabcdefabcdefabcdef")).toBe(
			"/play/abcdefabcdefabcdefabcdef",
		);
	});

	test("legacy draw identity remains behind the play-session wrapper", () => {
		const sessionId = "test-draw-session" as Id<"drawSessions">;
		expect(liXiPlaySessionIdentity(sessionId, "pending")).toEqual({
			gameTemplateId: "li-xi",
			legacyDrawSessionId: sessionId,
			playSessionId: sessionId,
			status: "pending",
		});
		expect(liXiPublicPlaySession()).toEqual({
			gameTemplateId: "li-xi",
			playSessionStatus: "pending",
		});
	});
});
