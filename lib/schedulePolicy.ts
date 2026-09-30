/**
 * Play-window (schedule) policy for campaign games. Both bounds are
 * independently optional epoch-ms timestamps on the campaignGames row; a
 * game without any bound behaves exactly as before.
 *
 * Server authority: the window is enforced at every NEW-session admission
 * (public link resolution and the shared admission core used by both the
 * public link and the station). An already-admitted session may finish
 * after `endsAt` under its frozen rules snapshot — the mid-session action
 * guard stays a hard-lifecycle check (campaign/game/link live), so a
 * participant mid-play is never dropped when the window closes.
 */

export type GameScheduleState = "open" | "not-started" | "ended";

export type GameScheduleWindow = {
	startsAt?: number | null;
	endsAt?: number | null;
};

export function resolveGameScheduleState(
	window: GameScheduleWindow,
	now: number,
): GameScheduleState {
	if (typeof window.startsAt === "number" && now < window.startsAt) {
		return "not-started";
	}
	if (typeof window.endsAt === "number" && now > window.endsAt) {
		return "ended";
	}
	return "open";
}

/** Normalized read view of the stored window (absent → null). */
export function normalizeScheduleWindow(window: {
	startsAt?: number | null;
	endsAt?: number | null;
}): { startsAt: number | null; endsAt: number | null } {
	return {
		startsAt: typeof window.startsAt === "number" ? window.startsAt : null,
		endsAt: typeof window.endsAt === "number" ? window.endsAt : null,
	};
}

const SCHEDULE_TS_REASON = "Thời gian cửa sổ chơi không hợp lệ";

/**
 * Write-path validation for the stored window: present bounds must be
 * finite positive integers, and an explicit window must run forward.
 * Returns the cleaned values for persistence.
 */
export function assertValidScheduleWindow(
	window: GameScheduleWindow,
): { startsAt?: number; endsAt?: number } {
	const cleaned: { startsAt?: number; endsAt?: number } = {};
	if (window.startsAt !== undefined && window.startsAt !== null) {
		if (
			!Number.isFinite(window.startsAt) ||
			!Number.isInteger(window.startsAt) ||
			window.startsAt <= 0
		) {
			throw new Error(SCHEDULE_TS_REASON);
		}
		cleaned.startsAt = window.startsAt;
	}
	if (window.endsAt !== undefined && window.endsAt !== null) {
		if (
			!Number.isFinite(window.endsAt) ||
			!Number.isInteger(window.endsAt) ||
			window.endsAt <= 0
		) {
			throw new Error(SCHEDULE_TS_REASON);
		}
		cleaned.endsAt = window.endsAt;
	}
	if (
		cleaned.startsAt !== undefined &&
		cleaned.endsAt !== undefined &&
		cleaned.startsAt >= cleaned.endsAt
	) {
		throw new Error("Thời gian bắt đầu phải trước thời gian kết thúc");
	}
	return cleaned;
}

/** Admission-time gate message shared by every channel. */
export function scheduleAdmissionError(state: GameScheduleState, window: GameScheduleWindow): string {
	return state === "not-started"
		? `Trò chơi chưa mở cửa sổ chơi${window.startsAt ? ` (mở lúc ${formatScheduleTime(window.startsAt)})` : ""}`
		: "Trò chơi đã kết thúc cửa sổ chơi";
}

/** Consistent Asia/Ho_Chi_Minh display for guest/owner schedule copy. */
export function formatScheduleTime(epochMs: number): string {
	return new Intl.DateTimeFormat("vi-VN", {
		timeZone: "Asia/Ho_Chi_Minh",
		dateStyle: "medium",
		timeStyle: "short",
	}).format(epochMs);
}

/** Vietnam has no DST, so a fixed +07:00 offset is exact, not approximate. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad2(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

/**
 * Epoch ms → `datetime-local` input value ("YYYY-MM-DDTHH:mm") read/written
 * as Asia/Ho_Chi_Minh wall clock, so every operator edits the same Vietnam
 * time regardless of their device timezone.
 */
export function scheduleEpochToInputValue(epochMs: number | null | undefined): string {
	if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return "";
	const shifted = new Date(epochMs + VIETNAM_OFFSET_MS);
	return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/**
 * Inverse of scheduleEpochToInputValue: parse the input wall clock as
 * Asia/Ho_Chi_Minh time → epoch ms, or null when blank/invalid. Minutes
 * precision round-trips losslessly for dirty tracking.
 */
export function scheduleInputValueToEpoch(value: string): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	// Shape-valid garbage ("2025-13-99T99:99") must not silently roll over
	// into a shifted epoch via Date.UTC.
	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour > 23 ||
		minute > 59
	) {
		return null;
	}
	const epochMs = Date.UTC(year, month - 1, day, hour, minute) - VIETNAM_OFFSET_MS;
	if (!Number.isFinite(epochMs)) return null;
	// Round-trip guard: per-field range checks cannot catch calendar
	// overflow ("2025-02-30" rolls to March 2) or Date.UTC's two-digit-year
	// remap ("0025" → 1925). Reject anything that does not re-emit the exact
	// same wall clock.
	const normalized = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
	if (scheduleEpochToInputValue(epochMs) !== normalized) {
		return null;
	}
	return epochMs;
}
