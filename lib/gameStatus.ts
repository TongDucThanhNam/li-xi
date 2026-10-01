/**
 * One computed status per game (workspace UX redesign §11.1, R3): saved
 * status and play window combine into a single chip state plus an optional
 * meta-line detail, so operators never merge two chips in their head.
 */
import {
	formatScheduleTime,
	normalizeScheduleWindow,
	resolveGameScheduleState,
} from "./schedulePolicy";

export type EffectiveGameState = "archived" | "draft" | "scheduled" | "ended" | "live";

export type EffectiveGameStatus = {
	state: EffectiveGameState;
	label: string;
	color: "default" | "success" | "warning";
	/** Meta-line text such as "Đến 13 thg 9, 2026 00:29"; null when nothing to add. */
	detail: string | null;
};

export function resolveEffectiveGameStatus(
	game: { status: string; schedule: { startsAt: number | null; endsAt: number | null } },
	now: number,
): EffectiveGameStatus {
	if (game.status === "archived") {
		return { state: "archived", label: "Đã lưu trữ", color: "default", detail: null };
	}
	if (game.status !== "active") {
		return { state: "draft", label: "Bản nháp", color: "default", detail: null };
	}
	const schedule = normalizeScheduleWindow(game.schedule);
	const windowState = resolveGameScheduleState(schedule, now);
	if (windowState === "not-started") {
		return {
			state: "scheduled",
			label: "Sắp mở",
			color: "warning",
			detail:
				schedule.startsAt !== null ? `Mở lúc ${formatScheduleTime(schedule.startsAt)}` : null,
		};
	}
	if (windowState === "ended") {
		return {
			state: "ended",
			label: "Đã kết thúc",
			color: "default",
			detail:
				schedule.endsAt !== null ? `Đã đóng lúc ${formatScheduleTime(schedule.endsAt)}` : null,
		};
	}
	return {
		state: "live",
		label: "Đang chạy",
		color: "success",
		detail: schedule.endsAt !== null ? `Đến ${formatScheduleTime(schedule.endsAt)}` : null,
	};
}
