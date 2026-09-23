"use client";

import {
	isScratchCardGameConfig,
	scratchCardDefaultGameConfig,
	type CampaignGameConfig,
} from "@/lib/gameTemplates";
import { scratchCoverPalette } from "@/app/game-templates/scratch-card/coverPalettes";

/**
 * Deterministic operator preview: cover foil swatch in the frozen coverStyle
 * palette (shared with the participant canvas), headline hierarchy, and the
 * presentation-only threshold hint.
 */
export function ScratchCardPreview({
	config,
}: {
	config: CampaignGameConfig;
	heroUrl?: string | null;
}) {
	const scratchConfig = isScratchCardGameConfig(config)
		? config
		: { ...scratchCardDefaultGameConfig, publicCopy: config.publicCopy };
	const palette = scratchCoverPalette(scratchConfig.coverStyle);
	return (
		<section
			aria-label="Xem trước thẻ cào may mắn"
			className="relative isolate aspect-video max-w-2xl overflow-hidden rounded-2xl p-6 text-center shadow-inner"
			style={{ background: "#141433", color: "#fff6e8" }}
		>
			<div className="grid h-full place-content-center gap-3">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d4af37]">
					Thẻ cào may mắn
				</p>
				<h3 className="text-2xl font-bold text-[#fff6e8]">
					{scratchConfig.publicCopy.headline || "Gỡ lớp phủ nhận quà tri ân"}
				</h3>
				<div
					className="mx-auto h-10 w-40 rounded-full border border-white/25"
					data-cover-style={scratchConfig.coverStyle}
					data-testid="scratch-preview-foil"
					style={{ backgroundImage: palette.css }}
					title={`Lớp phủ ${scratchConfig.coverStyle}`}
				/>
				<p className="text-sm text-[#fff6e8]/75">
					{scratchConfig.publicCopy.subtitle ||
						`Lớp phủ ${scratchConfig.coverStyle} · ngưỡng hiển thị ${scratchConfig.revealThresholdPercent}%`}
				</p>
				<span className="mx-auto mt-2 rounded-full bg-[#d4af37] px-6 py-2 text-sm font-bold text-[#201a30]">
					{scratchConfig.publicCopy.startCtaLabel || "Bắt đầu"}
				</span>
			</div>
		</section>
	);
}
