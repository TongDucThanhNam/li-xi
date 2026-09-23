"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Button,
	Chip,
	Description,
	Input,
	Label,
	NumberField,
} from "@heroui/react";
import { EmptyState, ItemCard, ItemCardGroup, NativeSelect, Widget } from "@heroui-pro/react";
import { useMutation, useQuery } from "convex/react";
import { Gift, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	buildInventoryPayload,
	captureSubmittedIntentions,
	changeInventoryRowType,
	createInventoryRow,
	hasUnsavedInventoryEdits,
	inventoryRowFromItem,
	isSaveResponseCurrent,
	reconcileSavedIds,
	saveOutcomeMessage,
	serializeInventoryDraft,
	type InventoryFormRow,
	type InventoryRewardType,
} from "@/lib/rewardInventoryForm";

const rewardTypeLabels: Record<InventoryRewardType, string> = {
	cash: "Tiền mặt",
	voucher: "Voucher / mã quà",
	physical: "Quà tặng",
	points: "Điểm",
};

const inventoryAmountTypes = new Set<InventoryRewardType>(["cash", "points"]);

/** NumberField commits NaN for a cleared input; render that as empty. */
function numericFieldValue(raw: string): number | undefined {
	const parsed = Number(raw);
	return raw.trim() !== "" && Number.isFinite(parsed) ? parsed : undefined;
}

/** Numeric edits: a cleared/invalid commit becomes an empty draft value. */
function numericEditValue(value: number): string {
	return Number.isFinite(value) ? String(value) : "";
}

/**
 * Generic reward inventory for the self-serve play flow (lucky wheel and
 * future templates). The legacy cash budget editor stays untouched for the
 * li xi draw-era flows; the two pools never mix. Rows reference their stored
 * inventory ids so an unchanged save preserves stored voucher codes and pool
 * tags, and all draft state is isolated per campaign.
 */
