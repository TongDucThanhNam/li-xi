"use client";

import { useCallback, useState } from "react";
import { Alert, Button, Chip, Input, Label } from "@heroui/react";
import { EmptyState, ItemCard, ItemCardGroup, NativeSelect, Widget } from "@heroui-pro/react";
import { useMutation, useQuery } from "convex/react";
import { Clipboard, ExternalLink, Link2, Plus, QrCode, RotateCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/convex/_generated/api";
import type { GameTemplateId } from "@/lib/gameTemplates";
import type { Id } from "@/convex/_generated/dataModel";
import { buildShareEntryUrlForCode } from "@/lib/publicAppUrl";

type ShareLinkGame = {
	id: string;
	name: string;
	templateId: GameTemplateId;
	status: "draft" | "active" | "archived";
};

export function ShareLinksPanel({
	campaignId,
	games,
}: {
	campaignId: string;
	games: ShareLinkGame[];
}) {
	const links = useQuery(api.shareLinks.listShareLinks, { campaignId: campaignId as Id<"campaigns"> });
	const createShareLink = useMutation(api.shareLinks.createShareLink);
	const revokeShareLink = useMutation(api.shareLinks.revokeShareLink);
	const restoreShareLink = useMutation(api.shareLinks.restoreShareLink);

	const activeGames = games.filter((game) => game.status === "active");
	const [selectedGameId, setSelectedGameId] = useState<string>("");
	const [channel, setChannel] = useState("qr");
	const [label, setLabel] = useState("");
	const [pending, setPending] = useState(false);
	const [info, setInfo] = useState("");
	const [error, setError] = useState("");

	const effectiveGameId = selectedGameId || activeGames[0]?.id || "";

	const handleCreate = useCallback(async () => {
		if (!effectiveGameId) {
			return;
		}
		setPending(true);
		setError("");
		setInfo("");
		try {
			const result = await createShareLink({
				campaignGameId: effectiveGameId as Id<"campaignGames">,
				channel: channel || "direct",
				label: label || undefined,
			});
			setInfo("Đã tạo liên kết chơi công khai mới.");
			void result;
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể tạo liên kết");
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
					<Widget.Title>Liên kết chơi công khai dùng chung</Widget.Title>
					<Widget.Description>
						Một liên kết phục vụ nhiều người chơi độc lập: mỗi khách tự bắt đầu lượt chơi của
						mình, không cần tạo lượt trước hay Host PIN. Mã QR nhận diện kênh phân phối.
					</Widget.Description>
				</div>
			</Widget.Header>
			<Widget.Content className="gap-4">
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
				) : (
					<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto] md:items-end">
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
							</div>
						<div>
							<Button isPending={pending} onPress={() => void handleCreate()}>
								<Plus aria-hidden="true" size={16} />
								Tạo liên kết
							</Button>
						</div>
					</div>
				)}

				{links === undefined ? (
							<p className="text-sm text-muted" role="status">Đang tải liên kết…</p>
						) : links.links.length === 0 ? (
							<EmptyState size="sm">
								<EmptyState.Header>
									<EmptyState.Media variant="icon"><QrCode aria-hidden="true" /></EmptyState.Media>
									<EmptyState.Title>Chưa có liên kết dùng chung</EmptyState.Title>
									<EmptyState.Description>Tạo liên kết đầu tiên để chia sẻ hoặc in mã QR.</EmptyState.Description>
								</EmptyState.Header>
							</EmptyState>
						) : (
							<ItemCardGroup aria-label="Danh sách liên kết chơi công khai" variant="secondary">
								{links.links.map((link) => {
									const publicUrl = buildShareEntryUrlForCode(link.shareCode);
									const isActive = link.status === "active";
									return (
										<ItemCard className="items-start" key={link.id} variant="secondary">
											<ItemCard.Icon><Link2 aria-hidden="true" /></ItemCard.Icon>
											<ItemCard.Content className="gap-2">
												<div className="flex flex-wrap items-center gap-2">
													<Chip color={isActive ? "success" : "default"} size="sm" variant="soft">
														{isActive ? "Đang hoạt động" : "Đã thu hồi"}
													</Chip>
													<Chip size="sm" variant="soft">Kênh: {link.channel}</Chip>
													{link.label ? <Chip size="sm" variant="soft">{link.label}</Chip> : null}
												</div>
												<div className="flex flex-wrap items-center gap-4">
													<div className="grid place-items-center rounded-xl bg-white p-2">
														<QRCodeSVG
															bgColor="#ffffff"
															fgColor="#111111"
															level="M"
															marginSize={2}
															size={96}
															title={`Mã QR liên kết chơi công khai (${link.channel})`}
															value={publicUrl}
														/>
													</div>
													<div className="min-w-0">
														<p className="break-all text-xs text-muted">{publicUrl}</p>
														<p className="mt-1 text-xs text-muted">
															Trò chơi: {link.campaignGameName ?? "—"} · Tạo {new Date(link.createdAt).toLocaleString("vi-VN")}
														</p>
														<div className="mt-3 flex flex-wrap gap-2">
															<Button size="sm" variant="outline" onPress={() => void copyLink(link.shareCode)}>
																<Clipboard aria-hidden="true" size={14} />
																Sao chép
															</Button>
															<a
																aria-hidden={isActive ? undefined : true}
																className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground"
																href={isActive ? publicUrl : undefined}
																rel="noreferrer"
																target="_blank"
																tabIndex={isActive ? 0 : -1}
															>
																<ExternalLink aria-hidden="true" size={14} />
																Mở liên kết
															</a>
														</div>
													</div>
												</div>
											</ItemCard.Content>
											<ItemCard.Action>
												{isActive ? (
													<Button
														size="sm"
														variant="danger-soft"
														onPress={() => void revokeShareLink({ shareLinkId: link.id as Id<"publicPlayLinks"> })}
													>
														Thu hồi
													</Button>
												) : (
													<Button
														size="sm"
														variant="outline"
														onPress={() => void restoreShareLink({ shareLinkId: link.id as Id<"publicPlayLinks"> })}
													>
														<RotateCcw aria-hidden="true" size={14} />
														Mở lại
													</Button>
												)}
											</ItemCard.Action>
										</ItemCard>
									);
								})}
						</ItemCardGroup>
					)}
			</Widget.Content>
		</Widget>
	);
}
