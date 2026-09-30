import { Chip } from "@heroui/react";
import {
	formatScheduleTime,
	resolveGameScheduleState,
} from "@/lib/schedulePolicy";

/**
 * Advisory play-window status for operator surfaces (games list, share
 * panel, distribution). Mirrors the server admission gate so operators can
 * see at a glance whether the window is closed; enforcement stays
 * server-side and this label may lag real time by moments.
 */
export function ScheduleStatusChip({
	schedule,
	size,
}: {
	schedule: { startsAt: number | null; endsAt: number | null };
	size?: "sm";
}) {
	if (schedule.startsAt === null && schedule.endsAt === null) return null;
	const state = resolveGameScheduleState(schedule, Date.now());
	if (state === "not-started") {
		return (
			<Chip
				color="warning"
				size={size}
				title={schedule.startsAt !== null ? `Mở lúc ${formatScheduleTime(schedule.startsAt)}` : undefined}
				variant="soft"
			>
				Chưa mở cửa sổ
			</Chip>
		);
	}
	if (state === "ended") {
		return (
			<Chip
				color="danger"
				size={size}
				title={schedule.endsAt !== null ? `Kết thúc lúc ${formatScheduleTime(schedule.endsAt)}` : undefined}
				variant="soft"
			>
				Đã đóng cửa sổ
			</Chip>
		);
	}
	return (
		<Chip color="accent" size={size} variant="soft">
			Cửa sổ đang mở
		</Chip>
	);
}

/** Human-readable bounded window ("từ … đến …") in Vietnam time; empty when unbounded. */
export function scheduleRangeText(schedule: {
	startsAt: number | null;
	endsAt: number | null;
}): string {
	const parts: string[] = [];
	if (schedule.startsAt !== null) parts.push(`từ ${formatScheduleTime(schedule.startsAt)}`);
	if (schedule.endsAt !== null) parts.push(`đến ${formatScheduleTime(schedule.endsAt)}`);
	return parts.length > 0 ? `Cửa sổ chơi ${parts.join(" ")}` : "";
}
