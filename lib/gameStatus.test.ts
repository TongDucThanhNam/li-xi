import { describe, expect, test } from "vitest";
import { resolveEffectiveGameStatus } from "./gameStatus";
import { formatScheduleTime } from "./schedulePolicy";

const NOW = Date.parse("2026-09-12T00:29:30+07:00");
const HOUR = 60 * 60 * 1000;

describe("resolveEffectiveGameStatus", () => {
	test("archived wins over any window", () => {
		expect(
			resolveEffectiveGameStatus(
				{ status: "archived", schedule: { startsAt: NOW - HOUR, endsAt: NOW + HOUR } },
				NOW,
			),
		).toEqual({ state: "archived", label: "Đã lưu trữ", color: "default", detail: null });
	});

	test("a non-active game is a draft even inside an open window", () => {
		expect(
			resolveEffectiveGameStatus(
				{ status: "draft", schedule: { startsAt: null, endsAt: null } },
				NOW,
			),
		).toEqual({ state: "draft", label: "Bản nháp", color: "default", detail: null });
	});

	test("active before startsAt is scheduled with the opening time", () => {
		const startsAt = NOW + HOUR;
		expect(
			resolveEffectiveGameStatus(
				{ status: "active", schedule: { startsAt, endsAt: null } },
				NOW,
			),
		).toEqual({
			state: "scheduled",
			label: "Sắp mở",
			color: "warning",
			detail: `Mở lúc ${formatScheduleTime(startsAt)}`,
		});
	});

	test("active after endsAt has ended with the closing time", () => {
		const endsAt = NOW - HOUR;
		expect(
			resolveEffectiveGameStatus(
				{ status: "active", schedule: { startsAt: null, endsAt } },
				NOW,
			),
		).toEqual({
			state: "ended",
			label: "Đã kết thúc",
			color: "default",
			detail: `Đã đóng lúc ${formatScheduleTime(endsAt)}`,
		});
	});

	test("live inside a bounded window shows the closing time", () => {
		const endsAt = NOW + 24 * HOUR;
		expect(
			resolveEffectiveGameStatus(
				{ status: "active", schedule: { startsAt: NOW - HOUR, endsAt } },
				NOW,
			),
		).toEqual({
			state: "live",
			label: "Đang chạy",
			color: "success",
			detail: `Đến ${formatScheduleTime(endsAt)}`,
		});
	});

	test("live without an end bound has no detail", () => {
		expect(
			resolveEffectiveGameStatus(
				{ status: "active", schedule: { startsAt: NOW - HOUR, endsAt: null } },
				NOW,
			),
		).toEqual({ state: "live", label: "Đang chạy", color: "success", detail: null });
	});
});
