import { Chip } from "@heroui/react";
import type { EffectiveGameStatus } from "@/lib/gameStatus";

/** The one computed game status chip (§11.1/R3): combines saved status and
 * play window; callers render `status.detail` in the meta line separately. */
export function GameStatusChip({ status }: { status: EffectiveGameStatus }) {
	return (
		<Chip color={status.color} size="sm" variant="soft">
			{status.label}
		</Chip>
	);
}
