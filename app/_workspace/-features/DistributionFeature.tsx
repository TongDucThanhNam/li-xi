"use client";

import { Alert, Button, Chip, Spinner } from "@heroui/react";
import { EmptyState, ItemCard, ItemCardGroup, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Clipboard, ExternalLink, Link2, MonitorPlay, QrCode } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { ShareLinksPanel } from "@/app/_workspace/-features/ShareLinksPanel";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPublicPlayUrl } from "@/lib/publicAppUrl";

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

	if (campaign === undefined || (campaign && station === undefined)) {
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

	const campaignGameId = campaign.campaignGame.id;
	const pendingLinks = station?.pendingLinkSessions ?? [];
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

	return (
		<AdminPageShell
			breadcrumbContext={campaign.name}
			description="Theo dõi kênh trạm, liên kết chơi công khai và mã QR của các lượt đang chờ."
			eyebrow={campaign.name}
			title="Phân phối"
		>
			<CampaignContextNav campaignId={campaignId} />
			<ShareLinksPanel
				campaignId={campaignId}
				games={(gamesContext?.campaignGames ?? []).map((game) => ({
					id: game.id,
					name: game.name,
					templateId: game.templateId,
					status: game.status,
				}))}
			/>
			{error || feedback ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content><Alert.Title>{error || feedback}</Alert.Title></Alert.Content>
				</Alert>
			) : null}
			<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
				<Widget>
					<Widget.Header>
						<Widget.Title>Liên kết chơi công khai</Widget.Title>
						<Widget.Description>Mỗi liên kết thuộc một lượt chơi và hết hạn theo chính sách chiến dịch.</Widget.Description>
					</Widget.Header>
					<Widget.Content className="gap-4">
						{pendingLinks.length === 0 ? (
							<EmptyState size="sm">
								<EmptyState.Header>
									<EmptyState.Media variant="icon"><Link2 aria-hidden="true" /></EmptyState.Media>
									<EmptyState.Title>Chưa có liên kết đang chờ</EmptyState.Title>
									<EmptyState.Description>Tạo một lượt chơi ở bảng vận hành để nhận liên kết `/play` và mã QR.</EmptyState.Description>
								</EmptyState.Header>
								<EmptyState.Content>
									{campaignGameId ? <Link className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground" params={{ campaignGameId }} to="/operate/$campaignGameId">Mở bảng vận hành</Link> : null}
								</EmptyState.Content>
							</EmptyState>
						) : (
							<div className="grid gap-4">
								{pendingLinks.map((session) => {
									const publicUrl = buildPublicPlayUrl(session.publicPlayPath ?? session.sharePath);
									return (
										<article className="grid gap-4 rounded-xl border border-border bg-surface-secondary p-4 sm:grid-cols-[128px_minmax(0,1fr)]" key={session.id}>
											<div className="grid place-items-center rounded-xl bg-white p-2">
												<QRCodeSVG
													bgColor="#ffffff"
													fgColor="#111111"
													level="M"
													marginSize={2}
													size={112}
													title={`Mã QR liên kết chơi của ${session.guestNameDisplay}`}
													value={publicUrl}
												/>
											</div>
											<div className="min-w-0">
												<div className="flex flex-wrap items-start justify-between gap-2">
													<div className="min-w-0">
														<h2 className="truncate font-medium text-foreground">{session.guestNameDisplay}</h2>
														<p className="truncate text-sm text-muted">{session.campaignName ?? campaign.name}</p>
													</div>
													<Chip color="success" size="sm" variant="soft">Đang chờ</Chip>
												</div>
												<p className="mt-2 break-all text-xs text-muted">{publicUrl}</p>
												<p className="mt-1 text-xs text-muted">
													Hết hạn {new Date(session.expiresAt).toLocaleString("vi-VN")}
												</p>
												<div className="mt-4 flex flex-wrap gap-2">
													<Button size="sm" variant="outline" onPress={() => void copyLink(publicUrl, session.guestNameDisplay)}>
														<Clipboard aria-hidden="true" size={15} />
														Sao chép
													</Button>
													<a className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground" href={publicUrl} rel="noreferrer" target="_blank">
														<ExternalLink aria-hidden="true" size={15} />
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
				<div className="grid content-start gap-6">
					<Widget>
						<Widget.Header>
							<Widget.Title>Trạng thái kênh</Widget.Title>
							<Widget.Description>Điểm vào hiện có của trò chơi chiến dịch.</Widget.Description>
						</Widget.Header>
						<Widget.Content>
							<ItemCardGroup aria-label="Trạng thái kênh phân phối" variant="secondary">
								<ItemCard variant="secondary">
									<ItemCard.Icon><MonitorPlay aria-hidden="true" /></ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>Trạm tại sự kiện</ItemCard.Title>
										<ItemCard.Description>{station?.hasSetup ? "Kho phần thưởng đã sẵn sàng." : "Cần cấu hình phần thưởng trước khi chơi."}</ItemCard.Description>
									</ItemCard.Content>
									<ItemCard.Action><Chip color={station?.hasSetup ? "success" : "warning"} size="sm" variant="soft">{station?.hasSetup ? "Sẵn sàng" : "Cần thiết lập"}</Chip></ItemCard.Action>
								</ItemCard>
								<ItemCard variant="secondary">
									<ItemCard.Icon><Link2 aria-hidden="true" /></ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>Liên kết công khai</ItemCard.Title>
										<ItemCard.Description>{pendingLinks.length} liên kết đang chờ.</ItemCard.Description>
									</ItemCard.Content>
								</ItemCard>
							</ItemCardGroup>
						</Widget.Content>
					</Widget>
					{campaignGameId ? (
						<Widget>
							<Widget.Header><Widget.Title>Khởi chạy</Widget.Title></Widget.Header>
							<Widget.Content className="gap-3">
								<Link className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground" params={{ campaignGameId }} to="/operate/$campaignGameId">Mở bảng vận hành</Link>
								<Link className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-foreground" params={{ campaignGameId }} to="/station/$campaignGameId">Mở trạm chơi</Link>
							</Widget.Content>
						</Widget>
					) : null}
				</div>
			</div>
		</AdminPageShell>
	);
}
