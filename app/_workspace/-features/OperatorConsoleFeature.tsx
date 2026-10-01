"use client";

import {
	Alert,
	AlertDialog,
	Button,
	Description,
	Input,
	Label,
	Radio,
	RadioGroup,
	Spinner,
	buttonVariants,
} from "@heroui/react";
import { NumberValue, Widget } from "@heroui-pro/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Clipboard, ExternalLink, Link2, MonitorPlay } from "lucide-react";
import { useState, type ReactNode } from "react";
import OtpPinInput from "@/app/components/OtpPinInput";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { GamePerformanceCard } from "@/app/_workspace/-components/GamePerformanceCard";
import { GameStatusChip } from "@/app/_workspace/-components/GameStatusChip";
import { GameTemplatePreview } from "@/app/_workspace/-components/GameTemplatePreview";
import { BudgetMeter, StockMeter, rewardTypeLabels } from "@/app/_workspace/-components/StockMeter";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPercent } from "@/lib/campaignMetrics";
import { PIN_LENGTH, RARITY_LABELS } from "@/lib/lixiPolicy";
import { buildPublicPlayUrl } from "@/lib/publicAppUrl";
import { configRewardSource, supportsSelfServeStationGame } from "@/lib/gameTemplates";
import type { EffectiveGameStatus } from "@/lib/gameStatus";
import { resolveEffectiveGameStatus } from "@/lib/gameStatus";
import type { InventoryRewardType } from "@/lib/rewardInventoryForm";
import { formatScheduleTime } from "@/lib/schedulePolicy";

type DeliveryMode = "station" | "link";

const vndFormat = new Intl.NumberFormat("vi-VN", {
	currency: "VND",
	maximumFractionDigits: 0,
	style: "currency",
});

const sectionActionLinkClass =
	"inline-flex items-center gap-1 rounded-sm text-sm font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** Inventory rows always carry a concrete reward type; the fallback only
 * satisfies the query type's wider union without inventing copy. */
