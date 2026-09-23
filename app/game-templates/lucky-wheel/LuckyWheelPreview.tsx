import {
	configRewardMode,
	isLuckyWheelGameConfig,
	luckyWheelDefaultGameConfig,
	type CampaignGameConfig,
} from "@/lib/gameTemplates";

export function LuckyWheelPreview({ config, heroUrl }: { config: CampaignGameConfig; heroUrl?: string | null }) {
	const wheelConfig = isLuckyWheelGameConfig(config)
		? config
		: { ...luckyWheelDefaultGameConfig, publicCopy: config.publicCopy };
	return (
		<section
			aria-label="Xem trước vòng quay may mắn"
			className="relative isolate aspect-video max-w-2xl overflow-hidden rounded-2xl bg-[#141433] p-6 text-center text-[#fff6e8] shadow-inner"
		>
			{heroUrl ? (
				<img alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover opacity-30" src={heroUrl} />
			) : null}
			<div className="absolute inset-0 -z-10 bg-linear-to-b from-[#7b6cf6]/40 to-[#141433]/95" />
			<div className="grid h-full place-content-center gap-3">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f5a623]">Vòng quay may mắn</p>
				<h3 className="text-2xl font-bold text-[#fff6e8]">
					{wheelConfig.publicCopy.headline || "Quay để nhận quà tri ân"}
				</h3>
				<p className="text-sm text-[#fff6e8]/75">
					{wheelConfig.publicCopy.subtitle ||
						(configRewardMode(wheelConfig) === "engagement"
							? "Chế độ tương tác: mỗi lượt quay là một lời cảm ơn, không trúng thưởng."
							: `Trọng số lượt không trúng: ${wheelConfig.noRewardWeight} (cơ hội thực tế phụ thuộc phần thưởng còn lại)`)}
				</p>
				<span className="mx-auto mt-2 rounded-full bg-[#f5a623] px-6 py-2 text-sm font-bold text-[#201a30]">
					{wheelConfig.publicCopy.startCtaLabel || "Quay ngay"}
				</span>
			</div>
		</section>
	);
}
