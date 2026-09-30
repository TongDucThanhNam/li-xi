"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { gameTemplates } from "@/app/game-templates/registry";
import {
	configRewardSource,
	supportsSelfServeStationGame,
} from "@/lib/gameTemplates";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import type { Rarity } from "@/lib/lixiPolicy";
import { StationPinDialog } from "./StationPinDialog";
import { StationSelfServePlay } from "./StationSelfServePlay";

export type StationRouteContext = FunctionReturnType<
	typeof api.campaigns.getCampaignGameRouteContext
>;

export function StationPlayFeature({
	campaignGameId,
}: {
	campaignGameId: string;
}) {
	const navigate = useNavigate();
	const context = useQuery(api.campaigns.getCampaignGameRouteContext, {
		campaignGameId: campaignGameId as Id<"campaignGames">,
	});
	const verifyHostPin = useMutation(api.auth.verifyHostPin);
	const [exitOpen, setExitOpen] = useState(false);
	const [exitError, setExitError] = useState("");
	const exitTriggerRef = useRef<HTMLButtonElement>(null);
	const closeExitDialog = () => {
		setExitOpen(false);
		setExitError("");
		requestAnimationFrame(() => exitTriggerRef.current?.focus());
	};

	if (context === undefined) {
		return (
			<main className="station-status" role="status">
				Đang tải trạm chơi…
			</main>
		);
	}
	if (!context?.campaign) {
		return (
			<main className="station-status">
				<section className="station-status__card">
					<h1 className="station-status__title">Không thể mở trạm chơi</h1>
					<p className="station-status__text">
						Trò chơi không tồn tại hoặc bạn không có quyền truy cập.
					</p>
					<Link className="station-status__link" to="/campaigns">
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
			<main className="station-status">
				<section className="station-status__card">
					<h1 className="station-status__title">Trạm chơi chưa hoạt động</h1>
					<p className="station-status__text">
						Kích hoạt chiến dịch và trò chơi trước khi đón người tham gia.
					</p>
					<Link
						className="station-status__link"
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
	const templateId = context.campaignGame.templateId;
	const legacyLiXiStation =
		templateId === "li-xi" &&
		configRewardSource(context.campaignGame.config) === "campaign-budget";
	const selfServeStationGame =
		!legacyLiXiStation &&
		supportsSelfServeStationGame(templateId, context.campaignGame.config);
	if (!legacyLiXiStation && !selfServeStationGame) {
		// Station mode is a li xi operator flow plus the self-serve-station
		// templates; quiz, slot, and non-inventory games keep failing closed
		// while their participants use the reusable public link instead.
		return (
			<main className="station-status">
				<section className="station-status__card">
					<h1 className="station-status__title">Trò chơi tự phục vụ</h1>
					<p className="station-status__text">
						{context.campaignGame.name} dành cho khách tự vào chơi qua liên kết công khai. Hãy chia
						se liên kết hoặc mã QR từ trang Phân phối; luồng trạm cho mẫu này sẽ ra mắt sau.
					</p>
					<Link
						className="station-status__link"
						params={{ campaignId: context.campaign.id }}
						to="/campaigns/$campaignId/distribution"
					>
						Mở trang Phân phối
					</Link>
				</section>
			</main>
		);
	}

	return (
		<main className="station-shell" data-template={templateId}>
			<button
				className="station-exit-trigger"
				onClick={() => {
					setExitError("");
					setExitOpen(true);
				}}
				ref={exitTriggerRef}
				type="button"
			>
				Thoát chế độ trạm
			</button>
			{legacyLiXiStation ? (
				<LiXiStationPlay context={context} />
			) : (
				<StationSelfServePlay campaignGameId={campaignGameId} />
			)}
			{exitOpen ? (
				<StationPinDialog
					cancelLabel="Ở lại"
					description="Nhập mã vận hành để quay lại bảng điều khiển."
					error={exitError}
					ids={{
						title: "station-exit-title",
						description: "station-exit-description",
						input: "station-exit-pin",
						error: "station-exit-error",
					}}
					submitLabel="Xác minh"
					title="Xác minh Host PIN"
					onClose={closeExitDialog}
					onSubmit={async (pin) => {
						setExitError("");
						try {
							await verifyHostPin({ pin });
							void navigate({
								to: "/operate/$campaignGameId",
								params: { campaignGameId },
								replace: true,
							});
						} catch (error) {
							setExitError(error instanceof Error ? error.message : "Không thể xác minh PIN");
						}
					}}
				/>
			) : null}
		</main>
	);
}

/**
 * Legacy li xi station flow: the host creates each session from the
 * operator console under a verified Host PIN, and this component plays the
 * pending draw session reactively. Behavior, copy, and data flow are
 * unchanged — only its mounting point moved inside the shared station
 * shell above.
 */
function LiXiStationPlay({
	context,
}: {
	context: StationRouteContext;
}) {
	const station = useQuery(
		api.draw.getStationState,
		context?.campaign &&
			context.campaign.status === "active" &&
			context.campaignGame.status === "active" &&
			context.campaignGame.templateId === "li-xi" &&
			configRewardSource(context.campaignGame.config) === "campaign-budget"
			? { campaignId: context.campaign.id }
			: "skip",
	);
	const redeem = useMutation(api.draw.redeem);
	const [revealing, setRevealing] = useState(false);
	const [collected, setCollected] = useState(false);
	const pendingSession = collected ? null : station?.pendingSession ?? null;
	const campaign = pendingSession?.campaign ?? station?.activeCampaign ?? context?.campaign ?? null;
	const rewardPool = useMemo(
		() => pendingSession?.rewardPool ?? [],
		[pendingSession?.rewardPool],
	);
	// Station mode is a li xi operator flow; the guard above fails closed for
	// other templates before this concrete registry lookup.
	const Stage = gameTemplates["li-xi"].Stage;
	const canStart = Boolean(pendingSession && rewardPool.length > 0);
	const heroAssetUrl = campaign
		? "heroAssetUrl" in campaign
			? campaign.heroAssetUrl
			: campaign.heroAsset?.url ?? null
		: null;

	if (station === undefined) {
		return (
			<main className="station-status" role="status">
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

	return (
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
	);
}
