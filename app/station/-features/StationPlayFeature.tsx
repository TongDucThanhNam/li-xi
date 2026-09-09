"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { getGameTemplate, resolveCampaignGameTemplateId } from "@/app/game-templates/registry";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PIN_LENGTH, type Rarity } from "@/lib/lixiPolicy";

export function StationPlayFeature({
	campaignGameId,
}: {
	campaignGameId: string;
}) {
	const navigate = useNavigate();
	const context = useQuery(api.campaigns.getCampaignGameRouteContext, {
		campaignGameId: campaignGameId as Id<"campaignGames">,
	});
	const station = useQuery(
		api.draw.getStationState,
		context?.campaign &&
			context.campaign.status === "active" &&
			context.campaignGame.status === "active"
			? { campaignId: context.campaign.id }
			: "skip",
	);
	const redeem = useMutation(api.draw.redeem);
	const verifyHostPin = useMutation(api.auth.verifyHostPin);
	const [revealing, setRevealing] = useState(false);
	const [collected, setCollected] = useState(false);
	const [exitOpen, setExitOpen] = useState(false);
	const [hostPin, setHostPin] = useState("");
	const [exitError, setExitError] = useState("");
	const exitTriggerRef = useRef<HTMLButtonElement>(null);
	const exitDialogRef = useRef<HTMLFormElement>(null);
	const pendingSession = collected ? null : station?.pendingSession ?? null;
	const campaign = pendingSession?.campaign ?? station?.activeCampaign ?? context?.campaign ?? null;
	const rewardPool = useMemo(
		() => pendingSession?.rewardPool ?? [],
		[pendingSession?.rewardPool],
	);
	const template = getGameTemplate(
		resolveCampaignGameTemplateId(context?.campaignGame.templateId),
	);
	const Stage = template.Stage;
	const canStart = Boolean(pendingSession && rewardPool.length > 0);
	const heroAssetUrl = campaign
		? "heroAssetUrl" in campaign
			? campaign.heroAssetUrl
			: campaign.heroAsset?.url ?? null
		: null;

	if (context === undefined) {
		return (
			<main className="grid min-h-dvh place-items-center bg-black-ink text-gold-shine" role="status">
				Đang tải trạm chơi…
			</main>
		);
	}
	if (!context?.campaign) {
		return (
			<main className="grid min-h-dvh place-items-center bg-black-ink p-6 text-gold-shine">
				<section className="w-full max-w-md rounded-2xl border border-gold-base/40 bg-red-deep/80 p-6 text-center">
					<h1 className="font-cinzel text-2xl">Không thể mở trạm chơi</h1>
					<p className="mt-3 font-vn text-sm text-gold-shine/70">
						Trò chơi không tồn tại hoặc bạn không có quyền truy cập.
					</p>
					<Link
						className="mt-6 rounded-full border border-gold-base/50 px-5 py-2 font-vn"
						to="/campaigns"
					>
						Quay lại Campaign Studio
					</Link>
				</section>
			</main>
		);
	}
	if (
		context.campaign.status !== "active" ||
		context.campaignGame.status !== "active"
	) {
		return (
			<main className="grid min-h-dvh place-items-center bg-black-ink p-6 text-gold-shine">
				<section className="w-full max-w-md rounded-2xl border border-gold-base/40 bg-red-deep/80 p-6 text-center">
					<h1 className="font-cinzel text-2xl">Trạm chơi chưa hoạt động</h1>
					<p className="mt-3 font-vn text-sm text-gold-shine/70">
						Kích hoạt chiến dịch và trò chơi trước khi đón người tham gia.
					</p>
					<Link
						className="mt-6 inline-flex rounded-full border border-gold-base/50 px-5 py-2 font-vn"
						params={{
							campaignGameId,
							campaignId: context.campaign.id,
						}}
						to="/campaigns/$campaignId/games/$campaignGameId"
					>
						Mở cấu hình trò chơi
					</Link>
				</section>
			</main>
		);
	}
	if (station === undefined) {
		return (
			<main className="grid min-h-dvh place-items-center bg-black-ink text-gold-shine" role="status">
				Đang tải trạng thái trạm chơi…
			</main>
		);
	}

	const handleRedeem = async (envelopeIndex: number): Promise<{ amount: number; rarity: Rarity }> => {
		if (!pendingSession) throw new Error("Trạm đang chờ lượt chơi tiếp theo");
		setRevealing(true);
		try {
			const result = await redeem({
				sessionId: pendingSession.id,
				envelopeIndex,
			});
			return { amount: result.amount, rarity: result.rarity };
		} catch (error) {
			setRevealing(false);
			throw error;
		}
	};
	const closeExitDialog = () => {
		setExitOpen(false);
		setHostPin("");
		setExitError("");
		requestAnimationFrame(() => exitTriggerRef.current?.focus());
	};

	return (
		<main className="relative h-dvh w-screen overflow-hidden bg-black-ink">
			<button
				className="absolute right-3 top-3 z-50 rounded-full border border-gold-base/50 bg-black-ink/70 px-4 py-2 font-vn text-sm text-gold-shine backdrop-blur"
				onClick={() => {
					setHostPin("");
					setExitError("");
					setExitOpen(true);
				}}
				ref={exitTriggerRef}
				type="button"
			>
				Thoát chế độ trạm
			</button>
			<Stage
				canStart={canStart}
				campaignSubtitle={
					campaign?.claimSubtitle ?? campaign?.brandName ?? campaign?.description ?? undefined
				}
				campaignTitle={campaign?.claimHeadline ?? campaign?.name ?? undefined}
				collectLabel={campaign?.claimCollectLabel ?? undefined}
				ctaLabel={campaign?.claimCtaLabel ?? undefined}
				disabled={revealing || !canStart}
				guestName={pendingSession?.guestNameDisplay}
				heroAssetUrl={heroAssetUrl}
				onCollect={() => {
					setCollected(true);
					setRevealing(false);
				}}
				onRedeem={handleRedeem}
				onRevealStateChange={setRevealing}
				rewardPool={rewardPool}
				sessionKey={pendingSession?.id ?? null}
				statusMessage={canStart ? undefined : "Trạm đang chờ lượt chơi tiếp theo."}
				waitingMessage={campaign?.claimWaitingMessage ?? "Đang chờ lượt chơi tiếp theo"}
			/>
			{exitOpen ? (
				<div className="absolute inset-0 z-[60] grid place-items-center bg-black-ink/95 p-6">
					<form
						aria-describedby="station-exit-description"
						aria-labelledby="station-exit-title"
						aria-modal="true"
						className="w-full max-w-sm rounded-2xl border border-gold-base/50 bg-red-deep p-6 text-gold-shine"
						ref={exitDialogRef}
						role="dialog"
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								closeExitDialog();
								return;
							}
							if (event.key !== "Tab") return;
							const focusable = Array.from(
								exitDialogRef.current?.querySelectorAll<HTMLElement>(
									'input:not([disabled]), button:not([disabled])',
								) ?? [],
							);
							const first = focusable[0];
							const last = focusable.at(-1);
							if (!first || !last) return;
							if (event.shiftKey && document.activeElement === first) {
								event.preventDefault();
								last.focus();
							} else if (!event.shiftKey && document.activeElement === last) {
								event.preventDefault();
								first.focus();
							}
						}}
						onSubmit={async (event) => {
							event.preventDefault();
							setExitError("");
							try {
								await verifyHostPin({ pin: hostPin });
								void navigate({
									to: "/operate/$campaignGameId",
									params: { campaignGameId },
									replace: true,
								});
							} catch (error) {
								setExitError(error instanceof Error ? error.message : "Không thể xác minh PIN");
							}
						}}
					>
						<h2 className="font-cinzel text-xl" id="station-exit-title">Xác minh Host PIN</h2>
						<p className="mt-2 font-vn text-sm text-gold-shine/70" id="station-exit-description">
							Nhập mã vận hành để quay lại bảng điều khiển.
						</p>
						<label className="mt-5 block font-vn text-sm" htmlFor="station-exit-pin">Host PIN</label>
						<input
							autoFocus
							className="mt-2 w-full rounded-xl border border-gold-base/50 bg-black-ink/60 px-4 py-3 text-gold-shine outline-none focus:border-gold-base"
							id="station-exit-pin"
							inputMode="numeric"
							maxLength={PIN_LENGTH}
							aria-describedby={exitError ? "station-exit-error" : undefined}
							aria-invalid={Boolean(exitError)}
							onChange={(event) =>
								setHostPin(event.currentTarget.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
							}
							type="password"
							value={hostPin}
						/>
						{exitError ? <p className="mt-2 text-sm text-gold-shine" id="station-exit-error" role="alert">{exitError}</p> : null}
						<div className="mt-5 flex gap-3">
							<button className="mag-btn flex-1" disabled={hostPin.length !== PIN_LENGTH} type="submit">
								Xác minh
							</button>
							<button className="rounded-full border border-gold-base/50 px-4 py-2" onClick={closeExitDialog} type="button">
								Ở lại
							</button>
						</div>
					</form>
				</div>
			) : null}
		</main>
	);
}
