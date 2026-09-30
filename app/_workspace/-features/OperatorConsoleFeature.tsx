"use client";

import { Alert, Button, Description, Input, Label, Spinner, buttonVariants } from "@heroui/react";
import { ItemCard, ItemCardGroup, NativeSelect, NumberValue, Widget } from "@heroui-pro/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Link2, MonitorPlay, WalletCards, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PIN_LENGTH } from "@/lib/lixiPolicy";
import { buildPublicPlayUrl } from "@/lib/publicAppUrl";
import { configRewardSource, supportsSelfServeStationGame } from "@/lib/gameTemplates";
import { formatScheduleTime } from "@/lib/schedulePolicy";

type DeliveryMode = "station" | "link";

export function OperatorConsoleFeature({
	campaignGameId,
}: {
	campaignGameId: string;
}) {
	const navigate = useNavigate();
	const game = useQuery(api.campaigns.getCampaignGameRouteContext, {
		campaignGameId: campaignGameId as Id<"campaignGames">,
	});
	const station = useQuery(
		api.draw.getStationState,
		game?.campaign &&
			game.campaign.status === "active" &&
			game.campaignGame.status === "active"
			? { campaignId: game.campaign.id }
			: "skip",
	);
	const createSession = useMutation(api.draw.createSession);
	const cancelSession = useMutation(api.draw.cancelSession);
	const [guestName, setGuestName] = useState("");
	const [hostPin, setHostPin] = useState("");
	const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("station");
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const pendingLinks = useMemo(() => station?.pendingLinkSessions ?? [], [station]);

	if (game === undefined) {
		return (
			<div className="grid min-h-[50vh] place-items-center" role="status">
				<Spinner aria-label="Đang tải bảng vận hành" />
			</div>
		);
	}
	if (!game?.campaign) {
		return (
			<AdminPageShell title="Không tìm thấy trò chơi">
				<Alert status="danger">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Không thể mở bảng vận hành</Alert.Title>
						<Alert.Description>Trò chơi không tồn tại hoặc bạn không có quyền truy cập.</Alert.Description>
					</Alert.Content>
				</Alert>
			</AdminPageShell>
		);
	}
	if (game.campaign.status !== "active" || game.campaignGame.status !== "active") {
		return (
			<AdminPageShell
				breadcrumbContext={game.campaign.name}
				description="Kích hoạt chiến dịch và trò chơi trước khi tạo lượt chơi mới."
				title="Trò chơi chưa hoạt động"
			>
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Chưa thể mở bảng vận hành</Alert.Title>
						<Alert.Description>
							Bảng vận hành chỉ nhận lượt mới khi cả chiến dịch và trò chơi đang hoạt động.
						</Alert.Description>
					</Alert.Content>
				</Alert>
				<div className="flex flex-wrap gap-3">
					<Link
						className={buttonVariants({ variant: "primary" })}
						params={{
							campaignGameId,
							campaignId: game.campaign.id,
						}}
						to="/campaigns/$campaignId/games/$campaignGameId"
					>
						Mở cấu hình trò chơi
					</Link>
					<Link
						className={buttonVariants({ variant: "secondary" })}
						params={{ campaignId: game.campaign.id }}
						to="/campaigns/$campaignId"
					>
						Mở tổng quan chiến dịch
					</Link>
				</div>
			</AdminPageShell>
		);
	}
	if (
		game.campaignGame.templateId !== "li-xi" ||
		configRewardSource(game.campaignGame.config) !== "campaign-budget"
	) {
		if (supportsSelfServeStationGame(game.campaignGame.templateId, game.campaignGame.config)) {
			return (
				<StationLaunchCard
					campaignGameId={campaignGameId}
					campaignId={game.campaign.id}
					campaignName={game.campaign.name}
					gameName={game.campaignGame.name}
				/>
			);
		}
		// Non-station templates are self-serve through the reusable public
		// link only: participants start from the shared link, not from
		// operator-created sessions or a station screen.
		return (
			<AdminPageShell
				breadcrumbContext={game.campaign.name}
				description="Trò chơi tự phục vụ không cần tạo lượt từng người; chia sẻ liên kết công khai để khách tự vào chơi."
				eyebrow={game.campaign.name}
				title="Trò chơi tự phục vụ"
			>
				<Alert status="accent">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{game.campaignGame.name} chạy qua liên kết công khai</Alert.Title>
						<Alert.Description>
							Tạo liên kết dùng chung và mã QR ở trang Phân phối, sau đó khách tham gia tự bắt đầu
							lượt chơi của mình mà không cần Host PIN.
						</Alert.Description>
					</Alert.Content>
				</Alert>
				<div className="flex flex-wrap gap-3">
					<Link
						className={buttonVariants({ variant: "primary" })}
						params={{ campaignId: game.campaign.id }}
						to="/campaigns/$campaignId/distribution"
					>
						Mở trang Phân phối
					</Link>
					<Link
						className={buttonVariants({ variant: "secondary" })}
						params={{ campaignGameId, campaignId: game.campaign.id }}
						to="/campaigns/$campaignId/games/$campaignGameId"
					>
						Mở cấu hình trò chơi
					</Link>
				</div>
			</AdminPageShell>
		);
	}
	if (station === undefined) {
		return (
			<div className="grid min-h-[50vh] place-items-center" role="status">
				<Spinner aria-label="Đang tải trạng thái vận hành" />
			</div>
		);
	}

	const canCreate =
		guestName.trim().length >= 2 &&
		hostPin.length === PIN_LENGTH &&
		!pending &&
		station.hasSetup;

	return (
		<AdminPageShell
			breadcrumbContext={game.campaign.name}
			description="Tạo lượt chơi, quản lý liên kết công khai và khởi chạy trạm."
			eyebrow={game.campaign.name}
			title="Bảng vận hành trò chơi"
		>
			{error || message ? (
				<Alert status={error ? "danger" : "success"}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{error || message}</Alert.Title>
					</Alert.Content>
				</Alert>
			) : null}
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<Widget>
					<Widget.Header>
						<Widget.Title>Tạo lượt chơi</Widget.Title>
						<Widget.Description>
							Chọn kênh, nhập người tham gia và xác nhận bằng Host PIN.
						</Widget.Description>
					</Widget.Header>
					<Widget.Content className="gap-4">
						<div className="admin-field">
							<Label htmlFor="operator-delivery">Kênh chơi</Label>
							<NativeSelect fullWidth variant="secondary">
								<NativeSelect.Trigger
									id="operator-delivery"
									value={deliveryMode}
									onChange={(event) => setDeliveryMode(event.currentTarget.value as DeliveryMode)}
								>
									<NativeSelect.Option value="station">Trạm chơi</NativeSelect.Option>
									<NativeSelect.Option value="link">Liên kết công khai</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
						<div className="admin-field">
							<Label htmlFor="operator-guest">Tên người tham gia</Label>
							<Input
								fullWidth
								id="operator-guest"
								value={guestName}
								variant="secondary"
								onChange={(event) => setGuestName(event.currentTarget.value)}
							/>
							<Description>Tên được kiểm tra duy nhất trong phạm vi chiến dịch.</Description>
						</div>
						<div className="admin-field">
							<Label htmlFor="operator-pin">Host PIN</Label>
							<Input
								fullWidth
								id="operator-pin"
								inputMode="numeric"
								maxLength={PIN_LENGTH}
								type="password"
								value={hostPin}
								variant="secondary"
								onChange={(event) =>
									setHostPin(event.currentTarget.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
								}
							/>
						</div>
						<Button
							isDisabled={!canCreate}
							isPending={pending}
							onPress={async () => {
								setPending(true);
								setError("");
								setMessage("");
								try {
									const result = await createSession({
										campaignId: game.campaign!.id,
										deliveryMode,
										guestName,
										ownerPin: hostPin,
									});
									setGuestName("");
									setHostPin("");
									if (deliveryMode === "station") {
										void navigate({
											to: "/station/$campaignGameId",
											params: { campaignGameId },
										});
									} else {
										if (!result.publicPlayPath) {
											throw new Error("Không nhận được đường dẫn chơi công khai");
										}
										setMessage("Đã tạo liên kết chơi công khai: " + buildPublicPlayUrl(result.publicPlayPath));
									}
								} catch (unknownError) {
									setError(unknownError instanceof Error ? unknownError.message : "Không thể tạo lượt chơi");
								} finally {
									setPending(false);
								}
							}}
						>
							{deliveryMode === "station" ? <MonitorPlay aria-hidden="true" /> : <Link2 aria-hidden="true" />}
							Tạo lượt chơi
						</Button>
					</Widget.Content>
				</Widget>

				<div className="grid content-start gap-6">
					<Widget>
						<Widget.Header>
							<Widget.Title>Kho phần thưởng</Widget.Title>
						</Widget.Header>
						<Widget.Content>
							<ItemCardGroup aria-label="Tình trạng kho phần thưởng" variant="secondary">
								<ItemCard variant="secondary">
									<ItemCard.Icon><WalletCards aria-hidden="true" /></ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>
											<NumberValue value={station?.availableUnits ?? 0} />
										</ItemCard.Title>
										<ItemCard.Description>Lượt còn khả dụng</ItemCard.Description>
									</ItemCard.Content>
								</ItemCard>
							</ItemCardGroup>
						</Widget.Content>
					</Widget>
					<Widget>
						<Widget.Header>
							<Widget.Title>Liên kết đang chờ</Widget.Title>
							<Widget.Description>{pendingLinks.length} liên kết</Widget.Description>
						</Widget.Header>
						<Widget.Content className="gap-3">
							{pendingLinks.map((session) => (
								<div className="flex items-center gap-2 rounded-xl bg-surface-secondary p-3" key={session.id}>
									<a
										className="min-w-0 flex-1 truncate text-sm text-foreground"
										href={buildPublicPlayUrl(session.publicPlayPath ?? session.sharePath)}
										rel="noreferrer"
										target="_blank"
									>
										{session.guestNameDisplay}
										<ExternalLink aria-hidden="true" className="ml-2 inline" size={14} />
									</a>
									<Button
										aria-label={"Hủy liên kết của " + session.guestNameDisplay}
										isIconOnly
										onPress={() => void cancelSession({ sessionId: session.id })}
										variant="danger-soft"
									>
										<X aria-hidden="true" size={16} />
									</Button>
								</div>
							))}
							{pendingLinks.length === 0 ? (
								<p className="text-sm text-muted">Chưa có liên kết đang chờ.</p>
							) : null}
						</Widget.Content>
					</Widget>
				</div>
			</div>
		</AdminPageShell>
	);
}

/**
 * Launch card for station-capable self-serve templates (lucky wheel,
 * scratch card): the station screen link, the live inventory summary, the
 * Host-PIN exit note, and the public-link entry point. The station screen
 * itself self-admits sessions under the signed-in host, so no per-play
 * form or PIN is needed here.
 */
function StationLaunchCard({
	campaignGameId,
	campaignId,
	campaignName,
	gameName,
}: {
	campaignGameId: string;
	campaignId: string;
	campaignName: string;
	gameName: string;
}) {
	const stationPlayState = useQuery(api.stationPlay.getStationPlayState, {
		campaignGameId: campaignGameId as Id<"campaignGames">,
	});
	const inventory = stationPlayState?.inventory ?? [];
	const remainingUnits = inventory.reduce((sum, item) => sum + item.quantityRemaining, 0);
	// Play-window status display; the window itself is enforced server-side at
	// every admission (the station screen blocks Start from the same state).
	const schedule = stationPlayState?.schedule;
	const scheduleWarning =
		schedule?.state === "not-started"
			? `Chưa đến giờ — cửa sổ chơi mở lúc ${formatScheduleTime(schedule.startsAt ?? 0)}.`
			: schedule?.state === "ended"
				? "Đã kết thúc — cửa sổ chơi đã đóng, trạm không nhận lượt mới."
				: null;

	return (
		<AdminPageShell
			breadcrumbContext={campaignName}
			description="Mở màn hình trạm; khách tự bắt đầu lượt chơi, phiên được nhận diện kênh “Trạm chơi”."
			eyebrow={campaignName}
			title="Trạm tự phục vụ"
		>
			<Alert status="accent">
				<Alert.Indicator />
				<Alert.Content>
					<Alert.Title>{gameName} sẵn sàng đón khách tại trạm</Alert.Title>
					<Alert.Description>
						Mở màn hình trạm trên máy tại sự kiện (đã đăng nhập host). Khách nhấn bắt đầu để chơi
						tại chỗ; thoát chế độ trạm luôn cần Host PIN.
					</Alert.Description>
				</Alert.Content>
			</Alert>
			{scheduleWarning ? (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Cửa sổ chơi</Alert.Title>
						<Alert.Description>{scheduleWarning}</Alert.Description>
					</Alert.Content>
				</Alert>
			) : null}
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<Widget>
					<Widget.Header>
						<Widget.Title>Khởi chạy trạm</Widget.Title>
						<Widget.Description>Dành cho màn hình cảm ứng tại sự kiện.</Widget.Description>
					</Widget.Header>
					<Widget.Content className="gap-4">
						<div className="flex flex-wrap items-center gap-3">
							<Link
								className={buttonVariants({ variant: "primary" })}
								params={{ campaignGameId }}
								to="/station/$campaignGameId"
							>
								<MonitorPlay aria-hidden="true" />
								Mở màn hình trạm
							</Link>
							<Link
								className={buttonVariants({ variant: "secondary" })}
								params={{ campaignId }}
								to="/campaigns/$campaignId/distribution"
							>
								<Link2 aria-hidden="true" />
								Liên kết công khai và mã QR
							</Link>
						</div>
						<Description>
							Thoát khỏi màn hình trạm yêu cầu xác minh Host PIN; lượt chơi tại trạm được ghi nhận
							riêng kênh "Trạm chơi" trong phân tích.
						</Description>
					</Widget.Content>
				</Widget>
				<Widget>
					<Widget.Header>
						<Widget.Title>Kho phần thưởng</Widget.Title>
						<Widget.Description>Đồng bộ từ kho của chiến dịch.</Widget.Description>
					</Widget.Header>
					<Widget.Content>
						<ItemCardGroup aria-label="Tình trạng kho phần thưởng trạm" variant="secondary">
							<ItemCard variant="secondary">
								<ItemCard.Icon><WalletCards aria-hidden="true" /></ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>
										<NumberValue value={remainingUnits} />
									</ItemCard.Title>
									<ItemCard.Description>Phần thưởng còn lại trong kho</ItemCard.Description>
								</ItemCard.Content>
							</ItemCard>
							<ItemCard variant="secondary">
								<ItemCard.Icon><MonitorPlay aria-hidden="true" /></ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>
										<NumberValue value={inventory.length} />
									</ItemCard.Title>
									<ItemCard.Description>Loại phần thưởng đang bật</ItemCard.Description>
								</ItemCard.Content>
							</ItemCard>
						</ItemCardGroup>
					</Widget.Content>
				</Widget>
			</div>
		</AdminPageShell>
	);
}
