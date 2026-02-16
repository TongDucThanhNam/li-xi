"use client";

import { useRouter } from "next/navigation";
import { useOwnerSession } from "@/lib/useOwnerSession";

export default function HomePage() {
	const router = useRouter();
	const owner = useOwnerSession();

	return (
		<main
			className="relative min-h-screen overflow-hidden grid place-items-center p-5 bg-[#150202]"
			style={{
				backgroundImage: [
					"radial-gradient(circle at 10% 0%, rgba(227, 51, 51, 0.35), transparent 38%)",
					"radial-gradient(circle at 90% 0%, rgba(255, 198, 96, 0.18), transparent 34%)",
					"linear-gradient(150deg, #150202 0%, #3b0505 52%, #1a0404 100%)",
				].join(", "),
			}}
		>
			<div
				className="absolute inset-0 opacity-[0.06] pointer-events-none"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
				}}
			/>
			<div
				className="absolute rounded-full blur-[110px] opacity-[0.24] pointer-events-none w-[720px] h-[720px] top-[-28%] left-[-14%]"
				style={{
					background: "radial-gradient(circle, #800000 0%, transparent 70%)",
				}}
			/>
			<div
				className="absolute rounded-full blur-[110px] opacity-20 pointer-events-none w-[520px] h-[520px] bottom-[-26%] right-[-12%]"
				style={{
					background: "radial-gradient(circle, #ff4500 0%, transparent 72%)",
				}}
			/>
			<div
				className="absolute rounded-full blur-[110px] opacity-[0.12] pointer-events-none w-[420px] h-[420px] top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 mix-blend-overlay"
				style={{
					background: "radial-gradient(circle, #ffd700 0%, transparent 72%)",
				}}
			/>

			<section className="relative z-10 text-center p-5">
				<h1 className="m-0 font-cinzel text-[clamp(52px,8vw,110px)] leading-[1.03] bg-linear-to-b from-[#fff5d6] to-gold-base bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(212,175,55,0.45)]">
					Lunar Fortune
				</h1>
				<p className="mt-3 m-0 text-white/70 tracking-[6px] uppercase text-[clamp(13px,1.6vw,20px)]">
					Premium Gacha Experience
				</p>
				<div className="mt-[34px] flex justify-center gap-3 flex-wrap">
					<button
						type="button"
						className="rounded-full min-h-[50px] px-6 font-cinzel tracking-[2px] uppercase cursor-pointer transition-all duration-300 border border-[rgba(212,175,55,0.5)] bg-[rgba(40,0,0,0.62)] text-gold-base hover:bg-[rgba(80,0,0,0.82)] hover:border-gold-shine hover:text-white hover:shadow-[0_0_36px_rgba(212,175,55,0.24)]"
						onClick={() => router.push(owner ? "/draw" : "/auth")}
					>
						{owner ? "Vào Trạm Rút" : "Đăng Nhập Chủ Ví"}
					</button>
					<button
						type="button"
						className="rounded-full min-h-[50px] px-6 font-cinzel tracking-[2px] uppercase cursor-pointer transition-all duration-300 border border-[rgba(255,223,156,0.45)] bg-[rgba(63,14,14,0.58)] text-[#ffe6b3] hover:border-[rgba(255,242,210,0.9)]"
						onClick={() => router.push("/leaderboard")}
					>
						Leaderboard
					</button>
				</div>
			</section>
		</main>
	);
}