export function RewardInventoryPanel({ campaignId }: { campaignId: Id<"campaigns"> }) {
	const inventory = useQuery(api.rewardInventory.getRewardInventory, { campaignId });
	const configureRewardInventory = useMutation(api.rewardInventory.configureRewardInventory);
	const [rows, setRows] = useState<InventoryFormRow[]>([]);
	const [hydratedCampaignId, setHydratedCampaignId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [savedStatus, setSavedStatus] = useState<string | null>(null);
	const [error, setError] = useState("");
	// Latest committed rows for async save continuations.
	const rowsRef = useRef<InventoryFormRow[]>([]);
	rowsRef.current = rows;
	// Whole-draft snapshot of what the server holds after the last completed
	// save; any later user edit (field, add or remove) makes the draft count
	// as unsaved and clears the stale saved status.
	const savedSnapshotRef = useRef<string | null>(null);
	// Async form state is scoped to the mounted campaign instance: a campaign
	// switch bumps the epoch and a new save bumps the sequence, so success,
	// error AND finally work from an older request can never populate, mark
	// saved, or clear the pending state of a newer instance or request.
	const campaignEpochRef = useRef(0);
	const saveSeqRef = useRef(0);

	// Campaign switch: drop the previous campaign's draft immediately so
	// stale rows cannot be rendered or saved under the new campaign.
	useEffect(() => {
		campaignEpochRef.current += 1;
		setHydratedCampaignId(null);
		setRows([]);
		setError("");
		setSavedStatus(null);
		setSaving(false);
		savedSnapshotRef.current = null;
	}, [campaignId]);

	useEffect(() => {
		if (!inventory || hydratedCampaignId === campaignId) {
			return;
		}
		setRows(
			inventory.items.length > 0
				? inventory.items.map((item) => inventoryRowFromItem(item))
				: [
						createInventoryRow({
							name: "Voucher 50.000đ",
							rewardType: "voucher",
							quantity: "20",
							weight: "20",
						}),
						createInventoryRow({
							name: "Điểm thưởng 100",
							rewardType: "points",
							amount: "100",
							quantity: "50",
							weight: "60",
						}),
					],
		);
		setHydratedCampaignId(campaignId);
	}, [campaignId, hydratedCampaignId, inventory]);

	const inventoryReady = Boolean(inventory) && hydratedCampaignId === campaignId;

	const totalUnits = useMemo(
		() =>
			rows.reduce((sum, row) => {
				const quantity = Number(row.quantity);
				return Number.isInteger(quantity) && quantity > 0 ? sum + quantity : sum;
			}, 0),
		[rows],
	);

	const updateRow = useCallback((key: string, patch: Partial<InventoryFormRow>) => {
		setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
		setSavedStatus(null);
	}, []);

	const addRow = useCallback((row: InventoryFormRow) => {
		setRows((current) => [...current, row]);
		setSavedStatus(null);
	}, []);

	const removeRow = useCallback((key: string) => {
		setRows((current) => current.filter((candidate) => candidate.key !== key));
		setSavedStatus(null);
	}, []);

	const handleSave = useCallback(async () => {
		if (!inventoryReady || saving) {
			// Draft not hydrated for THIS campaign: never save stale rows.
			return;
		}
		const payload = buildInventoryPayload(rows);
		if (!payload.ok) {
			setError(payload.error);
			setSavedStatus(null);
			return;
		}
		const submittedRows = rows;
		const submittedIntentions = captureSubmittedIntentions(rows);
		const requestEpoch = campaignEpochRef.current;
		const requestSeq = ++saveSeqRef.current;
		setSaving(true);
		setError("");
		setSavedStatus(null);
		try {
			const result = await configureRewardInventory({
				campaignId,
				items: payload.items.map((item) => ({
					...item,
					existingItemId: item.existingItemId as Id<"rewardInventory"> | undefined,
				})),
			});
			// Only the newest request for the still-mounted campaign applies:
			// responses captured before a campaign switch (or superseded by a
			// newer request) are discarded, along with their finally work.
			if (
				!isSaveResponseCurrent({
					requestEpoch,
					requestSeq,
					currentEpoch: campaignEpochRef.current,
					latestSeq: saveSeqRef.current,
				})
			) {
				return;
			}
			// Two reconciliations with the same returned ids/intentions: the
			// SUBMITTED rows reconstruct the server version for the saved
			// baseline (the server never saw newer edits), while the LATEST
			// mounted draft is reconciled only for display so newer edits stay
			// intact and flagged unsaved.
			const currentRows = rowsRef.current;
			const serverVersion = reconcileSavedIds(
				submittedRows,
				payload.keys,
				result.ids,
				submittedIntentions,
			);
			const reconciled = reconcileSavedIds(
				currentRows,
				payload.keys,
				result.ids,
				submittedIntentions,
			);
			savedSnapshotRef.current = serializeInventoryDraft(serverVersion);
			setRows(reconciled);
			setSavedStatus(
				saveOutcomeMessage({
					submittedRows,
					currentRows,
					savedCount: payload.items.length,
					totalUnits,
				}).message,
			);
		} catch (unknownError) {
			if (
				isSaveResponseCurrent({
					requestEpoch,
					requestSeq,
					currentEpoch: campaignEpochRef.current,
					latestSeq: saveSeqRef.current,
				})
			) {
				setError(
					unknownError instanceof Error
						? unknownError.message
						: "Không thể lưu kho phần thưởng",
				);
			}
		} finally {
			if (
				isSaveResponseCurrent({
					requestEpoch,
					requestSeq,
					currentEpoch: campaignEpochRef.current,
					latestSeq: saveSeqRef.current,
				})
			) {
				setSaving(false);
			}
		}
	}, [campaignId, configureRewardInventory, inventoryReady, rows, saving, totalUnits]);

	return (
		<Widget className="mt-6">
			<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
				<div className="grid min-w-0 gap-1">
					<Widget.Title>Kho phần thưởng dùng chung</Widget.Title>
					<Widget.Description>
						Dành cho trò chơi tự phục vụ (vòng quay và các mẫu mới). Mã voucher là thông tin bí mật,
						chỉ hiển thị cho người chơi sau khi họ nhận thưởng.
					</Widget.Description>
				</div>
				<Chip color={inventory && inventory.items.length > 0 ? "success" : "warning"} variant="soft">
					{inventory && inventory.items.length > 0 ? `${inventory.items.length} phần thưởng` : "Chưa có"}
				</Chip>
			</Widget.Header>
			<Widget.Content className="gap-4">
				{hasUnsavedInventoryEdits(rows, savedSnapshotRef.current) ? (
					<p className="text-sm text-warning" role="status">
						Có thay đổi chưa lưu.
					</p>
				) : null}
				{savedStatus || error ? (
					<AlertInline error={error} info={savedStatus ?? ""} />
				) : null}
				{rows.length === 0 ? (
					<EmptyState size="sm">
						<EmptyState.Header>
							<EmptyState.Media variant="icon"><Gift aria-hidden="true" /></EmptyState.Media>
							<EmptyState.Title>Chưa có phần thưởng nào</EmptyState.Title>
							<EmptyState.Description>Thêm phần thưởng đầu tiên cho luồng chơi tự phục vụ.</EmptyState.Description>
						</EmptyState.Header>
					</EmptyState>
				) : (
					<ItemCardGroup aria-label="Danh sách phần thưởng dùng chung" variant="secondary">
						{rows.map((row, index) => (
							<ItemCard className="items-start" key={row.key} variant="secondary">
								<ItemCard.Icon><Gift aria-hidden="true" size={18} /></ItemCard.Icon>
								<ItemCard.Content className="gap-3">
									<div className="admin-field">
										<Label htmlFor={`reward-name-${index}`}>Tên hiển thị</Label>
										<Input
											fullWidth
											id={`reward-name-${index}`}
											value={row.name}
											variant="secondary"
											onChange={(event) => updateRow(row.key, { name: event.currentTarget.value })}
										/>
									</div>
									<div className="grid gap-3 md:grid-cols-2">
										<div className="admin-field">
											<Label htmlFor={`reward-type-${index}`}>Loại</Label>
											<NativeSelect fullWidth variant="secondary">
												<NativeSelect.Trigger
													aria-label={`Loại phần thưởng ${index + 1}`}
													id={`reward-type-${index}`}
													value={row.rewardType}
													onChange={(event) =>
														updateRow(
															row.key,
															changeInventoryRowType(
																row,
																event.currentTarget.value as InventoryRewardType,
															),
														)
													}
												>
													{(Object.keys(rewardTypeLabels) as InventoryRewardType[]).map((type) => (
														<NativeSelect.Option key={type} value={type}>
															{rewardTypeLabels[type]}
														</NativeSelect.Option>
													))}
													<NativeSelect.Indicator />
												</NativeSelect.Trigger>
											</NativeSelect>
										</div>
										{inventoryAmountTypes.has(row.rewardType) ? (
											<div className="admin-field">
												<NumberField
													aria-label={`Giá trị phần thưởng ${index + 1}`}
													fullWidth
													minValue={1}
													value={numericFieldValue(row.amount)}
													variant="secondary"
													onChange={(value) => updateRow(row.key, { amount: numericEditValue(value) })}
												>
													<Label>Giá trị</Label>
													<NumberField.Group>
														<NumberField.DecrementButton aria-label={`Giảm giá trị phần thưởng ${index + 1}`} />
														<NumberField.Input className="w-full tabular-nums" />
														<NumberField.IncrementButton aria-label={`Tăng giá trị phần thưởng ${index + 1}`} />
													</NumberField.Group>
												</NumberField>
											</div>
										) : null}
									</div>
									<div className="grid gap-3 md:grid-cols-2">
										<div className="admin-field">
											<NumberField
												aria-label={`Số lượng phần thưởng ${index + 1}`}
												fullWidth
												minValue={1}
												value={numericFieldValue(row.quantity)}
												variant="secondary"
												onChange={(value) => updateRow(row.key, { quantity: numericEditValue(value) })}
											>
												<Label>Số lượng</Label>
												<NumberField.Group>
													<NumberField.DecrementButton aria-label={`Giảm số lượng phần thưởng ${index + 1}`} />
													<NumberField.Input className="w-full tabular-nums" />
													<NumberField.IncrementButton aria-label={`Tăng số lượng phần thưởng ${index + 1}`} />
												</NumberField.Group>
											</NumberField>
										</div>
										<div className="admin-field">
											<NumberField
												aria-label={`Trọng số phần thưởng ${index + 1}`}
												fullWidth
												maxValue={100}
												minValue={1}
												value={numericFieldValue(row.weight)}
												variant="secondary"
												onChange={(value) => updateRow(row.key, { weight: numericEditValue(value) })}
											>
												<Label>Trọng số (1-100)</Label>
												<NumberField.Group>
													<NumberField.DecrementButton aria-label={`Giảm trọng số phần thưởng ${index + 1}`} />
													<NumberField.Input className="w-full tabular-nums" />
													<NumberField.IncrementButton aria-label={`Tăng trọng số phần thưởng ${index + 1}`} />
												</NumberField.Group>
											</NumberField>
										</div>
									</div>
									{row.rewardType === "voucher" ? (
										<div className="admin-field">
											<Label htmlFor={`reward-secret-${index}`}>
												Mã voucher (bí mật){row.hasSecretCode ? " — đã có mã" : ""}
											</Label>
											<Input
												fullWidth
												id={`reward-secret-${index}`}
												placeholder={
													row.hasSecretCode
														? "Để trống để giữ nguyên mã đã lưu"
														: "Nhập mã bí mật cho người thắng cuộc"
												}
												value={row.secretCode}
												variant="secondary"
												onChange={(event) => updateRow(row.key, { secretCode: event.currentTarget.value })}
											/>
											<Description>
												{row.hasSecretCode
													? "Đã cấu hình mã cho voucher này. Để trống là giữ nguyên; nhập mã mới để thay thế."
													: "Chỉ người chơi nhận voucher sau khi bấm nhận thưởng mới thấy mã này."}
											</Description>
											{row.hasSecretCode && row.existingItemId ? (
												<label className="mt-1 flex items-center gap-2 text-xs text-muted">
													<input
														aria-label={`Xoá mã hiện tại của phần thưởng ${index + 1}`}
														checked={row.removeSecret}
														onChange={(event) =>
															updateRow(row.key, { removeSecret: event.currentTarget.checked })
														}
														type="checkbox"
													/>
													Xoá mã hiện tại khi lưu (thay vì giữ nguyên)
												</label>
											) : null}
										</div>
									) : null}
									<div className="admin-field">
										<Label htmlFor={`reward-pool-${index}`}>Nhóm kho phần thưởng</Label>
										<Input
											fullWidth
											id={`reward-pool-${index}`}
											placeholder="Mặc định"
											value={row.poolTag}
											variant="secondary"
											onChange={(event) => updateRow(row.key, { poolTag: event.currentTarget.value })}
										/>
										<Description>
											Trò chơi chọn nhóm kho theo tên; để trống dùng nhóm mặc định.
										</Description>
									</div>
									<label className="flex items-center gap-2 text-sm text-foreground">
										<input
											aria-label={`Kích hoạt phần thưởng ${index + 1}`}
											checked={row.isActive}
											onChange={(event) => updateRow(row.key, { isActive: event.currentTarget.checked })}
											type="checkbox"
										/>
										Kích hoạt
									</label>
								</ItemCard.Content>
								<ItemCard.Action>
									<Button
										aria-label={`Xóa phần thưởng ${index + 1}`}
										isIconOnly
										variant="danger-soft"
										onPress={() => removeRow(row.key)}
									>
										<Trash2 aria-hidden="true" size={16} />
									</Button>
								</ItemCard.Action>
							</ItemCard>
						))}
					</ItemCardGroup>
				)}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<Button
						type="button"
						variant="outline"
						onPress={() => addRow(createInventoryRow())}
					>
						<Plus aria-hidden="true" size={16} />
						Thêm phần thưởng
					</Button>
					<Button
						isDisabled={!inventoryReady}
						isPending={saving}
						type="button"
						onPress={() => void handleSave()}
					>
						<Save aria-hidden="true" size={16} />
						Lưu kho phần thưởng
					</Button>
				</div>
			</Widget.Content>
		</Widget>
	);
}

function AlertInline({ error, info }: { error: string; info: string }) {
	if (!error && !info) {
		return null;
	}
	return (
		<p aria-live="polite" className={error ? "text-sm text-danger" : "text-sm text-success"} role={error ? "alert" : "status"}>
			{error || info}
		</p>
	);
}
