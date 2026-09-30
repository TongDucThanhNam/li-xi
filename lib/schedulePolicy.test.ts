import { describe, expect, test } from "vitest";
import {
	assertValidScheduleWindow,
	formatScheduleTime,
	normalizeScheduleWindow,
	resolveGameScheduleState,
	scheduleAdmissionError,
	scheduleEpochToInputValue,
	scheduleInputValueToEpoch,
} from "./schedulePolicy";

describe("resolveGameScheduleState", () => {
	test("a game without any bound is always open (unchanged behavior)", () => {
		expect(resolveGameScheduleState({ startsAt: null, endsAt: null }, 0)).toBe("open");
		expect(resolveGameScheduleState({}, Date.now())).toBe("open");
	});

	test("before startsAt the window is not started; at/after it opens", () => {
		const window = { startsAt: 1000, endsAt: null };
		expect(resolveGameScheduleState(window, 999)).toBe("not-started");
		expect(resolveGameScheduleState(window, 1000)).toBe("open");
	});

	test("after endsAt the window has ended; at endsAt it is still open", () => {
		const window = { startsAt: null, endsAt: 2000 };
		expect(resolveGameScheduleState(window, 2000)).toBe("open");
		expect(resolveGameScheduleState(window, 2001)).toBe("ended");
	});

	test("a bounded window transitions not-started → open → ended", () => {
		const window = { startsAt: 1000, endsAt: 2000 };
		expect(resolveGameScheduleState(window, 500)).toBe("not-started");
		expect(resolveGameScheduleState(window, 1500)).toBe("open");
		expect(resolveGameScheduleState(window, 2500)).toBe("ended");
	});
});

describe("normalizeScheduleWindow", () => {
	test("absent and null bounds normalize to null", () => {
		expect(normalizeScheduleWindow({})).toEqual({ startsAt: null, endsAt: null });
		expect(normalizeScheduleWindow({ startsAt: null, endsAt: undefined })).toEqual({
			startsAt: null,
			endsAt: null,
		});
	});

	test("numeric bounds pass through", () => {
		expect(normalizeScheduleWindow({ startsAt: 5, endsAt: 10 })).toEqual({
			startsAt: 5,
			endsAt: 10,
		});
	});
});

describe("assertValidScheduleWindow", () => {
	test("an absent window validates to an empty cleaned value", () => {
		expect(assertValidScheduleWindow({})).toEqual({});
		expect(assertValidScheduleWindow({ startsAt: null, endsAt: null })).toEqual({});
	});

	test("a valid forward window keeps both bounds", () => {
		expect(assertValidScheduleWindow({ startsAt: 1000, endsAt: 2000 })).toEqual({
			startsAt: 1000,
			endsAt: 2000,
		});
	});

	test("only-endsAt and only-startsAt windows are valid", () => {
		expect(assertValidScheduleWindow({ startsAt: null, endsAt: 2000 })).toEqual({ endsAt: 2000 });
		expect(assertValidScheduleWindow({ startsAt: 1000, endsAt: null })).toEqual({
			startsAt: 1000,
		});
	});

	test("non-integer, non-positive, and non-finite bounds are rejected", () => {
		expect(() => assertValidScheduleWindow({ startsAt: 1.5 })).toThrow();
		expect(() => assertValidScheduleWindow({ endsAt: -5 })).toThrow();
		expect(() => assertValidScheduleWindow({ startsAt: Number.NaN })).toThrow();
		expect(() => assertValidScheduleWindow({ endsAt: Number.POSITIVE_INFINITY })).toThrow();
		expect(() => assertValidScheduleWindow({ startsAt: 0, endsAt: 10 })).toThrow();
	});

	test("a window that does not run forward is rejected with the Vietnamese message", () => {
		expect(() => assertValidScheduleWindow({ startsAt: 2000, endsAt: 2000 })).toThrow(
			"Thời gian bắt đầu phải trước thời gian kết thúc",
		);
		expect(() => assertValidScheduleWindow({ startsAt: 3000, endsAt: 2000 })).toThrow(
			"Thời gian bắt đầu phải trước thời gian kết thúc",
		);
	});
});

