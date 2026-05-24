import type { CSSProperties, ReactNode } from "react";

export default function HostShell({ children }: { children: ReactNode }) {
	const pageBackground: CSSProperties = {
		backgroundImage: [
			"linear-gradient(135deg, color-mix(in srgb, var(--color-gold-shine) 8%, transparent) 0 1px, transparent 1px 28px)",
			"linear-gradient(45deg, color-mix(in srgb, var(--color-red-vivid) 10%, transparent) 0 1px, transparent 1px 36px)",
			"linear-gradient(160deg, #190404 0%, #300606 45%, #4a0909 100%)",
		].join(", "),
		backgroundSize: "28px 28px, 36px 36px, auto",
	};

	const noiseStyle: CSSProperties = {
		backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
	};

	return (
		<main
			className="relative isolate flex h-screen w-screen flex-col overflow-hidden p-4 sm:p-5 text-text-primary"
			style={pageBackground}
		>
			<div
				className="pointer-events-none absolute inset-0 z-0 opacity-[0.04] mix-blend-overlay"
				style={noiseStyle}
			/>
			<div className="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-black-ink/20 via-transparent to-black-ink/35" />
			{children}
		</main>
	);
}
