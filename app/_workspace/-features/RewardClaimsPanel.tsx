"use client";

import type { DataGridColumn } from "@heroui-pro/react";

import { useNavigate, useSearch } from "@tanstack/react-router";
import { Alert, Button, Chip, Description, Input, Label } from "@heroui/react";
import { DataGrid, EmptyState, NativeSelect, NumberValue, Widget } from "@heroui-pro/react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { BadgeCheck, Eye, EyeOff, MoveHorizontal, RotateCcw, Search, Ticket } from "lucide-react";
import { Component, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { REWARD_TYPE_LABELS, type RewardType } from "@/lib/playPolicy";
import { REWARD_CODE_MASK, normalizeRewardCodeSearch } from "@/lib/rewardClaimPolicy";

type ClaimsPage = FunctionReturnType<typeof api.rewardClaims.listRewardClaims>;
type ClaimRow = ClaimsPage["page"][number];

function formatClaimTime(timestamp: number) {
	const date = new Date(timestamp);

	return {
		date: date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }),
		time: date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
	};
}

/** Per-row explicit code reveal: the only surface that shows the full code. */function ClaimCodeCell({ row }: { row: ClaimRow }) {
	const [revealed, setRevealed] = useState(false);
	const reveal = useQuery(
		api.rewardClaims.revealRewardClaimCode,
		revealed ? { claimId: row.claimId } : "skip",
	);

	if (!row.maskedCode) {
		return <span className="text-sm text-muted">Không có mã</span>;
	}

	return (
		<span className="flex min-w-0 flex-col gap-1">
			<span className="font-mono text-sm tabular-nums text-foreground">
				{revealed ? (reveal ? reveal.claim.secretCode ?? REWARD_CODE_MASK : "Đang mở mã…") : row.maskedCode}
			</span>
			<Button
				aria-label={revealed ? `Ẩn mã thưởng ${row.maskedCode}` : `Hiện mã thưởng ${row.maskedCode}`}
				isPending={revealed && reveal === undefined}
				size="sm"
				variant="outline"
				onPress={() => setRevealed((current) => !current)}
			>
				{revealed ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
				{revealed ? "Ẩn mã" : "Hiện mã"}
			</Button>
		</span>
	);
}

/** Per-row fulfil/undo handover action with pending state. */
function ClaimActionCell({ row, onError }: { row: ClaimRow; onError: (message: string) => void }) {
	const markFulfilled = useMutation(api.rewardClaims.markRewardClaimFulfilled);
	const undoFulfilled = useMutation(api.rewardClaims.undoRewardClaimFulfilment);
	const [pending, setPending] = useState(false);

	const run = async () => {
		setPending(true);
		try {
			if (row.fulfilmentState === "pending") {
				await markFulfilled({ claimId: row.claimId });
			} else {
				await undoFulfilled({ claimId: row.claimId });
			}
		} catch {
			onError("Không cập nhật được trạng thái trao thưởng. Thử lại sau.");
		} finally {
			setPending(false);
		}
	};

	return (
		<Button
			isPending={pending}
			size="sm"
			variant={row.fulfilmentState === "pending" ? "secondary" : "outline"}
			onPress={() => void run()}
		>
			{row.fulfilmentState === "pending" ? (
				<BadgeCheck aria-hidden="true" size={14} />
			) : (
				<RotateCcw aria-hidden="true" size={14} />
			)}
			{row.fulfilmentState === "pending" ? "Đánh dấu đã trao" : "Hoàn tác"}
		</Button>
	);
}

interface ErrorBoundaryProps {
	children: ReactNode;
}
interface ErrorBoundaryState {
	hasError: boolean;
}

/** Keeps a failed claims page inside the widget frame with a retry affordance. */
class ClaimsErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasError: true };
	}

	render() {
		if (this.state.hasError) {
			return (
				<Widget.Content>
					<EmptyState size="sm">
						<EmptyState.Header>
							<EmptyState.Media variant="icon">
								<Ticket aria-hidden="true" size={22} strokeWidth={2} />
							</EmptyState.Media>
							<EmptyState.Title>Không tải được hàng đợi trao thưởng</EmptyState.Title>
							<EmptyState.Description>
								Đã có lỗi khi tải dữ liệu. Thử tải lại trang.
							</EmptyState.Description>
						</EmptyState.Header>
					</EmptyState>
				</Widget.Content>
			);
		}

		return this.props.children;
	}
}

