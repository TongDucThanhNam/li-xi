import type { CSSProperties, ReactNode } from "react";

export default function HostShell({ children }: { children: ReactNode }) {
	const pageBackground: CSSProperties = {
		backgroundImage: [
			"radial-gradient(circle at 8% 0%, rgba(179, 20, 20, 0.65), transparent 45%)",
			"radial-gradient(circle at 90% 4%, rgba(212, 175, 55, 0.45), transparent 40%)",
			"radial-gradient(circle at 86% 86%, rgba(94, 10, 10, 0.58), transparent 50%)",
			"radial-gradient(circle at 35% 22%, rgba(255, 248, 220, 0.25), transparent 42%)",
			"radial-gradient(circle at 50% 50%, rgba(212, 175, 55, 0.08), transparent 60%)",
			"linear-gradient(150deg, #1a0505 0%, #3e0000 48%, #5e0a0a 100%)",
		].join(", "),
	};

	const noiseStyle: CSSProperties = {
		backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
	};

	const lightOneStyle: CSSProperties = {
		background:
			"radial-gradient(circle, var(--color-red-vivid) 0%, transparent 70%)",
	};

	const lightTwoStyle: CSSProperties = {
		background: "radial-gradient(circle, #ff4500 0%, transparent 70%)",
	};

	const lightThreeStyle: CSSProperties = {
		background:
			"radial-gradient(circle, var(--color-gold-base) 0%, transparent 70%)",
	};

	const lightFourStyle: CSSProperties = {
		background: "radial-gradient(circle, #fff8dc 0%, transparent 70%)",
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
			<div
				className="pointer-events-none absolute -left-[10%] -top-[20%] h-[800px] w-[800px] rounded-full opacity-55 blur-[120px] mix-blend-screen animate-float-slow"
				style={lightOneStyle}
			/>
			<div
				className="pointer-events-none absolute -bottom-[20%] -right-[10%] h-[600px] w-[600px] rounded-full opacity-40 blur-[100px] mix-blend-screen animate-float-medium"
				style={lightTwoStyle}
			/>
			<div
				className="pointer-events-none absolute left-[40%] top-[40%] h-[500px] w-[500px] rounded-full opacity-30 blur-[100px] mix-blend-screen animate-pulse-slow"
				style={lightThreeStyle}
			/>
			<div
				className="pointer-events-none absolute left-[60%] top-[15%] h-[400px] w-[400px] rounded-full opacity-20 blur-[80px] mix-blend-screen animate-float-slow"
				style={lightFourStyle}
			/>
			{children}
		</main>
	);
}