function stationRewardTypeLabel(rewardType: string): string {
	return rewardTypeLabels[rewardType as InventoryRewardType] ?? rewardType;
}

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
	const [cancellingId, setCancellingId] = useState<string | null>(null);
	const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
	const [createdLinkUrl, setCreatedLinkUrl] = useState("");
	const [error, setError] = useState("");

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
	const configureGameLink = (
		<Link
			className={buttonVariants({ variant: "secondary" })}
			params={{ campaignGameId, campaignId: game.campaign.id }}
			to="/campaigns/$campaignId/games/$campaignGameId"
		>
			Cấu hình trò chơi
		</Link>
	);
	if (game.campaign.status !== "active" || game.campaignGame.status !== "active") {
		return (
			<AdminPageShell
				actions={configureGameLink}
				breadcrumbContext={game.campaign.name}
				description="Kích hoạt chiến dịch và trò chơi trước khi tạo lượt chơi mới."
				title="Trò chơi chưa hoạt động"
			>
				<Widget>
					<Widget.Header>
						<Widget.Title>Chưa thể mở bảng vận hành</Widget.Title>
						<Widget.Description>
							Bảng vận hành chỉ nhận lượt mới khi cả chiến dịch và trò chơi đang hoạt động.
						</Widget.Description>
					</Widget.Header>
					<Widget.Content>
						<div className="flex flex-wrap gap-3">
							<Link
								className={buttonVariants({ variant: "primary" })}
								params={{ campaignGameId, campaignId: game.campaign.id }}
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
					</Widget.Content>
				</Widget>
			</AdminPageShell>
		);
	}
	// One computed status chip (R3) shared by all three console bodies.
	const gameStatus: EffectiveGameStatus = resolveEffectiveGameStatus(
		game.campaignGame,
		Date.now(),
	);
	const statusChip = <GameStatusChip status={gameStatus} />;
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
					config={game.campaignGame.config}
					configureGameLink={configureGameLink}
					gameName={game.campaignGame.name}
					heroUrl={game.campaign.heroAsset?.url}
					status={statusChip}
					templateId={game.campaignGame.templateId}
				/>
			);
		}
		// Non-station templates are self-serve through the reusable public
		// link only: participants start from the shared link, not from
		// operator-created sessions or a station screen.
		return (
			<AdminPageShell
				actions={configureGameLink}
				breadcrumbContext={game.campaign.name}
				description="Trò chơi tự phục vụ không cần tạo lượt từng người; chia sẻ liên kết công khai để khách tự vào chơi."
				status={statusChip}
				title="Trò chơi tự phục vụ"
			>
				<div className="admin-split admin-split--preview">
					<div className="admin-split__main">
						<Widget>
							<Widget.Header>
								<Widget.Title>{game.campaignGame.name} chạy qua liên kết công khai</Widget.Title>
								<Widget.Description>
									Tạo liên kết dùng chung và mã QR ở trang Phân phối, sau đó khách tham gia tự bắt đầu
									lượt chơi của mình mà không cần Host PIN.
								</Widget.Description>
							</Widget.Header>
							<Widget.Content>
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
							</Widget.Content>
						</Widget>
					</div>
					<div className="admin-split__side hidden xl:flex">
						<p className="admin-group-label">Màn hình khách</p>
						<GameTemplatePreview
							config={game.campaignGame.config}
							heroUrl={game.campaign.heroAsset?.url}
							templateId={game.campaignGame.templateId}
						/>
						<GamePerformanceCard
							campaignGameId={campaignGameId}
							campaignId={game.campaign.id}
							className="hidden xl:flex"
						/>
					</div>
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
		station.hasSetup &&
		station.availableUnits > 0;
	const pendingLinks = station.pendingLinkSessions;
	const confirmTarget =
		pendingLinks.find((session) => session.id === confirmCancelId) ?? null;
	const createBlocked = !station.hasSetup || station.availableUnits === 0;
	const budget = station.hasSetup ? station.budget : null;
	const activeBudgetItems = budget
		? station.budgetItems.filter((item) => item.isActive)
		: [];

	const copyCreatedLink = async () => {
		try {
			if (!navigator.clipboard) {
				throw new Error("Trình duyệt không hỗ trợ sao chép tự động");
			}
			await navigator.clipboard.writeText(createdLinkUrl);
		} catch (unknownError) {
			setError(unknownError instanceof Error ? unknownError.message : "Không thể sao chép liên kết");
		}
	};

	return (
		<AdminPageShell
			actions={configureGameLink}
			breadcrumbContext={game.campaign.name}
			description={`${game.campaignGame.name}: tạo lượt chơi, quản lý liên kết công khai và khởi chạy trạm.`}
			status={statusChip}
			title="Bảng vận hành trò chơi"
		>
			{error ? (
				<Alert status="danger">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{error}</Alert.Title>
					</Alert.Content>
				</Alert>
			) : null}
			<div className="admin-split admin-split--rail">
				<div className="admin-split__main">
					<Widget>
						<Widget.Header>
							<Widget.Title>Tạo lượt chơi</Widget.Title>
							<Widget.Description>
								Chọn kênh, nhập người tham gia và xác nhận bằng Host PIN.
							</Widget.Description>
						</Widget.Header>
						<Widget.Content className="admin-form max-w-xl">
							{createBlocked ? (
								<Alert status="warning">
									<Alert.Indicator />
									<Alert.Content>
										<Alert.Title>Chưa thể tạo lượt chơi</Alert.Title>
										<Alert.Description>
											Kho phần thưởng của trò chơi này chưa được cấu hình hoặc đã hết.
										</Alert.Description>
									</Alert.Content>
									<Link
										className={buttonVariants({ size: "sm", variant: "secondary" })}
										params={{ campaignId: game.campaign.id }}
										to="/campaigns/$campaignId/rewards"
									>
										Mở kho phần thưởng
									</Link>
								</Alert>
							) : null}
							{createdLinkUrl ? (
								<Alert status="success">
									<Alert.Indicator />
									<Alert.Content>
										<Alert.Title>Đã tạo liên kết chơi công khai</Alert.Title>
										<Alert.Description>
											<span className="break-all">{createdLinkUrl}</span>
										</Alert.Description>
									</Alert.Content>
									<div className="flex flex-wrap gap-2">
										<Button size="sm" variant="secondary" onPress={() => void copyCreatedLink()}>
											<Clipboard aria-hidden="true" size={14} />
											Sao chép
										</Button>
										<Link
											className={buttonVariants({ size: "sm", variant: "ghost" })}
											params={{ campaignId: game.campaign.id }}
											to="/campaigns/$campaignId/distribution"
										>
											Xem mã QR ở Phân phối
										</Link>
									</div>
								</Alert>
							) : null}
							<div className="admin-field">
								<Label htmlFor="operator-delivery">Hình thức</Label>
								<RadioGroup
									id="operator-delivery"
									value={deliveryMode}
									variant="secondary"
									onChange={(next) => setDeliveryMode(next as DeliveryMode)}
								>
									<Radio value="station">
										<Radio.Content>
											<Radio.Control>
												<Radio.Indicator />
											</Radio.Control>
											<span className="min-w-0">
												<span className="block text-sm font-medium text-foreground">Trạm chơi</span>
												<span className="mt-0.5 block text-xs leading-4 text-muted">
													Khách chơi ngay trên màn hình trạm.
												</span>
											</span>
										</Radio.Content>
									</Radio>
									<Radio value="link">
										<Radio.Content>
											<Radio.Control>
												<Radio.Indicator />
											</Radio.Control>
											<span className="min-w-0">
												<span className="block text-sm font-medium text-foreground">Liên kết công khai</span>
												<span className="mt-0.5 block text-xs leading-4 text-muted">
													Gửi liên kết và mã QR cho khách.
												</span>
											</span>
										</Radio.Content>
									</Radio>
								</RadioGroup>
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
								<OtpPinInput
									ariaLabel="Host PIN"
									inputId="operator-pin"
									length={PIN_LENGTH}
									value={hostPin}
									variant="admin"
									onChange={setHostPin}
								/>
								<p className="admin-field__hint">
									Mã 6 số của host, đặt ở{" "}
									<Link
										className="font-medium text-foreground underline-offset-2 hover:underline"
										to="/settings/operations"
									>
										Cài đặt → Vận hành
									</Link>
									.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-4">
								<Button
									isDisabled={!canCreate}
									isPending={pending}
									onPress={async () => {
										setPending(true);
										setError("");
										setCreatedLinkUrl("");
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
												setCreatedLinkUrl(buildPublicPlayUrl(result.publicPlayPath));
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
								<p className="text-sm text-muted tabular-nums">
									Còn {station.availableUnits} lượt khả dụng
								</p>
							</div>
						</Widget.Content>
					</Widget>
					{budget ? (
						<Widget>
							<Widget.Header>
								<Widget.Title>Kho lì xì</Widget.Title>
								<Widget.Description>Ngân sách và số bao còn lại theo mệnh giá.</Widget.Description>
								<Link
									className={sectionActionLinkClass}
									params={{ campaignId: game.campaign.id }}
									to="/campaigns/$campaignId/rewards"
								>
									Mở kho phần thưởng →
								</Link>
							</Widget.Header>
							<Widget.Content className="admin-stack">
								<BudgetMeter
									label="Ngân sách còn lại"
									note={
										budget.totalBudget > 0 ? (
											<>
												Đã trao {vndFormat.format(budget.totalBudget - budget.remainingBudget)} (
												{formatPercent(1 - budget.remainingBudget / budget.totalBudget)})
											</>
										) : undefined
									}
									percent={
										budget.totalBudget > 0
											? (budget.remainingBudget / budget.totalBudget) * 100
											: 0
									}
									progressLabel="Ngân sách còn lại"
									remaining={
										<NumberValue
											currency="VND"
											maximumFractionDigits={0}
											style="currency"
											value={budget.remainingBudget}
										/>
									}
									total={
										<NumberValue
											currency="VND"
											maximumFractionDigits={0}
											style="currency"
											value={budget.totalBudget}
										/>
									}
								/>
								<ul aria-label="Tồn kho theo mệnh giá" className="admin-stock-list">
									{activeBudgetItems.map((item) => (
										<li className="admin-stock-list__row" key={item.id}>
											<span className="admin-stock-list__name">
												{vndFormat.format(item.amount)}
												<span className="text-muted"> · {RARITY_LABELS[item.rarity]}</span>
											</span>
											<StockMeter
												ariaLabel={`Tồn kho mức ${vndFormat.format(item.amount)}`}
												remaining={item.remainingQuantity}
												total={item.totalQuantity}
											/>
										</li>
									))}
								</ul>
							</Widget.Content>
						</Widget>
					) : null}
				</div>
				<div className="admin-split__side">
					<p className="admin-group-label" id="operator-pending-links-label">Liên kết đang chờ</p>
					<div aria-labelledby="operator-pending-links-label" className="flex flex-col" role="group">
						{pendingLinks.map((session) => (
							<div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0" key={session.id}>
								<div className="min-w-0">
									<a
										className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
										href={buildPublicPlayUrl(session.publicPlayPath ?? session.sharePath)}
										rel="noreferrer"
										target="_blank"
									>
										{session.guestNameDisplay}
										<ExternalLink aria-hidden="true" className="ml-2 inline" size={14} />
									</a>
									<p className="mt-0.5 text-xs text-muted">
										Hết hạn {new Date(session.expiresAt).toLocaleString("vi-VN")}
									</p>
								</div>
								<Button
									aria-label={`Hủy liên kết của ${session.guestNameDisplay}`}
									onPress={() => setConfirmCancelId(session.id)}
									size="sm"
									variant="ghost"
								>
									Huỷ
								</Button>
							</div>
						))}
						{pendingLinks.length === 0 ? (
							<p className="text-sm text-muted">Chưa có liên kết đang chờ.</p>
						) : null}
					</div>
					<Link
						className={sectionActionLinkClass}
						params={{ campaignId: game.campaign.id }}
						to="/campaigns/$campaignId/distribution"
					>
						Xem tất cả ở Phân phối →
					</Link>
					<GamePerformanceCard
						campaignGameId={campaignGameId}
						campaignId={game.campaign.id}
						className="hidden xl:flex"
					/>
				</div>
			</div>
			{confirmTarget ? (
				<AlertDialog.Backdrop
					isOpen
					onOpenChange={(isOpen) => {
						if (!isOpen) setConfirmCancelId(null);
					}}
				>
					<AlertDialog.Container placement="center">
						<AlertDialog.Dialog>
							<AlertDialog.Header>
								<AlertDialog.Icon status="warning" />
								<AlertDialog.Heading>Huỷ liên kết của {confirmTarget.guestNameDisplay}?</AlertDialog.Heading>
							</AlertDialog.Header>
							<AlertDialog.Body>
								Liên kết sẽ ngừng hoạt động ngay và không thể khôi phục.
							</AlertDialog.Body>
							<AlertDialog.Footer>
								<Button autoFocus variant="ghost" onPress={() => setConfirmCancelId(null)}>
									Giữ lại
								</Button>
								<Button
									isPending={cancellingId === confirmTarget.id}
									variant="danger"
									onPress={async () => {
										setCancellingId(confirmTarget.id);
										setError("");
										try {
											await cancelSession({ sessionId: confirmTarget.id });
											setConfirmCancelId(null);
										} catch (unknownError) {
											setError(unknownError instanceof Error ? unknownError.message : "Không thể huỷ liên kết");
											setConfirmCancelId(null);
										} finally {
											setCancellingId(null);
										}
									}}
								>
									Huỷ liên kết
								</Button>
							</AlertDialog.Footer>
						</AlertDialog.Dialog>
					</AlertDialog.Container>
				</AlertDialog.Backdrop>
			) : null}
		</AdminPageShell>
	);
}

/**
 * Launch card for station-capable self-serve templates (lucky wheel,
 * scratch card): launch links plus the live inventory meter in the main
 * column, the guest screen preview and per-game performance in the side
 * column. The station screen itself self-admits sessions under the
 * signed-in host, so no per-play form or PIN is needed here.
 */
function StationLaunchCard({
	campaignGameId,
	campaignId,
	campaignName,
	config,
	configureGameLink,
	gameName,
	heroUrl,
	status,
	templateId,
}: {
	campaignGameId: string;
	campaignId: string;
	campaignName: string;
	config: unknown;
	configureGameLink: ReactNode;
	gameName: string;
	heroUrl?: string | null;
	status: ReactNode;
	templateId: string;
}) {
	const stationPlayState = useQuery(api.stationPlay.getStationPlayState, {
		campaignGameId: campaignGameId as Id<"campaignGames">,
	});
	const inventory = stationPlayState?.inventory ?? [];
	const remainingUnits = inventory.reduce((sum, item) => sum + item.quantityRemaining, 0);
	const totalUnits = inventory.reduce((sum, item) => sum + item.quantityTotal, 0);
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
			actions={configureGameLink}
			breadcrumbContext={campaignName}
			description={`${gameName}: mở màn hình trạm; khách tự bắt đầu lượt chơi, phiên được nhận diện kênh “Trạm chơi”.`}
			status={status}
			title="Trạm tự phục vụ"
		>
			{stationPlayState !== undefined && remainingUnits === 0 ? (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Kho phần thưởng đã hết</Alert.Title>
					</Alert.Content>
				</Alert>
			) : null}
			{scheduleWarning ? (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Cửa sổ chơi</Alert.Title>
						<Alert.Description>{scheduleWarning}</Alert.Description>
					</Alert.Content>
				</Alert>
			) : null}
			<div className="admin-split admin-split--preview">
				<div className="admin-split__main">
					<Widget>
						<Widget.Header>
							<Widget.Title>{gameName} sẵn sàng đón khách tại trạm</Widget.Title>
							<Widget.Description>
								Mở màn hình trạm trên thiết bị tại quầy; mỗi khách tự bắt đầu lượt chơi.
							</Widget.Description>
						</Widget.Header>
						<Widget.Content className="admin-stack">
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
							<p className="admin-field__hint">
								Thiết bị trạm cần xác minh Host PIN một lần trước khi đón khách.
							</p>
						</Widget.Content>
					</Widget>
					<Widget>
						<Widget.Header>
							<Widget.Title>Kho phần thưởng</Widget.Title>
							<Link
								className={sectionActionLinkClass}
								params={{ campaignId }}
								to="/campaigns/$campaignId/rewards"
							>
								Mở kho phần thưởng →
							</Link>
						</Widget.Header>
						<Widget.Content className="admin-stack">
							<BudgetMeter
								label="Phần thưởng còn lại trong kho"
								note={`Loại phần thưởng đang bật: ${inventory.length}`}
								percent={totalUnits > 0 ? (remainingUnits / totalUnits) * 100 : 0}
								progressLabel="Tồn kho trạm"
								remaining={remainingUnits.toLocaleString("vi-VN")}
								total={totalUnits.toLocaleString("vi-VN")}
							/>
							{inventory.length > 1 ? (
								<ul aria-label="Tồn kho theo phần thưởng" className="admin-stock-list">
									{inventory.map((item) => (
										<li className="admin-stock-list__row" key={item.id}>
											<span className="admin-stock-list__name">
												{item.name}
												<span className="text-muted"> · {stationRewardTypeLabel(item.rewardType)}</span>
											</span>
											<StockMeter
												ariaLabel={`Tồn kho ${item.name}`}
												remaining={item.quantityRemaining}
												total={item.quantityTotal}
											/>
										</li>
									))}
								</ul>
							) : null}
						</Widget.Content>
					</Widget>
				</div>
				<div className="admin-split__side hidden xl:flex">
					<p className="admin-group-label">Màn hình khách</p>
					<GameTemplatePreview config={config} heroUrl={heroUrl} templateId={templateId} />
					<GamePerformanceCard
						campaignGameId={campaignGameId}
						campaignId={campaignId}
						className="hidden xl:flex"
					/>
				</div>
			</div>
		</AdminPageShell>
	);
}
