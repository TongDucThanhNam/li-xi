"use client";

import { useCallback, useState } from "react";
import { Alert, Button, Chip, Input, Label, Modal } from "@heroui/react";
import { EmptyState, NativeSelect, Widget } from "@heroui-pro/react";
import { useMutation, useQuery } from "convex/react";
import { Clipboard, ExternalLink, Link2, Plus, RotateCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/convex/_generated/api";
import { ScheduleStatusChip, scheduleRangeText } from "@/app/_workspace/-components/ScheduleStatusChip";
import type { GameTemplateId } from "@/lib/gameTemplates";
import type { Id } from "@/convex/_generated/dataModel";
import { conversionRate, formatPercent } from "@/lib/campaignMetrics";
import { buildShareEntryUrlForCode } from "@/lib/publicAppUrl";

type ShareLinkGame = {
	id: string;
	name: string;
	templateId: GameTemplateId;
	status: "draft" | "active" | "archived";
	schedule: { startsAt: number | null; endsAt: number | null };
};

export function ShareLinksPanel({
	campaignId,
	games,
}: {
	campaignId: string;
	games: ShareLinkGame[];
}) {
	const links = useQuery(api.shareLinks.listShareLinks, { campaignId: campaignId as Id<"campaigns"> });
	const breakdown = useQuery(api.analytics.getCampaignShareLinkBreakdown, {
		campaignId: campaignId as Id<"campaigns">,
	});
	const createShareLink = useMutation(api.shareLinks.createShareLink);
	const revokeShareLink = useMutation(api.shareLinks.revokeShareLink);
	const restoreShareLink = useMutation(api.shareLinks.restoreShareLink);

	const activeGames = games.filter((game) => game.status === "active");
	const [selectedGameId, setSelectedGameId] = useState<string>("");
	const [channel, setChannel] = useState("qr");
	const [label, setLabel] = useState("");
	const [pending, setPending] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [createError, setCreateError] = useState("");
	const [info, setInfo] = useState("");
	const [error, setError] = useState("");

	const effectiveGameId = selectedGameId || activeGames[0]?.id || "";
	const selectedGame = activeGames.find((game) => game.id === effectiveGameId);
	const selectedGameHasWindow =
		selectedGame !== undefined &&
		(selectedGame.schedule.startsAt !== null || selectedGame.schedule.endsAt !== null);

	const openCreateDialog = useCallback(() => {
		setCreateError("");
		setCreateOpen(true);
	}, []);

	const handleCreate = useCallback(async () => {
		if (!effectiveGameId) {
			return;
		}
		setPending(true);
		setCreateError("");
		try {
			const result = await createShareLink({
				campaignGameId: effectiveGameId as Id<"campaignGames">,
				channel: channel || "direct",
				label: label || undefined,
			});
			setInfo("Đã tạo liên kết chơi công khai mới.");
			setCreateOpen(false);
			setLabel("");
			void result;
		} catch (unknownError) {
			setCreateError(unknownError instanceof Error ? unknownError.message : "Không thể tạo liên kết");
		} finally {
			setPending(false);
		}
	}, [channel, createShareLink, effectiveGameId, label]);

	const copyLink = useCallback(async (shareCode: string) => {
		setError("");
		setInfo("");
		try {
			if (!navigator.clipboard) {
				throw new Error("Trình duyệt không hỗ trợ sao chép tự động");
			}
			await navigator.clipboard.writeText(buildShareEntryUrlForCode(shareCode));
			setInfo("Đã sao chép liên kết chơi công khai.");
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể sao chép liên kết");
		}
	}, []);

	return (
		<Widget>
			<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
				<div className="grid min-w-0 gap-1">
					<Widget.Title>Liên kết chơi công khai</Widget.Title>
					<Widget.Description>
						Mỗi liên kết dùng chung cho nhiều người chơi: khách tự bắt đầu lượt chơi, không cần
						Host PIN. Mã QR và kênh cho biết khách đến từ đâu.
					</Widget.Description>
				</div>
				{activeGames.length > 0 ? (
					<Button onPress={openCreateDialog}>
						<Plus aria-hidden="true" size={16} />
						Tạo liên kết
					</Button>
				) : null}
			</Widget.Header>
			{/* A link list, not a form: admin-stack lets rows span the widget so
			    the stats columns end at the widget's right padding (Q7). */}
			<Widget.Content className="admin-stack">
				{info || error ? (
					<Alert status={error ? "danger" : "success"}>
						<Alert.Indicator />
						<Alert.Content><Alert.Title>{error || info}</Alert.Title></Alert.Content>
					</Alert>
				) : null}

				{activeGames.length === 0 ? (
					<EmptyState size="sm">
						<EmptyState.Header>
							<EmptyState.Media variant="icon"><Link2 aria-hidden="true" /></EmptyState.Media>
							<EmptyState.Title>Cần một trò chơi đang chạy</EmptyState.Title>
							<EmptyState.Description>
								Kích hoạt ít nhất một trò chơi của chiến dịch để tạo liên kết công khai mới. Các
								liên kết đã tạo bên dưới vẫn có thể thu hồi hoặc mở lại.
							</EmptyState.Description>
						</EmptyState.Header>
					</EmptyState>
				) : null}

				{links === undefined ? (
					<p className="text-sm text-muted" role="status">Đang tải liên kết…</p>
				) : links.links.length === 0 ? (
					<p className="text-sm text-muted">
						Chưa có liên kết nào. Bấm “Tạo liên kết” để nhận URL và mã QR.
					</p>
				) : (
					<div aria-label="Danh sách liên kết chơi công khai" className="admin-link-list" role="group">
						{links.links.map((link) => {
							const publicUrl = buildShareEntryUrlForCode(link.shareCode);
							const isActive = link.status === "active";
							const row = breakdown?.rows.find((candidate) => candidate.shareLinkId === link.id);
							const title = link.label || `Liên kết ${link.channel}`;
							return (
								<article className="admin-link-row" data-status={link.status} key={link.id}>
									<div className="admin-link-row__qr">
										<QRCodeSVG
											bgColor="#ffffff"
											fgColor="#111111"
											level="M"
											marginSize={2}
											size={80}
											title={`Mã QR liên kết chơi công khai (${link.channel})`}
											value={publicUrl}
										/>
									</div>
									<div className="admin-link-row__main">
										<div className="admin-link-row__title">
											<h2>{title}</h2>
											<Chip color={isActive ? "success" : "default"} size="sm" variant="soft">
												{isActive ? "Đang hoạt động" : "Đã thu hồi"}
											</Chip>
											<Chip size="sm" variant="soft">Kênh: {link.channel}</Chip>
										</div>
										<p className="admin-link-row__meta">
											Trò chơi: {link.campaignGameName ?? "—"} · Tạo {new Date(link.createdAt).toLocaleString("vi-VN")}
										</p>
										<p className="admin-link-row__url">{publicUrl}</p>
										<div className="admin-link-row__actions">
											<Button size="sm" variant="secondary" onPress={() => void copyLink(link.shareCode)}>
												<Clipboard aria-hidden="true" size={14} />
												Sao chép
											</Button>
											{isActive ? (
												<a
													className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground"
													href={publicUrl}
													rel="noreferrer"
													target="_blank"
												>
													<ExternalLink aria-hidden="true" size={14} />
													Mở liên kết
												</a>
											) : null}
											{isActive ? (
												<Button
													className="md:ml-auto"
													size="sm"
													variant="ghost"
													onPress={() => void revokeShareLink({ shareLinkId: link.id as Id<"publicPlayLinks"> })}
												>
													Thu hồi
												</Button>
											) : (
												<Button
													className="md:ml-auto"
													size="sm"
													variant="ghost"
													onPress={() => void restoreShareLink({ shareLinkId: link.id as Id<"publicPlayLinks"> })}
												>
													<RotateCcw aria-hidden="true" size={14} />
													Mở lại
												</Button>
											)}
										</div>
									</div>
									{breakdown !== undefined ? (
										<dl className="admin-link-row__stats">
											<div>
												<dt>Lượt truy cập</dt>
												<dd>{(row?.linkOpens ?? 0).toLocaleString("vi-VN")}</dd>
											</div>
											<div>
												<dt>Hoàn tất</dt>
												<dd>{(row?.completions ?? 0).toLocaleString("vi-VN")}</dd>
											</div>
											<div>
												<dt>Chuyển đổi</dt>
												<dd>{formatPercent(row ? conversionRate(row) : null)}</dd>
											</div>
										</dl>
									) : null}
								</article>
							);
						})}
					</div>
				)}
			</Widget.Content>
			<Modal.Backdrop isOpen={createOpen} onOpenChange={setCreateOpen}>
				<Modal.Container placement="center">
					<Modal.Dialog className="sm:max-w-lg">
						<Modal.Header>
							<Modal.Heading>Tạo liên kết chơi</Modal.Heading>
							<Modal.CloseTrigger aria-label="Đóng" />
						</Modal.Header>
						<Modal.Body>
							<div className="admin-form">
								{createError ? (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content><Alert.Title>{createError}</Alert.Title></Alert.Content>
									</Alert>
								) : null}
								<div className="admin-field">
									<Label htmlFor="share-link-game">Trò chơi</Label>
									<NativeSelect fullWidth variant="secondary">
										<NativeSelect.Trigger
											aria-label="Trò chơi của liên kết"
											id="share-link-game"
											value={effectiveGameId}
											onChange={(event) => setSelectedGameId(event.currentTarget.value)}
										>
											{activeGames.map((game) => (
												<NativeSelect.Option key={game.id} value={game.id}>
													{game.name}
												</NativeSelect.Option>
											))}
											<NativeSelect.Indicator />
										</NativeSelect.Trigger>
									</NativeSelect>
									{selectedGame ? (
										<p className="admin-field__hint flex flex-wrap items-center gap-2">
											{selectedGameHasWindow ? (
												<>
													<ScheduleStatusChip schedule={selectedGame.schedule} />
													<span>{scheduleRangeText(selectedGame.schedule)}</span>
												</>
											) : (
												<span>Không giới hạn thời gian.</span>
											)}
										</p>
									) : null}
								</div>
								<div className="admin-field">
									<Label htmlFor="share-link-channel">Kênh</Label>
									<Input
										fullWidth
										id="share-link-channel"
										value={channel}
										variant="secondary"
										onChange={(event) => setChannel(event.currentTarget.value)}
									/>
									<p className="admin-field__hint">Mã kênh dùng trong báo cáo, ví dụ qr, facebook, zalo.</p>
								</div>
								<div className="admin-field">
									<Label htmlFor="share-link-label">Ghi chú (tuỳ chọn)</Label>
									<Input
										fullWidth
										id="share-link-label"
										value={label}
										variant="secondary"
										onChange={(event) => setLabel(event.currentTarget.value)}
									/>
									<p className="admin-field__hint">Tên dễ nhớ hiển thị trong danh sách liên kết.</p>
								</div>
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button isDisabled={pending} variant="ghost" onPress={() => setCreateOpen(false)}>
								Huỷ
							</Button>
							<Button isPending={pending} onPress={() => void handleCreate()}>
								<Plus aria-hidden="true" size={16} />
								Tạo liên kết
							</Button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Widget>
	);
}
