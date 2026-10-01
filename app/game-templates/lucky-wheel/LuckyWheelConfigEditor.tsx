import { Input, Label, NumberField } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import { AdminDisclosure } from "@/app/components/AdminDisclosure";
import { GamePublicCopyFields, type GamePublicCopyFieldKey } from "../GamePublicCopyFields";
import type { GameConfigEditorProps } from "../types";
import {
	DEFAULT_REWARD_POOL_TAG,
	REWARD_MODE_LABELS,
	buildLuckyWheelGameConfig,
	configRewardMode,
	isLuckyWheelGameConfig,
	luckyWheelDefaultGameConfig,
	type GameRewardMode,
} from "@/lib/gameTemplates";
import { finiteNumberOr } from "@/lib/gameEditorState";

export function LuckyWheelConfigEditor({ config, onChange, section }: GameConfigEditorProps) {
	const wheelConfig = isLuckyWheelGameConfig(config)
		? buildLuckyWheelGameConfig({
				rewardMode: configRewardMode(config),
				noRewardWeight: config.noRewardWeight,
				noRewardLabel: config.noRewardLabel,
				rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
				publicCopy: config.publicCopy,
			})
		: { ...luckyWheelDefaultGameConfig, publicCopy: config.publicCopy };
	const updateCopy = (key: GamePublicCopyFieldKey, value: string) =>
		onChange({ ...wheelConfig, publicCopy: { ...wheelConfig.publicCopy, [key]: value } });
	if (section === "content") {
		return (
			<Widget>
				<Widget.Header>
					<Widget.Title>Nội dung trải nghiệm</Widget.Title>
					<Widget.Description>Nội dung này xuất hiện trên liên kết chơi công khai.</Widget.Description>
				</Widget.Header>
				<Widget.Content className="admin-form">
					<GamePublicCopyFields
						copy={wheelConfig.publicCopy}
						idPrefix="lucky-wheel"
						onChange={updateCopy}
					/>
				</Widget.Content>
			</Widget>
		);
	}
	return (
		<div className="grid gap-6">
			<Widget>
				<Widget.Header>
					<Widget.Title>Vòng quay</Widget.Title>
					<Widget.Description>
						Số ô vòng quay sinh tự động từ số phần thưởng của nhóm kho đã chọn, cộng một ô "không
						trúng".
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="admin-form">
					<div className="admin-field">
						<Label htmlFor="lucky-wheel-reward-mode">Chế độ thưởng</Label>
						<NativeSelect className="admin-control--sm" fullWidth variant="secondary">
							<NativeSelect.Trigger
								aria-label="Chế độ thưởng"
								id="lucky-wheel-reward-mode"
								value={wheelConfig.rewardMode}
								onChange={(event) => onChange({ ...wheelConfig, rewardMode: event.currentTarget.value as GameRewardMode })}
							>
								<NativeSelect.Option value="rewarded">{REWARD_MODE_LABELS.rewarded}</NativeSelect.Option>
								<NativeSelect.Option value="engagement">{REWARD_MODE_LABELS.engagement}</NativeSelect.Option>
								<NativeSelect.Indicator />
							</NativeSelect.Trigger>
						</NativeSelect>
						<p className="admin-field__hint">
							Ở chế độ tương tác không thưởng, vòng quay chỉ còn ô cảm ơn, không tiêu kho và không
							ghi nhận trúng thưởng.
						</p>
					</div>
					{wheelConfig.rewardMode === "rewarded" ? (
					<div className="admin-field">
						<NumberField
							aria-label="Trọng số lượt không trúng"
							fullWidth
							maxValue={100}
							minValue={0}
							step={5}
							value={wheelConfig.noRewardWeight}
							variant="secondary"
							onChange={(value) =>
								onChange({
									...wheelConfig,
									noRewardWeight: finiteNumberOr(value, wheelConfig.noRewardWeight),
								})
							}
						>
							<Label>Trọng số lượt không trúng (0-100)</Label>
							<NumberField.Group className="admin-control--xs">
								<NumberField.DecrementButton aria-label="Giảm trọng số lượt không trúng" />
								<NumberField.Input />
								<NumberField.IncrementButton aria-label="Tăng trọng số lượt không trúng" />
							</NumberField.Group>
						</NumberField>
						<p className="admin-field__hint">
							Trọng số tương đối của ô cảm ơn, so với tổng trọng số các phần thưởng còn khả
							dụng trong nhóm kho — không phải phần trăm cố định. 0 nghĩa là luôn trúng khi
							còn quà.
						</p>
					</div>
					) : null}
					<AdminDisclosure
						defaultExpanded={wheelConfig.rewardPoolTag !== DEFAULT_REWARD_POOL_TAG}
						summary={`Nhóm kho: ${wheelConfig.rewardPoolTag}`}
						title="Tuỳ chọn nâng cao"
					>
						<div className="admin-field">
							<Label htmlFor="lucky-wheel-no-reward-label">Nhãn lượt không trúng</Label>
							<Input
								fullWidth
								id="lucky-wheel-no-reward-label"
								value={wheelConfig.noRewardLabel}
								variant="secondary"
								onChange={(event) => onChange({ ...wheelConfig, noRewardLabel: event.currentTarget.value })}
							/>
						</div>
						<div className="admin-field">
							<Label htmlFor="lucky-wheel-pool-tag">Nhóm kho phần thưởng</Label>
							<Input
								className="admin-control--sm"
								fullWidth
								id="lucky-wheel-pool-tag"
								value={wheelConfig.rewardPoolTag}
								variant="secondary"
								onChange={(event) => onChange({ ...wheelConfig, rewardPoolTag: event.currentTarget.value })}
							/>
							<p className="admin-field__hint">
								Chỉ các phần thưởng trong kho dùng chung có "Nhóm kho" khớp giá trị này mới xuất hiện
								trên vòng quay của trò chơi.
							</p>
						</div>
					</AdminDisclosure>
				</Widget.Content>
			</Widget>
		</div>
	);
}
