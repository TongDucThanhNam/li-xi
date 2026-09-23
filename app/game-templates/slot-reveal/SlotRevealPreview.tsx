"use client";

import {
	isSlotRevealGameConfig,
	slotRevealDefaultGameConfig,
	SLOT_SYMBOL_LABELS,
	type CampaignGameConfig,
} from "@/lib/gameTemplates";
import {
	SLOT_IDLE_COMBINATION,
	SLOT_SYMBOL_ICONS,
} from "@/app/game-templates/slot-reveal/slotSymbols";

const THEME_SWATCHES: Record<string, { marquee: string; frame: string }> = {
	gold: { marquee: "#f2c14e", frame: "#8a6d1f" },
	neon: { marquee: "#4cc9f0", frame: "#1b2a4a" },
	festive: { marquee: "#ef476f", frame: "#4d1226" },
};

/**
 * Deterministic operator preview: mini machine with the selected reel theme
 * (inline styles so admin surfaces need no slot CSS), headline hierarchy,
 * and the fixed symbol legend.
 */
export function SlotRevealPreview({
	config,
}: {
	config: CampaignGameConfig;
	heroUrl?: string | null;
}) {
	const slotConfig = isSlotRevealGameConfig(config)
		? config
		: { ...slotRevealDefaultGameConfig, publicCopy: config.publicCopy };
	const swatch = THEME_SWATCHES[slotConfig.reelTheme] ?? THEME_SWATCHES.gold;
	return (
		<section
			aria-label="Xem trước máy quay tri ân"
			className="relative isolate aspect-video max-w-2xl overflow-hidden rounded-2xl p-6 text-center shadow-inner"
			style={{ background: "#170f33", color: "#fff7ec" }}
		>
			<div className="grid h-full place-content-center gap-3">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f2c14e]">
					Máy quay tri ân
				</p>
				<h3 className="text-2xl font-bold text-[#fff7ec]">
					{slotConfig.publicCopy.headline || "Quay ba cuộn nhận quà tri ân"}
				</h3>
				<div
					className="mx-auto flex gap-2 rounded-2xl border-2 p-3"
					data-reel-theme={slotConfig.reelTheme}
					data-testid="slot-preview-machine"
					style={{ borderColor: swatch.frame }}
				>
					{SLOT_IDLE_COMBINATION.map((symbolKey, index) => {
						const Icon = SLOT_SYMBOL_ICONS[symbolKey];
						return (
							<span
								className="grid h-12 w-12 place-items-center rounded-xl text-[#170f33]"
								key={`${symbolKey}-${index}`}
								style={{ background: swatch.marquee }}
								title={SLOT_SYMBOL_LABELS[symbolKey]}
							>
								<Icon aria-hidden="true" size={24} />
							</span>
						);
					})}
				</div>
				<p className="text-sm text-[#fff7ec]/75">
					Phong cách {slotConfig.reelTheme} · lượt không trúng{" "}
					{slotConfig.noRewardWeight}%
				</p>
				<span className="mx-auto mt-2 rounded-full bg-[#f2c14e] px-6 py-2 text-sm font-bold text-[#170f33]">
					{slotConfig.publicCopy.startCtaLabel || "Quay ngay"}
				</span>
			</div>
		</section>
	);
}
