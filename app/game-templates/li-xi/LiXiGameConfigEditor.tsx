import { Input, Label, NumberField } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import { AdminDisclosure } from "@/app/components/AdminDisclosure";
import { GamePublicCopyFields, type GamePublicCopyFieldKey } from "../GamePublicCopyFields";
import type { GameConfigEditorProps } from "../types";
import {
	DEFAULT_REWARD_POOL_TAG,
	REWARD_MODE_LABELS,
	REWARD_SOURCE_LABELS,
	buildLiXiGameConfig,
	configRewardMode,
	configRewardSource,
	isLiXiGameConfig,
	liXiDefaultGameConfig,
	type GameRewardMode,
	type GameRewardSource,
	type LiXiGameConfig,
} from "@/lib/gameTemplates";
import { finiteNumberOr } from "@/lib/gameEditorState";

export function LiXiGameConfigEditor({ config, onChange, section }: GameConfigEditorProps) {
	const liXiConfig = isLiXiGameConfig(config)
		? buildLiXiGameConfig({
				rewardSource: configRewardSource(config),
				rewardMode: configRewardMode(config),
				noRewardWeight: "noRewardWeight" in config ? config.noRewardWeight : undefined,
				noRewardLabel: "noRewardLabel" in config ? config.noRewardLabel : undefined,
				rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
				styleVariant: config.styleVariant,
				publicCopy: config.publicCopy,
			})
		: { ...liXiDefaultGameConfig, publicCopy: buildLiXiGameConfig().publicCopy };
	const updateCopy = (key: GamePublicCopyFieldKey, value: string) => onChange({ ...liXiConfig, publicCopy: { ...liXiConfig.publicCopy, [key]: value } });
	if (section === "content") {
		return (
			<Widget>
				<Widget.Header><Widget.Title>Nội dung trải nghiệm</Widget.Title><Widget.Description>Nội dung này xuất hiện trên trạm và liên kết chơi công khai.</Widget.Description></Widget.Header>
				<Widget.Content className="admin-form">
					<GamePublicCopyFields
						copy={liXiConfig.publicCopy}
						idPrefix="li-xi"
						onChange={(key, value) => updateCopy(key, value)}
					/>
				</Widget.Content>
			</Widget>
		);
	}
	return (
		<div className="grid gap-6">
			<Widget>
				<Widget.Header><Widget.Title>Giao diện trò chơi</Widget.Title><Widget.Description>Chọn ngôn ngữ hình ảnh thuộc phạm vi mẫu li xi.</Widget.Description></Widget.Header>
				<Widget.Content className="admin-form"><div className="admin-field"><Label htmlFor="li-xi-style">Phong cách</Label><NativeSelect className="admin-control--sm" fullWidth variant="secondary"><NativeSelect.Trigger aria-label="Phong cách trò chơi" id="li-xi-style" value={liXiConfig.styleVariant} onChange={(event) => onChange({ ...liXiConfig, styleVariant: event.currentTarget.value as LiXiGameConfig["styleVariant"] })}><NativeSelect.Option value="lunar">Lunar Fortune</NativeSelect.Option><NativeSelect.Option value="brand">Thương hiệu trung tính</NativeSelect.Option><NativeSelect.Indicator /></NativeSelect.Trigger></NativeSelect></div></Widget.Content>
			</Widget>
			<Widget>
				<Widget.Header><Widget.Title>Nguồn phần thưởng</Widget.Title><Widget.Description>Ngân sách tiền mặt: host tạo từng lượt bằng Host PIN. Kho phần thưởng dùng chung: khách tự chơi qua liên kết hoặc trạm.</Widget.Description></Widget.Header>
				<Widget.Content className="admin-form">
					<div className="admin-field-pair">
						<div className="admin-field">
							<Label htmlFor="li-xi-reward-source">Nguồn thưởng</Label>
							<NativeSelect className="admin-control--sm" fullWidth variant="secondary">
								<NativeSelect.Trigger aria-label="Nguồn phần thưởng" id="li-xi-reward-source" value={liXiConfig.rewardSource} onChange={(event) => onChange({ ...liXiConfig, rewardSource: event.currentTarget.value as GameRewardSource, ...(liXiConfig.rewardMode === "engagement" && event.currentTarget.value === "campaign-budget" ? { rewardMode: "rewarded" as GameRewardMode } : {}) })}>
									<NativeSelect.Option value="campaign-budget">{REWARD_SOURCE_LABELS["campaign-budget"]}</NativeSelect.Option>
									<NativeSelect.Option value="campaign-inventory">{REWARD_SOURCE_LABELS["campaign-inventory"]}</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
						<div className="admin-field">
							<Label htmlFor="li-xi-reward-mode">Chế độ thưởng</Label>
							<NativeSelect className="admin-control--sm" fullWidth variant="secondary">
								<NativeSelect.Trigger aria-label="Chế độ thưởng" id="li-xi-reward-mode" value={liXiConfig.rewardMode} onChange={(event) => {
									const rewardMode = event.currentTarget.value as GameRewardMode;
									onChange({
										...liXiConfig,
										rewardMode,
										// Guaranteed no-reward play requires the self-serve
										// inventory source; the classic budget flow stays rewarded.
										...(rewardMode === "engagement" && liXiConfig.rewardSource === "campaign-budget"
											? { rewardSource: "campaign-inventory" as GameRewardSource }
											: {}),
									});
								}}>
									<NativeSelect.Option value="rewarded">{REWARD_MODE_LABELS.rewarded}</NativeSelect.Option>
									<NativeSelect.Option value="engagement">{REWARD_MODE_LABELS.engagement}</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
					</div>
					<div className="admin-field">
						<NumberField
							aria-label="Trọng số lượt không trúng"
							fullWidth
							maxValue={100}
							minValue={0}
							step={5}
							value={liXiConfig.noRewardWeight}
							variant="secondary"
							onChange={(value) =>
								onChange({
									...liXiConfig,
									noRewardWeight: finiteNumberOr(value, liXiConfig.noRewardWeight),
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
						<DescriptionInline>
							Trọng số tương đối của ô cảm ơn, so với tổng trọng số các phần thưởng còn khả
							dụng — không phải phần trăm cố định. 0 = luôn trúng khi còn quà; chỉ áp dụng ở
							chế độ có thưởng.
						</DescriptionInline>
					</div>
					<AdminDisclosure
						defaultExpanded={liXiConfig.rewardPoolTag !== DEFAULT_REWARD_POOL_TAG}
						summary={`Nhóm kho: ${liXiConfig.rewardPoolTag}`}
						title="Tuỳ chọn nâng cao"
					>
						<div className="admin-field">
							<Label htmlFor="li-xi-pool-tag">Nhóm kho phần thưởng</Label>
							<Input
								fullWidth
								id="li-xi-pool-tag"
								value={liXiConfig.rewardPoolTag}
								variant="secondary"
								onChange={(event) => onChange({ ...liXiConfig, rewardPoolTag: event.currentTarget.value })}
							/>
							<DescriptionInline>Khớp "Nhóm kho" của các phần thưởng trong kho dùng chung.</DescriptionInline>
						</div>
					</AdminDisclosure>
				</Widget.Content>
			</Widget>
		</div>
	);
}

function DescriptionInline({ children }: { children: React.ReactNode }) {
	return <p className="admin-field__hint">{children}</p>;
}
