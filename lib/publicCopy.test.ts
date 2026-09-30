import { describe, expect, test } from "vitest";
import {
	DEFAULT_PUBLIC_CLAIM_INSTRUCTIONS,
	DEFAULT_PUBLIC_THANK_YOU_MESSAGE,
	PUBLIC_COPY_BOUNDS,
	luckyWheelDefaultGameConfig,
	liXiDefaultGameConfig,
	quizDefaultGameConfig,
	resolvePublicCopyField,
	scratchCardDefaultGameConfig,
	slotRevealDefaultGameConfig,
} from "./gameTemplates";

describe("public copy defaults", () => {
	test("the built-in thank-you and claim-instruction strings are exact", () => {
		// Guest fallbacks and server defaults must keep these exact strings:
		// configs written before the fields existed must render unchanged.
		expect(DEFAULT_PUBLIC_THANK_YOU_MESSAGE).toBe(
			"Cảm ơn bạn đã tham gia trải nghiệm của chúng tôi!",
		);
		expect(DEFAULT_PUBLIC_CLAIM_INSTRUCTIONS).toBe(
			"Lưu lại mã này để đổi thưởng với nhân viên chiến dịch.",
		);
	});

	test("resolvePublicCopyField falls back on empty, blank, and absent values", () => {
		const fallback = "FALLBACK";
		expect(resolvePublicCopyField(null, fallback)).toBe(fallback);
		expect(resolvePublicCopyField(undefined, fallback)).toBe(fallback);
		expect(resolvePublicCopyField("", fallback)).toBe(fallback);
		expect(resolvePublicCopyField("   \n\t ", fallback)).toBe(fallback);
		expect(resolvePublicCopyField("Tuỳ chỉnh", fallback)).toBe("Tuỳ chỉnh");
		// A configured value is trimmed, not rewritten.
		expect(resolvePublicCopyField("  Tuỳ chỉnh  ", fallback)).toBe("Tuỳ chỉnh");
	});

	test("every template's default config carries the two new copy fields as empty", () => {
		const templates = [
			liXiDefaultGameConfig,
			luckyWheelDefaultGameConfig,
			scratchCardDefaultGameConfig,
			slotRevealDefaultGameConfig,
			quizDefaultGameConfig,
		] as Array<{ publicCopy: Record<string, unknown> }>;
		for (const template of templates) {
			expect(template.publicCopy.thankYouMessage).toBe("");
			expect(template.publicCopy.claimInstructions).toBe("");
		}
	});
});

describe("public copy bounds", () => {
	test("the two new fields are bounded consistently with the existing fields", () => {
		expect(PUBLIC_COPY_BOUNDS.thankYouMessage).toBe(PUBLIC_COPY_BOUNDS.waitingMessage);
		expect(PUBLIC_COPY_BOUNDS.claimInstructions).toBe(PUBLIC_COPY_BOUNDS.subtitle);
	});

	test("normalizePublicCopy truncates overlong new fields and trims whitespace", async () => {
		const { buildLuckyWheelGameConfig } = await import("./gameTemplates");
		const longThankYou = "X".repeat(PUBLIC_COPY_BOUNDS.thankYouMessage + 50);
		const longInstructions = `  ${"Y".repeat(PUBLIC_COPY_BOUNDS.claimInstructions + 50)}  `;
		const config = buildLuckyWheelGameConfig({
			noRewardWeight: 0,
			publicCopy: {
				thankYouMessage: longThankYou,
				claimInstructions: longInstructions,
			},
		});
		expect(config.publicCopy.thankYouMessage).toHaveLength(PUBLIC_COPY_BOUNDS.thankYouMessage);
		expect(config.publicCopy.claimInstructions ?? "").toHaveLength(
			PUBLIC_COPY_BOUNDS.claimInstructions,
		);
		expect((config.publicCopy.claimInstructions ?? "").startsWith("Y")).toBe(true);
	});

	test("blank new fields normalize to empty so the built-in default renders", async () => {
		const { buildQuizGameConfig } = await import("./gameTemplates");
		const config = buildQuizGameConfig({
			publicCopy: {
				thankYouMessage: "   ",
				claimInstructions: "\t",
			},
		});
		expect(config.publicCopy.thankYouMessage).toBe("");
		expect(config.publicCopy.claimInstructions ?? "").toBe("");
		// Empty configured copy renders the built-in default.
		expect(
			resolvePublicCopyField(
				config.publicCopy.thankYouMessage,
				DEFAULT_PUBLIC_THANK_YOU_MESSAGE,
			),
		).toBe(DEFAULT_PUBLIC_THANK_YOU_MESSAGE);
	});
});
