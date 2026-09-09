import type { CampaignGameConfig } from "@/lib/gameTemplates";

export function LiXiGamePreview({ config, heroUrl }: { config: CampaignGameConfig; heroUrl?: string | null }) {
	return <section aria-label="Xem trước trò chơi li xi" className="relative isolate aspect-video max-w-2xl overflow-hidden rounded-2xl bg-[#050000] p-6 text-center text-[#fff8dc] shadow-inner">
		{heroUrl ? <img alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover opacity-35" src={heroUrl} /> : null}
		<div className="absolute inset-0 -z-10 bg-linear-to-b from-[#5e0a0a]/60 to-[#050000]/90" />
		<div className="grid h-full place-content-center gap-3"><p className="text-xs uppercase tracking-[0.24em]">Lunar Fortune</p><h3 className="font-serif text-2xl">{config.publicCopy.headline || "Lời cảm ơn từ thương hiệu"}</h3><p className="text-sm text-[#fff8dc]/75">{config.publicCopy.subtitle || "Mở phong bao để khám phá kết quả của bạn."}</p><span className="mx-auto mt-2 rounded-full border border-[#fff8dc]/50 px-5 py-2 text-sm">{config.publicCopy.startCtaLabel || "Bắt đầu chơi"}</span></div>
	</section>;
}