/**
 * Campaign-scoped claims queue (slice 4b): URL-persisted filters, exact-code
 * search, masked codes with explicit reveal, and fulfil/undo handover.
 * Legacy li xi redemptions keep their own read-only tables.
 */
export function RewardClaimsPanel({ campaignId }: { campaignId: Id<"campaigns"> }) {
	const navigate = useNavigate();
	const search = useSearch({ from: "/_workspace/analytics" });
	const [actionError, setActionError] = useState<string | null>(null);
	const [codeDraft, setCodeDraft] = useState(search.claimsCode ?? "");

	const claims = usePaginatedQuery(
		api.rewardClaims.listRewardClaims,
		{
			campaignId,
			...(search.claimsStatus ? { fulfilmentState: search.claimsStatus } : {}),
			...(search.claimsChannel ? { channel: search.claimsChannel } : {}),
			...(search.claimsRewardType ? { rewardType: search.claimsRewardType } : {}),
			...(search.claimsCode ? { codeSearch: search.claimsCode } : {}),
		},
		{ initialNumItems: 30 },
	);
	const rows = claims.results;

	const updateFilter = (patch: Partial<{
		claimsStatus: "pending" | "fulfilled" | undefined;
		claimsChannel: "public-link" | "station" | undefined;
		claimsRewardType: "cash" | "voucher" | "physical" | "points" | "none" | undefined;
		claimsCode: string | undefined;
	}>) => {
		void navigate({
			to: "/analytics",
			search: (previous) => ({
				...previous,
				view: previous.view ?? "overview",
				...patch,
			}),
		});
	};

	const claimColumns: DataGridColumn<ClaimRow>[] = [
		{
			cell: (item) => (
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-foreground">
						{item.participantDisplayName ?? "Khách ẩn danh"}
					</span>
					<span className="truncate text-xs text-muted">
						{item.game.name ?? "Trò chơi đã xoá"} · {item.channelLabel ?? "Không rõ kênh"}
					</span>
				</span>
			),
			header: "Người tham gia",
			id: "participant",
			isRowHeader: true,
			minWidth: 160,
		},
		{
			allowsSorting: true,
			cell: (item) => {
				const claimedAt = formatClaimTime(item.claimedAt);

				return (
					<span className="flex flex-col text-sm">
						<span className="tabular-nums text-foreground">{claimedAt.date}</span>
						<span className="tabular-nums text-muted">{claimedAt.time}</span>
					</span>
				);
			},
			header: "Thời gian nhận",
			id: "claimedAt",
			minWidth: 104,
			sortFn: (a, b) => a.claimedAt - b.claimedAt,
		},
		{
			cell: (item) => (
				<span className="flex min-w-0 flex-col gap-1">
					<span className="truncate text-foreground">{item.reward.label ?? "Phần thưởng"}</span>
					<span className="flex items-center gap-2">
						<Chip size="sm" variant="soft">
							{REWARD_TYPE_LABELS[item.reward.rewardType as RewardType] ?? item.reward.rewardType}
						</Chip>
						{item.reward.amount !== null ? (
							<NumberValue
								className="text-xs tabular-nums text-muted"
								currency="VND"
								maximumFractionDigits={0}
								style="currency"
								value={item.reward.amount}
							/>
						) : null}
					</span>
				</span>
			),
			header: "Phần thưởng",
			id: "reward",
			minWidth: 150,
		},
		{
			cell: (item) => <ClaimCodeCell row={item} />,
			header: "Mã thưởng",
			id: "code",
			minWidth: 124,
		},
		{
			cell: (item) => (
				<span className="flex min-w-0 flex-col items-start gap-1">
					<Chip
						color={item.fulfilmentState === "fulfilled" ? "success" : "warning"}
						size="sm"
						variant="soft"
					>
						{item.fulfilmentState === "fulfilled" ? "Đã trao" : "Chờ trao"}
					</Chip>
					<ClaimActionCell row={item} onError={setActionError} />
					{item.fulfilledAt ? (
						<span className="text-xs tabular-nums text-muted">
							{formatClaimTime(item.fulfilledAt).date}
						</span>
					) : null}
				</span>
			),
			header: "Trao thưởng",
			id: "handover",
			minWidth: 182,
		},
	];

	return (
		<Widget>
			<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
				<div>
					<Widget.Title>Hàng đợi trao thưởng</Widget.Title>
					<Widget.Description>
						Mã thưởng được che mặc định — dùng “Hiện mã” khi trao trực tiếp cho khách.
					</Widget.Description>
				</div>
				<Chip variant="soft">
					<Chip.Label>{rows.length.toLocaleString("vi-VN")} yêu cầu đã hiện</Chip.Label>
				</Chip>
			</Widget.Header>
			<ClaimsErrorBoundary>
				<Widget.Content className="gap-5">
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						<div className="admin-field">
							<Label htmlFor="claims-status-filter">Trạng thái</Label>
							<NativeSelect fullWidth variant="secondary">
								<NativeSelect.Trigger
									aria-label="Lọc theo trạng thái trao thưởng"
									id="claims-status-filter"
									value={search.claimsStatus ?? "all"}
									onChange={(event) => {
										const next = event.currentTarget.value;
										updateFilter({
											claimsStatus: next === "all" ? undefined : next as "pending" | "fulfilled",
										});
									}}
								>
									<NativeSelect.Option value="all">Tất cả trạng thái</NativeSelect.Option>
									<NativeSelect.Option value="pending">Chờ trao</NativeSelect.Option>
									<NativeSelect.Option value="fulfilled">Đã trao</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
						<div className="admin-field">
							<Label htmlFor="claims-channel-filter">Kênh chơi</Label>
							<NativeSelect fullWidth variant="secondary">
								<NativeSelect.Trigger
									aria-label="Lọc theo kênh chơi"
									id="claims-channel-filter"
									value={search.claimsChannel ?? "all"}
									onChange={(event) => {
										const next = event.currentTarget.value;
										updateFilter({
											claimsChannel: next === "all" ? undefined : next as "public-link" | "station",
										});
									}}
								>
									<NativeSelect.Option value="all">Tất cả kênh</NativeSelect.Option>
									<NativeSelect.Option value="public-link">Liên kết công khai</NativeSelect.Option>
									<NativeSelect.Option value="station">Trạm chơi</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
						<div className="admin-field">
							<Label htmlFor="claims-reward-filter">Loại thưởng</Label>
							<NativeSelect fullWidth variant="secondary">
								<NativeSelect.Trigger
									aria-label="Lọc theo loại thưởng"
									id="claims-reward-filter"
									value={search.claimsRewardType ?? "all"}
									onChange={(event) => {
										const next = event.currentTarget.value;
										updateFilter({
											claimsRewardType: next === "all"
												? undefined
												: next as "cash" | "voucher" | "physical" | "points" | "none",
										});
									}}
								>
									<NativeSelect.Option value="all">Tất cả loại</NativeSelect.Option>
									{(Object.keys(REWARD_TYPE_LABELS) as RewardType[])
										.filter((rewardType) => rewardType !== "none")
										.map((rewardType) => (
											<NativeSelect.Option key={rewardType} value={rewardType}>
												{REWARD_TYPE_LABELS[rewardType]}
											</NativeSelect.Option>
										))}
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
						<form
							className="admin-field"
							onSubmit={(event) => {
								event.preventDefault();
								const normalized = normalizeRewardCodeSearch(codeDraft);
								setActionError(null);
								updateFilter({ claimsCode: normalized ? normalized : undefined });
							}}
						>
							<Label htmlFor="claims-code-search">Tìm đúng mã thưởng</Label>
							<div className="flex flex-wrap gap-2">
								<Input
									fullWidth
									id="claims-code-search"
									inputMode="text"
									placeholder="Nhập mã đầy đủ"
									variant="secondary"
									value={codeDraft}
									onChange={(event) => setCodeDraft(event.currentTarget.value)}
								/>
								<Button type="submit" variant="outline">
									<Search aria-hidden="true" size={16} />
									Tìm
								</Button>
								{search.claimsCode ? (
									<Button
										aria-label="Xóa tìm kiếm mã thưởng"
										type="button"
										variant="outline"
										onPress={() => {
											setCodeDraft("");
											updateFilter({ claimsCode: undefined });
										}}
									>
										Xóa
									</Button>
								) : null}
							</div>
							<Description>
								Tìm kiếm khớp toàn phần mã thưởng, không tìm theo một phần.
							</Description>
						</form>
					</div>
					{actionError ? (
						<Alert status="danger">
							<Alert.Indicator />
							<Alert.Content>
								<Alert.Title>{actionError}</Alert.Title>
							</Alert.Content>
						</Alert>
					) : null}
					{claims.status === "LoadingFirstPage" ? (
						<EmptyState size="sm">
							<EmptyState.Header>
								<EmptyState.Media variant="icon">
									<Ticket aria-hidden="true" size={22} strokeWidth={2} />
								</EmptyState.Media>
								<EmptyState.Title>Đang tải hàng đợi trao thưởng</EmptyState.Title>
								<EmptyState.Description>
									Danh sách yêu cầu nhận thưởng sẽ xuất hiện trong giây lát.
								</EmptyState.Description>
							</EmptyState.Header>
						</EmptyState>
					) : rows.length === 0 ? (
						<EmptyState size="sm">
							<EmptyState.Header>
								<EmptyState.Media variant="icon">
									<Ticket aria-hidden="true" size={22} strokeWidth={2} />
								</EmptyState.Media>
								<EmptyState.Title>
									{search.claimsCode || search.claimsStatus || search.claimsChannel || search.claimsRewardType
										? "Không có yêu cầu khớp bộ lọc"
										: "Chưa có lượt nhận thưởng nào"}
								</EmptyState.Title>
								<EmptyState.Description>
									{search.claimsCode || search.claimsStatus || search.claimsChannel || search.claimsRewardType
										? "Thử xoá bộ lọc hoặc tìm bằng mã khác."
										: "Yêu cầu sẽ xuất hiện khi khách chơi nhận thưởng."}
								</EmptyState.Description>
							</EmptyState.Header>
						</EmptyState>
					) : (
						<>
							<DataGrid
								allowsColumnResize
								aria-label="Bảng yêu cầu nhận thưởng"
								columns={claimColumns}
								contentClassName="min-w-[720px]"
								data={rows}
								defaultSortDescriptor={{ column: "claimedAt", direction: "descending" }}
								getRowId={(item) => item.claimId}
								scrollContainerClassName="max-h-[560px] overflow-auto"
								variant="secondary"
							/>
							<p className="flex items-center gap-1.5 text-xs text-muted lg:hidden">
								<MoveHorizontal aria-hidden="true" size={14} />
								Vuốt ngang bảng để xem các cột còn lại
							</p>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="text-sm text-muted">
									Đã hiện {rows.length.toLocaleString("vi-VN")} yêu cầu
									{claims.status === "Exhausted" ? " — đã hết dữ liệu" : ""}
								</p>
								{claims.status === "CanLoadMore" || claims.status === "LoadingMore" ? (
									<Button
										isPending={claims.status === "LoadingMore"}
										variant="outline"
										onPress={() => claims.loadMore(30)}
									>
										Tải thêm yêu cầu
									</Button>
								) : null}
							</div>
						</>
					)}
				</Widget.Content>
			</ClaimsErrorBoundary>
		</Widget>
	);
}
