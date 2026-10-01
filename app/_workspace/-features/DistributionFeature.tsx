"use client";

import { Alert, Button, Chip, Spinner, buttonVariants } from "@heroui/react";
import { EmptyState, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Clipboard, ExternalLink, QrCode } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { GameStatusChip } from "@/app/_workspace/-components/GameStatusChip";
import { GameTemplateIcon } from "@/app/_workspace/-components/GameTemplateIcon";
import { ShareLinksPanel } from "@/app/_workspace/-features/ShareLinksPanel";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPublicPlayUrl } from "@/lib/publicAppUrl";
import { resolveEffectiveGameStatus } from "@/lib/gameStatus";
import {
	configRewardSource,
	supportsSelfServeStationGame,
	type GameTemplateId,
} from "@/lib/gameTemplates";

export function DistributionFeature({ campaignId }: { campaignId: string }) {
	const campaign = useQuery(api.campaigns.getCampaignRouteContext, {
		campaignId: campaignId as Id<"campaigns">,
	});
	const gamesContext = useQuery(api.campaigns.getCampaignGamesRouteContext, {
		campaignId: campaignId as Id<"campaigns">,
	});
	const station = useQuery(
		api.draw.getStationState,
		campaign ? { campaignId: campaign.id } : "skip",
	);
	const [feedback, setFeedback] = useState("");
	const [error, setError] = useState("");

	if (campaign === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải kênh phân phối" /></div>;
	}
	if (!campaign) {
		return (
			<AdminPageShell title="Không tìm thấy chiến dịch">
				<EmptyState>
					<EmptyState.Header>
						<EmptyState.Media variant="icon"><QrCode aria-hidden="true" /></EmptyState.Media>
						<EmptyState.Title>Không thể mở kênh phân phối</EmptyState.Title>
						<EmptyState.Description>Chiến dịch không tồn tại hoặc bạn không có quyền truy cập.</EmptyState.Description>
					</EmptyState.Header>
					<EmptyState.Content><Link to="/campaigns">Quay lại danh sách chiến dịch</Link></EmptyState.Content>
				</EmptyState>
			</AdminPageShell>
		);
	}
	if (station === undefined) {
		return <div className="grid min-h-[50vh] place-items-center" role="status"><Spinner aria-label="Đang tải kênh phân phối" /></div>;
	}

	const campaignGames = gamesContext?.campaignGames ?? [];
	const copyLink = async (url: string, guestName: string) => {
		setError("");
		setFeedback("");
		try {
			if (!navigator.clipboard) throw new Error("Trình duyệt không hỗ trợ sao chép tự động");
			await navigator.clipboard.writeText(url);
			setFeedback(`Đã sao chép liên kết của ${guestName}.`);
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể sao chép liên kết");
		}
	};

	const pendingLinks = station.pendingLinkSessions;
	const liXiBudgetGame =
		campaignGames.find(
			(game) =>
				game.templateId === "li-xi" &&
				configRewardSource(game.config) === "campaign-budget",
		) ?? null;
	const showSessionLinks = liXiBudgetGame !== null || pendingLinks.length > 0;
	// Station rows are the games that can run at a counter: the budget li xi
	// draw or a self-serve-station template backed by campaign inventory.
	const stationGames = campaignGames.filter(
		(game) =>
			(game.templateId === "li-xi" &&
				configRewardSource(game.config) === "campaign-budget") ||
			supportsSelfServeStationGame(game.templateId, game.config),
	);
	const linkOnlyGameNames = campaignGames
		.filter((game) => !stationGames.some((stationGame) => stationGame.id === game.id))
		.map((game) => game.name);

	return (
		<AdminPageShell
			breadcrumbContext={campaign.name}
			description="Tạo liên kết chơi và mã QR cho từng kênh, hoặc mở trò chơi tại quầy."
			tabs={<CampaignContextNav campaignId={campaignId} />}
			title="Phân phối"
		>
			{liXiBudgetGame && !station.hasSetup ? (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Chưa cấu hình ngân sách phần thưởng</Alert.Title>
						<Alert.Description>Trò chơi dùng ngân sách chưa thể tạo lượt chơi.</Alert.Description>
					</Alert.Content>
					<Link
						className={buttonVariants({ size: "sm", variant: "secondary" })}
						params={{ campaignId: campaign.id }}
						to="/campaigns/$campaignId/rewards"
					>
						Mở kho phần thưởng
					</Link>
				</Alert>
			) : null}
			{error || feedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content>
				</Alert>
			) : null}
			<ShareLinksPanel
				campaignId={campaignId}
				games={campaignGames.map((game) => ({
					id: game.id,
					name: game.name,
					templateId: game.templateId,
					status: game.status,
					schedule: game.schedule,
				}))}
			/>
			{stationGames.length > 0 ? (
				<Widget>
					<Widget.Header>
						<Widget.Title>Mở trạm và vận hành</Widget.Title>
						<Widget.Description>
							Trò chơi chạy tại quầy: host vận hành bằng Host PIN hoặc khách tự chơi trên màn
							hình trạm.
						</Widget.Description>
					</Widget.Header>
					<Widget.Content>
						<ul aria-label="Mở trạm và vận hành" className="admin-rows">
							{stationGames.map((game) => {
								const budgetLiXi =
									game.templateId === "li-xi" &&
									configRewardSource(game.config) === "campaign-budget";
								const modeText = budgetLiXi
									? "Host tạo lượt chơi bằng Host PIN"
									: "Trạm tự phục vụ";
								const status = resolveEffectiveGameStatus(game, Date.now());
								return (
									<li className="admin-row admin-row--actions" key={game.id}>
										<div className="admin-row__main">
											<span className="admin-icon-tile">
												<GameTemplateIcon templateId={game.templateId as GameTemplateId} />
											</span>
											<span className="admin-row__text">
												<span className="admin-row__title">{game.name}</span>
												<span className="admin-row__meta">{modeText}</span>
											</span>
											{status.state !== "live" ? (
												<span className="admin-row__chips">
													<GameStatusChip status={status} />
												</span>
											) : null}
										</div>
										<div className="admin-row__actions">
											<Link
												className={buttonVariants({ size: "sm", variant: "secondary" })}
												params={{ campaignGameId: game.id }}
												to="/operate/$campaignGameId"
											>
												Vận hành
											</Link>
											<Link
												className={buttonVariants({ size: "sm", variant: "secondary" })}
												params={{ campaignGameId: game.id }}
												to="/station/$campaignGameId"
											>
												Mở trạm
											</Link>
										</div>
									</li>
								);
							})}
						</ul>
						{linkOnlyGameNames.length > 0 ? (
							<p className="admin-field__hint">
								{`${linkOnlyGameNames.join(", ")} chỉ chơi qua liên kết công khai.`}
							</p>
						) : null}
					</Widget.Content>
				</Widget>
			) : null}
			{showSessionLinks ? (
				<Widget>
					<Widget.Header>
						<Widget.Title>Liên kết theo lượt chơi</Widget.Title>
						<Widget.Description>
							Mỗi liên kết thuộc một lượt chơi do host tạo ở bảng vận hành và tự hết hạn.
						</Widget.Description>
					</Widget.Header>
					<Widget.Content>
						{pendingLinks.length === 0 ? (
							<div className="flex flex-wrap items-center gap-3">
								<p className="text-sm text-muted">Chưa có liên kết đang chờ.</p>
								{liXiBudgetGame ? (
									<Link
										className="text-sm font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-focus"
										params={{ campaignGameId: liXiBudgetGame.id }}
										to="/operate/$campaignGameId"
									>
										Mở bảng vận hành
									</Link>
								) : null}
							</div>
						) : (
							<div className="flex flex-col">
								{pendingLinks.map((session) => {
									const publicUrl = buildPublicPlayUrl(session.publicPlayPath ?? session.sharePath);
									return (
										<article
											className="grid gap-4 border-t border-border py-4 first:border-t-0 first:pt-0 sm:grid-cols-[auto_minmax(0,1fr)]"
											key={session.id}
										>
											<div className="grid place-items-center rounded-xl bg-white p-2">
												<QRCodeSVG
													bgColor="#ffffff"
													fgColor="#111111"
													level="M"
													marginSize={2}
													size={96}
													title={`Mã QR liên kết chơi của ${session.guestNameDisplay}`}
													value={publicUrl}
												/>
											</div>
											<div className="min-w-0">
												<div className="flex flex-wrap items-center gap-2">
													<h2 className="min-w-0 truncate text-sm font-medium text-foreground">
														{session.guestNameDisplay}
													</h2>
													<Chip color="success" size="sm" variant="soft">Đang chờ</Chip>
												</div>
												<p className="mt-2 break-all text-sm text-foreground">{publicUrl}</p>
												<p className="mt-1 text-xs text-muted">
													Hết hạn {new Date(session.expiresAt).toLocaleString("vi-VN")}
												</p>
												<div className="mt-3 flex flex-wrap gap-2">
													<Button
														size="sm"
														variant="secondary"
														onPress={() => void copyLink(publicUrl, session.guestNameDisplay)}
													>
														<Clipboard aria-hidden="true" size={14} />
														Sao chép
													</Button>
													<a
														className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground"
														href={publicUrl}
														rel="noreferrer"
														target="_blank"
													>
														<ExternalLink aria-hidden="true" size={14} />
														Mở liên kết
													</a>
												</div>
											</div>
										</article>
									);
								})}
							</div>
						)}
					</Widget.Content>
				</Widget>
			) : null}
		</AdminPageShell>
	);
}
