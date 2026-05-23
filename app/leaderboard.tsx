"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { requireHostRouteAuth } from "@/lib/hostRouteGuard";
import type { Rarity } from "@/lib/lixiPolicy";
import { useHostLogout } from "@/lib/useHostLogout";
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
			"text-gold-shine/78 bg-black-ink/35 border-gold-base/24",
		rare: "text-red-vivid bg-red-vivid/15 border-red-vivid/45",
		legend:
			"text-gold-shine bg-gold-base/22 border-gold-base/55",
	};
	return variants[rarity];
}

export const Route = createFileRoute("/leaderboard")({
	beforeLoad: requireHostRouteAuth,
	component: LeaderboardPage,
});

function LeaderboardPage() {
	const navigate = useNavigate();
	const owner = useOwnerSession();
	const logout = useHostLogout();
	const [selectedCampaignId, setSelectedCampaignId] =
		useState<Id<"campaigns"> | null>(null);

	useEffect(() => {
		if (owner === null) {
			void navigate({ to: "/auth", replace: true });
		}
	}, [owner, navigate]);

	const workspace = useQuery(
		api.campaigns.getWorkspace,
		owner ? {} : "skip",
	);
	const ownerLeaderboard = useQuery(
		api.leaderboard.getOwnerLeaderboard,
		owner && !selectedCampaignId ? { limit: 50 } : "skip",
	);
	const campaignLeaderboard = useQuery(
		api.leaderboard.getCampaignLeaderboard,
		owner && selectedCampaignId
			? { campaignId: selectedCampaignId, limit: 50 }
			: "skip",
	);
	const ownerHistory = useQuery(
		api.leaderboard.getOwnerHistory,
		owner && !selectedCampaignId ? { limit: 100 } : "skip",
	);
	const campaignHistory = useQuery(
		api.leaderboard.getCampaignHistory,
		owner && selectedCampaignId
			? { campaignId: selectedCampaignId, limit: 100 }
			: "skip",
	);
	const leaderboard = selectedCampaignId
		? campaignLeaderboard
		: ownerLeaderboard;
	const history = selectedCampaignId ? campaignHistory : ownerHistory;
	const selectedCampaign = workspace?.campaigns.find(
		(campaign) => campaign.id === selectedCampaignId,
	);

	useEffect(() => {
		if (
			selectedCampaignId &&
			workspace &&
			!workspace.campaigns.some((campaign) => campaign.id === selectedCampaignId)
		) {
			setSelectedCampaignId(null);
		}
	}, [selectedCampaignId, workspace]);

	const handleLogout = async () => {
		await logout();
		void navigate({ to: "/auth", replace: true });
	};

	if (
		!owner ||
		workspace === undefined ||
		leaderboard === undefined ||
		history === undefined
	) {
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
							Leaderboard chiến dịch
						</h1>
						<p className="mt-1.5 text-[rgba(255, 223, 155, 0.8)] text-sm">
							{selectedCampaign
								? `${selectedCampaign.name} · ${selectedCampaign.brandName || owner.username}`
								: `Tất cả chiến dịch · ${owner.username}`}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className="rounded-xl border border-[rgba(247, 193, 96, 0.44)] bg-[rgba(45, 12, 12, 0.75)] text-[#ffd694] px-3 py-2.5 cursor-pointer hover:bg-[rgba(45,12,12,0.9)] transition-colors"
							onClick={() => void navigate({ to: "/campaigns" })}
						>
							Campaign Studio
						</button>
						<button
							type="button"
							className="rounded-xl border border-[rgba(247, 193, 96, 0.44)] bg-[rgba(45, 12, 12, 0.75)] text-[#ffd694] px-3 py-2.5 cursor-pointer hover:bg-[rgba(45,12,12,0.9)] transition-colors"
							onClick={() => void navigate({ to: "/draw" })}
						>
							Trạm rút
						</button>
						<button
							type="button"
							className="rounded-xl border border-[rgba(247, 193, 96, 0.44)] bg-[rgba(45, 12, 12, 0.75)] text-[#ffd694] px-3 py-2.5 cursor-pointer hover:bg-[rgba(45,12,12,0.9)] transition-colors"
							onClick={() => void navigate({ to: "/setup" })}
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

				<section className="rounded-2xl border border-[rgba(243, 192, 86, 0.3)] bg-[rgba(32, 8, 8, 0.86)] p-3">
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
								selectedCampaignId === null
									? "border-gold-base/60 bg-gold-base/18 text-gold-shine"
									: "border-gold-base/24 bg-black-ink/28 text-gold-shine/76 hover:bg-black-ink/42"
							}`}
							onClick={() => setSelectedCampaignId(null)}
						>
							Tất cả
						</button>
						{workspace.campaigns.map((campaign) => (
							<button
								key={campaign.id}
								type="button"
								className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
									selectedCampaignId === campaign.id
										? "border-gold-base/60 bg-gold-base/18 text-gold-shine"
										: "border-gold-base/24 bg-black-ink/28 text-gold-shine/76 hover:bg-black-ink/42"
								}`}
								onClick={() => setSelectedCampaignId(campaign.id)}
							>
								{campaign.name}
							</button>
						))}
					</div>
				</section>

				<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
						<section className="rounded-2xl border border-[rgba(243, 192, 86, 0.3)] bg-[rgba(32, 8, 8, 0.86)] p-4">
							<h2 className="text-[#ffe5b1] text-xl font-cinzel mb-3">
								Top giá trị thưởng
							</h2>
							{leaderboard.length === 0 ? (
								<p className="text-[rgba(255, 218, 149, 0.75)]">
									Chưa có lượt nhận thưởng nào.
								</p>
							) : (
							<div className="grid gap-2">
								{leaderboard.map((item) => (
									<article
										key={item.id}
										className="rounded-xl border border-[rgba(243, 189, 80, 0.22)] bg-[rgba(18, 5, 5, 0.9)] flex justify-between gap-2.5 p-2.5 text-[#ffe1a8]"
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
								Chưa có lịch sử trao thưởng.
							</p>
						) : (
							<div className="grid gap-2">
								{history.map((item) => (
									<article
										key={item.id}
										className="rounded-xl border border-[rgba(243, 189, 80, 0.22)] bg-[rgba(18, 5, 5, 0.9)] flex justify-between gap-2.5 p-2.5 text-[#ffe1a8]"
									>
										<div className="min-w-0">
											<strong>{item.guestNameDisplay}</strong>
											<p className="text-xs text-[rgba(255,225,168,0.62)]">
												{item.campaignName ?? "Chiến dịch chưa xác định"} · Mã quà{" "}
												{item.envelopeIndex + 1}
											</p>
										</div>
										<div className="text-right">
											<p className="font-playfair text-[#ffe1a8]">
												{formatCurrency(item.amount)}
											</p>
											<p className="text-xs text-[rgba(255,225,168,0.6)]">
												{formatTime(item.createdAt)}
											</p>
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