describe("scheduleAdmissionError", () => {
	test("not-started includes the Vietnam-time opening time when known", () => {
		const startsAt = Date.UTC(2025, 9, 1, 3, 30); // 10:30 Vietnam time
		const message = scheduleAdmissionError("not-started", { startsAt, endsAt: null });
		expect(message).toContain("chưa mở cửa sổ chơi");
		expect(message).toContain("10:30");
	});

	test("not-started without a bound and ended messages are stable", () => {
		expect(scheduleAdmissionError("not-started", {})).toBe(
			"Trò chơi chưa mở cửa sổ chơi",
		);
		expect(scheduleAdmissionError("ended", {})).toBe(
			"Trò chơi đã kết thúc cửa sổ chơi",
		);
	});
});

describe("formatScheduleTime", () => {
	test("renders Asia/Ho_Chi_Minh time regardless of the host timezone", () => {
		// 2025-10-01T00:00:00Z is 07:00 Vietnam time on 1 thg 10.
		const rendered = formatScheduleTime(Date.UTC(2025, 9, 1, 0, 0));
		expect(rendered).toContain("07:00");
		expect(rendered).toContain("1 thg 10");
	});
});

describe("datetime-local input conversion", () => {
	test("epoch → input value uses +07:00 wall clock", () => {
		expect(scheduleEpochToInputValue(Date.UTC(2025, 9, 1, 0, 0))).toBe("2025-10-01T07:00");
		// 2025-12-31T17:30:00Z is next-day 00:30 in Vietnam.
		expect(scheduleEpochToInputValue(Date.UTC(2025, 11, 31, 17, 30))).toBe("2026-01-01T00:30");
	});

	test("input value → epoch reads the wall clock as Vietnam time", () => {
		expect(scheduleInputValueToEpoch("2025-10-01T07:00")).toBe(Date.UTC(2025, 9, 1, 0, 0));
	});

	test("minute-precision values round-trip losslessly", () => {
		const epoch = Date.UTC(2026, 0, 15, 2, 45);
		expect(scheduleInputValueToEpoch(scheduleEpochToInputValue(epoch))).toBe(epoch);
	});

	test("blank and malformed values become null", () => {
		expect(scheduleInputValueToEpoch("")).toBeNull();
		expect(scheduleInputValueToEpoch("   ")).toBeNull();
		expect(scheduleInputValueToEpoch("not-a-date")).toBeNull();
		expect(scheduleInputValueToEpoch("2025-13-99T99:99")).toBeNull();
	});

	test("shape-valid calendar garbage does not roll over (F9)", () => {
		// Day 30 does not exist in February; Date.UTC would roll it to March 2.
		expect(scheduleInputValueToEpoch("2025-02-30T10:00")).toBeNull();
		// Day 31 in a 30-day month.
		expect(scheduleInputValueToEpoch("2025-04-31T10:00")).toBeNull();
		// Non-leap February 29.
		expect(scheduleInputValueToEpoch("2025-02-29T10:00")).toBeNull();
		// Leap February 29 is a real date and must keep parsing.
		expect(scheduleInputValueToEpoch("2024-02-29T10:00")).toBe(
			Date.UTC(2024, 1, 29, 3, 0),
		);
		// Date.UTC remaps years 0-99 into 1900-1999; a literal 4-digit year
		// must not silently shift.
		expect(scheduleInputValueToEpoch("0025-01-01T00:00")).toBeNull();
		expect(scheduleInputValueToEpoch("0099-06-15T12:00")).toBeNull();
		// A real 4-digit historical year keeps parsing through the round trip.
		expect(scheduleInputValueToEpoch("1900-06-15T12:00")).toBe(
			Date.UTC(1900, 5, 15, 5, 0),
		);
	});

	test("empty epoch input renders as an empty string", () => {
		expect(scheduleEpochToInputValue(null)).toBe("");
		expect(scheduleEpochToInputValue(undefined)).toBe("");
		expect(scheduleEpochToInputValue(Number.NaN)).toBe("");
	});
});
