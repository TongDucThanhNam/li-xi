import type { ReactNode } from "react";

type HostPanelProps = {
	title: string;
	titleTone?: "main" | "side";
	children: ReactNode;
};

export default function HostPanel({
	title,
	titleTone = "main",
	children,
}: HostPanelProps) {
	const titleClass =
		titleTone === "main"
			? "font-[var(--font-playfair)] text-[clamp(26px,3vw,35px)] leading-[1.15] tracking-[0.5px] text-[#ffe4ab] drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
			: "font-[var(--font-playfair)] text-[clamp(24px,2.5vw,34px)] leading-[1.15] tracking-[0.5px] text-[#ffe4ab] drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]";

	return (
		<section className="relative rounded-[18px] border border-[rgba(248,189,85,0.4)] bg-[linear-gradient(160deg,rgba(62,11,11,0.92),rgba(27,6,6,0.94)),radial-gradient(circle_at_100%_0%,_rgba(255,212,134,0.16),_transparent_42%)] p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35),_0_18px_34px_rgba(15,0,0,0.45)] before:pointer-events-none before:absolute before:inset-[14px] before:rounded-[14px] before:border before:border-[rgba(255,225,142,0.08)]">
			<h2 className={titleClass}>{title}</h2>
			<div className="mt-3 grid gap-3">{children}</div>
		</section>
	);
}
