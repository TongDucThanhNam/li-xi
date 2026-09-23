import { describe, expect, test } from "vitest";
import { buildLuckyWheelGameConfig, DEFAULT_PLAY_LIMITS } from "./gameTemplates";
import {
	finiteNumberOr,
	isEditorDirty,
	optionalFiniteNumberOrNull,
	serializeEditorDraft,
	type GameEditorDraft,
} from "./gameEditorState";

const wheelConfig = buildLuckyWheelGameConfig({ noRewardWeight: 0 });

function draft(overrides: Partial<GameEditorDraft> = {}): GameEditorDraft {
	return {
		config: wheelConfig,
		gameStatus: "draft",
		playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
		...overrides,
	};
}

describe("complete editor draft baseline", () => {
	test("the baseline serializes the whole editable draft, not only config", () => {
		const serialized = serializeEditorDraft(draft());
		expect(serialized).toContain('"draft"');
		expect(serialized).toContain("maxSessionsPerParticipant");
		// Same draft always serializes identically (load/switch init contract).
		expect(serializeEditorDraft(draft())).toBe(serialized);
	});

	test("a status-only change makes the editor dirty", () => {
		// The reproduced defect: baseline/dirty compared config only, so
		// activating a game never enabled Save.
		const baseline = serializeEditorDraft(draft());
		expect(isEditorDirty(draft({ gameStatus: "active" }), baseline)).toBe(true);
		expect(isEditorDirty(draft(), baseline)).toBe(false);
	});

	test("a limit-only change makes the editor dirty and reverting restores clean", () => {
		const baseline = serializeEditorDraft(draft());
		const limited = draft({
			playLimits: { maxSessionsPerParticipant: 3, maxTotalSessions: 500 },
		});
		expect(isEditorDirty(limited, baseline)).toBe(true);
		// Reverting to the loaded values is clean again.
		expect(isEditorDirty(draft(), baseline)).toBe(false);
	});

	test("a config-only change still makes the editor dirty", () => {
		const baseline = serializeEditorDraft(draft());
		expect(
			isEditorDirty(
				draft({ config: buildLuckyWheelGameConfig({ noRewardWeight: 50 }) }),
				baseline,
			),
		).toBe(true);
	});

	test("a slower save never marks a newer unsaved edit clean", () => {
		// Save captures the snapshot it is persisting; edits made while the
		// mutation is in flight must stay dirty after the save resolves.
		const loadedBaseline = serializeEditorDraft(draft());
		const savedSnapshot = serializeEditorDraft(
			draft({ gameStatus: "active" }),
		);
		const newerEdit = draft({
			gameStatus: "active",
			playLimits: { maxSessionsPerParticipant: 2, maxTotalSessions: null },
		});
		expect(isEditorDirty(newerEdit, savedSnapshot)).toBe(true);
		// A draft reverted to the saved state is clean.
		expect(
			isEditorDirty(draft({ gameStatus: "active" }), savedSnapshot),
		).toBe(false);
		// The loaded baseline is untouched by the save.
		expect(isEditorDirty(draft(), loadedBaseline)).toBe(false);
	});

	test("a blank optional limit serializes without NaN leaking into the draft", () => {
		const blank = draft({
			playLimits: { maxSessionsPerParticipant: 1, maxTotalSessions: null },
		});
		const serialized = serializeEditorDraft(blank);
		expect(serialized).not.toContain("NaN");
		// A stored NaN would silently serialize as null and corrupt dirty
		// detection; the editor must never hold one.
		expect(serializeEditorDraft(draft())).toBe(serialized);
	});
});

describe("numeric field NaN semantics", () => {
	test("required fields keep their previous bounded value on cleared input", () => {
		expect(finiteNumberOr(Number.NaN, 5)).toBe(5);
		expect(finiteNumberOr(Number.POSITIVE_INFINITY, 1)).toBe(1);
		expect(finiteNumberOr(0, 5)).toBe(0);
		expect(finiteNumberOr(7, 5)).toBe(7);
	});

	test("optional fields serialize cleared or invalid input as null", () => {
		expect(optionalFiniteNumberOrNull(Number.NaN)).toBeNull();
		expect(optionalFiniteNumberOrNull(Number.POSITIVE_INFINITY)).toBeNull();
		expect(optionalFiniteNumberOrNull(0)).toBe(0);
		expect(optionalFiniteNumberOrNull(200000)).toBe(200000);
	});

	test("default play limits keep the optional cap unset", () => {
		expect(DEFAULT_PLAY_LIMITS.maxTotalSessions).toBeNull();
	});
});
