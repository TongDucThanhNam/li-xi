"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Rarity } from "@/lib/lixiPolicy";
import { clearOwnerSession } from "@/lib/ownerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";

function formatCurrency(amount: number) {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString("vi-VN");
}

function getRarityClasses(rarity: Rarity) {
	const variants: Record<Rarity, string> = {
		common:
			"text-[#dfdfdf] bg-[rgba(118,118,118,0.22)] border-[rgba(194,194,194,0.4)]",
		rare: "text-[#ddceff] bg-[rgba(100,69,182,0.3)] border-[rgba(157,130,255,0.5)]",
		legend:
			"text-[#ffe3a1] bg-[rgba(160,120,10,0.3)] border-[rgba(255,203,84,0.55)]",
	};
	return variants[rarity];
}

export default function LeaderboardPage() {
	const router = useRouter();
	const owner = useOwnerSession();

	useEffect(() => {
		if (owner === null) {
			router.replace("/auth");
		}
	}, [owner, router]);

	const leaderboard = useQuery(
		api.leaderboard.getOwnerLeaderboard,
		owner ? { ownerId: owner.userId, limit: 50 } : "skip",
	);
	const history = useQuery(
		api.leaderboard.getOwnerHistory,
		owner ? { ownerId: owner.userId, limit: 100 } : "skip",
	);

	const handleLogout = () => {
		clearOwnerSession();
		router.replace("/auth");
	};

	if (!owner || leaderboard === undefined || history === undefined) {
		return (
			<main className="min-h-screen grid place-items-center p-5 bg-[var(--color-black-ink)] text-[#ffe8b3]">
				Đang tải bảng thống kê...
			</main>
		);
	}

	return (
		<main
			className="min-h-screen p-5 bg-[var(--color-black-ink)] font-vn"
			style={{
				backgroundImage: [
					"radial-gradient(circle at 12% 8%, rgba(198, 44, 44, 0.3), transparent 40%)",
					"radial-gradient(circle at 88% 6%, rgba(255, 199, 95, 0.15), transparent 33%)",
					"linear-gradient(145deg, #130303 0%, #2b0909 55%, #190505 100%)",
				].join(", "),
			}}
		>
			<section className="w-full max-w-[1100px] mx-auto">
				<header className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 mb-4">
					<div>
						<h1 className="text-[#ffe8b3] text-[32px] font-cinzel">
							Leaderboard lì xì
						</h1>
						<p className="mt-1.5 text-[rgba(255, 223, 155, 0.8)] text-sm">
							Chủ ví: {owner.username}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className="rounded-xl border border-[rgba(247, 193, 96, 0.44)] bg-[rgba(45, 12, 12, 0.75)] text-[#ffd694] px-3 py-2.5 cursor-pointer hover:bg-[rgba(45,12,12,0.9)] transition-colors"
							onClick={() => router.push("/draw")}
						>
							Trạm rút
						</button>
						<button
							type="button"
							className="rounded-xl border border-[rgba(247, 193, 96, 0.44)] bg-[rgba(45, 12, 12, 0.75)] text-[#ffd694] px-3 py-2.5 cursor-pointer hover:bg-[rgba(45,12,12,0.9)] transition-colors"
							onClick={() => router.push("/setup")}
						>
							Setup
						</button>
						<button
							type="button"
							className="rounded-xl border border-[rgba(247, 193, 96, 0.44)] bg-[rgba(45, 12, 12, 0.75)] text-[#ffd694] px-3 py-2.5 cursor-pointer hover:bg-[rgba(45,12,12,0.9)] transition-colors"
							onClick={handleLogout}
						>
							Đăng xuất
						</button>
					</div>
				</header>

				<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
					<section className="rounded-2xl border border-[rgba(243, 192, 86, 0.3)] bg-[rgba(32, 8, 8, 0.86)] p-4">
						<h2 className="text-[#ffe5b1] text-xl font-cinzel mb-3">
							Top theo số tiền
						</h2>
						{leaderboard.length === 0 ? (
							<p className="text-[rgba(255, 218, 149, 0.75)]">
								Chưa có lượt rút nào.
							</p>
						) : (
							<div className="grid gap-2">
								{leaderboard.map((item) => (
									<article
										key={item.id}
										className="rounded-xl border border-[rgba(243, 189, 80, 0.22)] bg-[rgba(18, 5, 5, 0.9)] flex justify-between gap-2.5 p-2.5 color-[#ffe1a8]"
									>
										<div className="flex items-center gap-2 flex-wrap">
											<strong>
												#{item.rank} {item.guestNameDisplay}
											</strong>
											<span
												className={`text-[11px] uppercase rounded-full border px-2 py-0.5 ${getRarityClasses(item.rarity)}`}
											>
												{item.rarity}
											</span>
										</div>
										<div className="flex items-center gap-2 flex-wrap justify-end">
											<span className="font-playfair text-[#ffe1a8]">
												{formatCurrency(item.amount)}
											</span>
											<span className="text-xs text-[rgba(255,225,168,0.6)]">
												{formatTime(item.createdAt)}
											</span>
										</div>
									</article>
								))}
							</div>
						)}
					</section>

					<section className="rounded-2xl border border-[rgba(243, 192, 86, 0.3)] bg-[rgba(32, 8, 8, 0.86)] p-4">
						<h2 className="text-[#ffe5b1] text-xl font-cinzel mb-3">
							Lịch sử gần đây
						</h2>
						{history.length === 0 ? (
							<p className="text-[rgba(255, 218, 149, 0.75)]">
								Chưa có dữ liệu.
							</p>
						) : (
							<div className="grid gap-2">
								{history.map((item) => (
									<article
										key={item.id}
										className="rounded-xl border border-[rgba(243, 189, 80, 0.22)] bg-[rgba(18, 5, 5, 0.9)] flex justify-between gap-2.5 p-2.5 color-[#ffe1a8]"
									>
										<div className="flex items-center gap-2 flex-wrap">
											<strong>{item.guestNameDisplay}</strong>
											<span
												className={`text-[11px] uppercase rounded-full border px-2 py-0.5 ${getRarityClasses(item.rarity)}`}
											>
												{item.rarity}
											</span>
										</div>
										<div className="flex items-center gap-2 flex-wrap justify-end">
											<span className="font-playfair text-[#ffe1a8]">
												{formatCurrency(item.amount)}
											</span>
											<span className="text-xs text-[rgba(255,225,168,0.6)]">
												{formatTime(item.createdAt)}
											</span>
										</div>
									</article>
								))}
							</div>
						)}
					</section>
				</div>
			</section>
		</main>
	);
}
