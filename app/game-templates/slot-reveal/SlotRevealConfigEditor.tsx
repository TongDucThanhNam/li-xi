"use client";

import { Description, Input, Label, NumberField } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import {
	buildSlotRevealGameConfig,
	isSlotRevealGameConfig,
	REWARD_MODE_LABELS,
	slotRevealDefaultGameConfig,
	slotReelThemes,
	SLOT_MISS_COMBINATION,
	SLOT_SYMBOL_LABELS,
	slotSymbolKeys,
	type CampaignGameConfig,
	type GameRewardMode,
	type SlotReelTheme,
} from "@/lib/gameTemplates";
import { finiteNumberOr } from "@/lib/gameEditorState";
import { SLOT_SYMBOL_ICONS } from "@/app/game-templates/slot-reveal/slotSymbols";

const REEL_THEME_LABELS: Record<SlotReelTheme, string> = {
	gold: "Vàng đồng",
	neon: "Neon scoreboard",
	festive: "Lễ hội đỏ hồng",
};

/**
 * Bounded slot-reveal operator editor. The symbol set and the documented
 * combinations are fixed: each candidate reward of the chosen pool gets its
 * own `[k,k,k]` combination at admission (pool display order), and the miss
 * combination is the documented `SLOT_MISS_COMBINATION`.
 */
export function SlotRevealConfigEditor({
	config,
	onChange,
}: {
	config: CampaignGameConfig;
	onChange: (config: CampaignGameConfig) => void;
}) {
	const slotConfig = isSlotRevealGameConfig(config)
		? buildSlotRevealGameConfig({
				rewardMode: config.rewardMode,
				noRewardWeight: config.noRewardWeight,
				noRewardLabel: config.noRewardLabel,
				rewardPoolTag: config.rewardPoolTag,
				reelTheme: config.reelTheme,
				publicCopy: config.publicCopy,
			})
		: { ...slotRevealDefaultGameConfig, publicCopy: config.publicCopy };
	const updateCopy = (key: "headline" | "subtitle", value: string) =>
		onChange({ ...slotConfig, publicCopy: { ...slotConfig.publicCopy, [key]: value } });
	return (
		<div className="grid gap-6">
			<Widget>
				<Widget.Header>
					<Widget.Title>Máy quay tri ân</Widget.Title>
					<Widget.Description>
						Tổ hợp biểu tượng được chốt khi lượt chơi được nhận vào: mỗi phần
						thưởng trong nhóm kho có một tổ hợp riêng, không phụ thuộc nhãn
						hiển thị.
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field">
						<Label htmlFor="slot-reward-mode">Chế độ thưởng</Label>
						<NativeSelect fullWidth variant="secondary">
							<NativeSelect.Trigger
								aria-label="Chế độ thưởng"
								id="slot-reward-mode"
								value={slotConfig.rewardMode}
								onChange={(event) =>
									onChange({
										...slotConfig,
										rewardMode: event.currentTarget.value as GameRewardMode,
									})
								}
							>
								<NativeSelect.Option value="rewarded">
									{REWARD_MODE_LABELS.rewarded}
								</NativeSelect.Option>
								<NativeSelect.Option value="engagement">
									{REWARD_MODE_LABELS.engagement}
								</NativeSelect.Option>
								<NativeSelect.Indicator />
							</NativeSelect.Trigger>
						</NativeSelect>
					</div>
					<div className="admin-field">
						<Label htmlFor="slot-reel-theme">Phong cách máy quay</Label>
						<NativeSelect fullWidth variant="secondary">
							<NativeSelect.Trigger
								aria-label="Phong cách máy quay"
								id="slot-reel-theme"
								value={slotConfig.reelTheme}
								onChange={(event) =>
									onChange({
										...slotConfig,
										reelTheme: event.currentTarget.value as SlotReelTheme,
									})
								}
							>
								{slotReelThemes.map((theme) => (
									<NativeSelect.Option key={theme} value={theme}>
										{REEL_THEME_LABELS[theme]}
									</NativeSelect.Option>
								))}
								<NativeSelect.Indicator />
							</NativeSelect.Trigger>
						</NativeSelect>
					</div>
					<div className="admin-field">
						<NumberField
							fullWidth
							maxValue={100}
							minValue={0}
							step={5}
							value={slotConfig.noRewardWeight}
							variant="secondary"
							onChange={(value) =>
								onChange({
									...slotConfig,
									noRewardWeight: finiteNumberOr(
										value,
										slotConfig.noRewardWeight,
									),
								})
							}
						>
							<Label>Trọng số lượt không trúng (0-100)</Label>
							<NumberField.Group>
								<NumberField.DecrementButton aria-label="Giảm trọng số lượt không trúng" />
								<NumberField.Input />
								<NumberField.IncrementButton aria-label="Tăng trọng số lượt không trúng" />
							</NumberField.Group>
						</NumberField>
					</div>
					<div className="admin-field">
						<Label htmlFor="slot-no-reward-label">Nhãn lượt không trúng</Label>
						<Input
							fullWidth
							id="slot-no-reward-label"
							value={slotConfig.noRewardLabel}
							variant="secondary"
							onChange={(event) =>
								onChange({ ...slotConfig, noRewardLabel: event.currentTarget.value })
							}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="slot-pool-tag">Nhóm kho phần thưởng</Label>
						<Input
							fullWidth
							id="slot-pool-tag"
							value={slotConfig.rewardPoolTag}
							variant="secondary"
							onChange={(event) =>
								onChange({ ...slotConfig, rewardPoolTag: event.currentTarget.value })
							}
						/>
						<Description>
							Tối đa 8 phần thưởng đầu tiên của nhóm kho nhận tổ hợp riêng;
							phần thưởng thứ 9 trở đi không thể trúng ở mẫu này.
						</Description>
					</div>
					<div className="admin-field">
						<Label>Biểu tượng và tổ hợp cố định</Label>
						<div className="flex flex-wrap gap-2">
							{slotSymbolKeys.map((key) => {
								const Icon = SLOT_SYMBOL_ICONS[key];
								return (
									<span
										className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-secondary px-3 py-1 text-xs"
										key={key}
									>
										<Icon aria-hidden="true" size={14} />
										{SLOT_SYMBOL_LABELS[key]}
									</span>
								);
							})}
						</div>
						<Description>
							Trúng thưởng: ba biểu tượng giống nhau theo phần thưởng. Lượt
							không trúng: tổ hợp{" "}
							{SLOT_MISS_COMBINATION.map((key) => SLOT_SYMBOL_LABELS[key]).join(
								" – ",
							)}
							.
						</Description>
					</div>
				</Widget.Content>
			</Widget>
			<Widget>
				<Widget.Header>
					<Widget.Title>Nội dung trải nghiệm</Widget.Title>
					<Widget.Description>Nội dung này xuất hiện trên liên kết chơi công khai.</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field">
						<Label htmlFor="slot-headline">Tiêu đề</Label>
						<Input
							fullWidth
							id="slot-headline"
							value={slotConfig.publicCopy.headline}
							variant="secondary"
							onChange={(event) => updateCopy("headline", event.currentTarget.value)}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="slot-subtitle">Mô tả ngắn</Label>
						<Input
							fullWidth
							id="slot-subtitle"
							value={slotConfig.publicCopy.subtitle}
							variant="secondary"
							onChange={(event) => updateCopy("subtitle", event.currentTarget.value)}
						/>
					</div>
				</Widget.Content>
			</Widget>
		</div>
	);
}
