"use client";

import { Description, Input, Label, NumberField } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import {
	buildScratchCardGameConfig,
	isScratchCardGameConfig,
	REWARD_MODE_LABELS,
	scratchCardDefaultGameConfig,
	scratchCoverStyles,
	type CampaignGameConfig,
	type GameRewardMode,
	type ScratchCoverStyle,
} from "@/lib/gameTemplates";
import { finiteNumberOr } from "@/lib/gameEditorState";

const COVER_STYLE_LABELS: Record<ScratchCoverStyle, string> = {
	gold: "Vàng đồng",
	teal: "Xanh ngọc",
	crimson: "Đỏ hồng",
};

export function ScratchCardConfigEditor({
	config,
	onChange,
}: {
	config: CampaignGameConfig;
	onChange: (config: CampaignGameConfig) => void;
}) {
	const scratchConfig = isScratchCardGameConfig(config)
		? buildScratchCardGameConfig({
				rewardMode: config.rewardMode,
				noRewardWeight: config.noRewardWeight,
				noRewardLabel: config.noRewardLabel,
				rewardPoolTag: config.rewardPoolTag,
				coverStyle: config.coverStyle,
				revealThresholdPercent: config.revealThresholdPercent,
				publicCopy: config.publicCopy,
			})
		: { ...scratchCardDefaultGameConfig, publicCopy: config.publicCopy };
	const updateCopy = (key: "headline" | "subtitle", value: string) =>
		onChange({ ...scratchConfig, publicCopy: { ...scratchConfig.publicCopy, [key]: value } });
	return (
		<div className="grid gap-6">
			<Widget>
				<Widget.Header>
					<Widget.Title>Thẻ cào</Widget.Title>
					<Widget.Description>
						Lớp phủ và ngưỡng gỡ chỉ là hiển thị: phần thưởng được máy chủ công
						bố một lần duy nhất ở lượt chà đầu tiên.
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field">
						<Label htmlFor="scratch-reward-mode">Chế độ thưởng</Label>
						<NativeSelect fullWidth variant="secondary">
							<NativeSelect.Trigger
								aria-label="Chế độ thưởng"
								id="scratch-reward-mode"
								value={scratchConfig.rewardMode}
								onChange={(event) =>
									onChange({
										...scratchConfig,
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
						<Label htmlFor="scratch-cover-style">Kiểu lớp phủ</Label>
						<NativeSelect fullWidth variant="secondary">
							<NativeSelect.Trigger
								aria-label="Kiểu lớp phủ"
								id="scratch-cover-style"
								value={scratchConfig.coverStyle}
								onChange={(event) =>
									onChange({
										...scratchConfig,
										coverStyle: event.currentTarget.value as ScratchCoverStyle,
									})
								}
							>
								{scratchCoverStyles.map((style) => (
									<NativeSelect.Option key={style} value={style}>
										{COVER_STYLE_LABELS[style]}
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
							minValue={10}
							step={5}
							value={scratchConfig.revealThresholdPercent}
							variant="secondary"
							onChange={(value) =>
								onChange({
									...scratchConfig,
									revealThresholdPercent: finiteNumberOr(
										value,
										scratchConfig.revealThresholdPercent,
									),
								})
							}
						>
							<Label>Ngưỡng hiển thị gỡ lớp phủ (10-100)</Label>
							<NumberField.Group>
								<NumberField.DecrementButton aria-label="Giảm ngưỡng hiển thị" />
								<NumberField.Input />
								<NumberField.IncrementButton aria-label="Tăng ngưỡng hiển thị" />
							</NumberField.Group>
						</NumberField>
						<Description>
							Chỉ là gợi ý hiển thị cho lớp phủ — phần thưởng vẫn do máy chủ công
							bố ở lượt chà đầu tiên.
						</Description>
					</div>
					<div className="admin-field">
						<Label htmlFor="scratch-no-reward-label">Nhãn lượt không trúng</Label>
						<Input
							fullWidth
							id="scratch-no-reward-label"
							value={scratchConfig.noRewardLabel}
							variant="secondary"
							onChange={(event) =>
								onChange({ ...scratchConfig, noRewardLabel: event.currentTarget.value })
							}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="scratch-pool-tag">Nhóm kho phần thưởng</Label>
						<Input
							fullWidth
							id="scratch-pool-tag"
							value={scratchConfig.rewardPoolTag}
							variant="secondary"
							onChange={(event) =>
								onChange({ ...scratchConfig, rewardPoolTag: event.currentTarget.value })
							}
						/>
						<Description>Khớp "Nhóm kho" của các phần thưởng trong kho dùng chung.</Description>
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
						<Label htmlFor="scratch-headline">Tiêu đề</Label>
						<Input
							fullWidth
							id="scratch-headline"
							value={scratchConfig.publicCopy.headline}
							variant="secondary"
							onChange={(event) => updateCopy("headline", event.currentTarget.value)}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="scratch-subtitle">Mô tả ngắn</Label>
						<Input
							fullWidth
							id="scratch-subtitle"
							value={scratchConfig.publicCopy.subtitle}
							variant="secondary"
							onChange={(event) => updateCopy("subtitle", event.currentTarget.value)}
						/>
					</div>
				</Widget.Content>
			</Widget>
		</div>
	);
}
