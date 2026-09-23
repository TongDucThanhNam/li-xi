import { Input, Label, NumberField, TextArea } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import {
	REWARD_MODE_LABELS,
	buildLuckyWheelGameConfig,
	configRewardMode,
	isLuckyWheelGameConfig,
	luckyWheelDefaultGameConfig,
	type CampaignGameConfig,
	type GameRewardMode,
} from "@/lib/gameTemplates";
import { finiteNumberOr } from "@/lib/gameEditorState";

export function LuckyWheelConfigEditor({ config, onChange }: { config: CampaignGameConfig; onChange: (config: CampaignGameConfig) => void }) {
	const wheelConfig = isLuckyWheelGameConfig(config)
		? buildLuckyWheelGameConfig({
				rewardMode: configRewardMode(config),
				noRewardWeight: config.noRewardWeight,
				noRewardLabel: config.noRewardLabel,
				rewardPoolTag: "rewardPoolTag" in config ? config.rewardPoolTag : undefined,
				publicCopy: config.publicCopy,
			})
		: { ...luckyWheelDefaultGameConfig, publicCopy: config.publicCopy };
	const updateCopy = (key: keyof LuckyWheelConfigEditorCopy, value: string) =>
		onChange({ ...wheelConfig, publicCopy: { ...wheelConfig.publicCopy, [key]: value } });
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
				<Widget.Content className="gap-4">
					<div className="admin-field">
						<Label htmlFor="lucky-wheel-reward-mode">Chế độ thưởng</Label>
						<NativeSelect fullWidth variant="secondary">
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
						<p className="mt-1 text-xs text-muted">
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
							<NumberField.Group>
								<NumberField.DecrementButton aria-label="Giảm trọng số lượt không trúng" />
								<NumberField.Input />
								<NumberField.IncrementButton aria-label="Tăng trọng số lượt không trúng" />
							</NumberField.Group>
						</NumberField>
						<p className="mt-1 text-xs text-muted">
							Trọng số tương đối của ô cảm ơn, so với tổng trọng số các phần thưởng còn khả
							dụng trong nhóm kho — không phải phần trăm cố định. 0 nghĩa là luôn trúng khi
							còn quà.
						</p>
					</div>
					) : null}
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
							fullWidth
							id="lucky-wheel-pool-tag"
							value={wheelConfig.rewardPoolTag}
							variant="secondary"
							onChange={(event) => onChange({ ...wheelConfig, rewardPoolTag: event.currentTarget.value })}
						/>
						<p className="mt-1 text-xs text-muted">
							Chỉ các phần thưởng trong kho dùng chung có "Nhóm kho" khớp giá trị này mới xuất hiện
							trên vòng quay của trò chơi.
						</p>
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
						<Label htmlFor="lucky-wheel-headline">Tiêu đề</Label>
						<Input
							fullWidth
							id="lucky-wheel-headline"
							value={wheelConfig.publicCopy.headline}
							variant="secondary"
							onChange={(event) => updateCopy("headline", event.currentTarget.value)}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="lucky-wheel-subtitle">Mô tả ngắn</Label>
						<TextArea
							fullWidth
							id="lucky-wheel-subtitle"
							value={wheelConfig.publicCopy.subtitle}
							variant="secondary"
							onChange={(event) => updateCopy("subtitle", event.currentTarget.value)}
						/>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="admin-field">
							<Label htmlFor="lucky-wheel-start-label">Nút bắt đầu</Label>
							<Input
								fullWidth
								id="lucky-wheel-start-label"
								value={wheelConfig.publicCopy.startCtaLabel}
								variant="secondary"
								onChange={(event) => updateCopy("startCtaLabel", event.currentTarget.value)}
							/>
						</div>
						<div className="admin-field">
							<Label htmlFor="lucky-wheel-collect-label">Nút nhận thưởng</Label>
							<Input
								fullWidth
								id="lucky-wheel-collect-label"
								value={wheelConfig.publicCopy.collectCtaLabel}
								variant="secondary"
								onChange={(event) => updateCopy("collectCtaLabel", event.currentTarget.value)}
							/>
						</div>
					</div>
					<div className="admin-field">
						<Label htmlFor="lucky-wheel-waiting">Thông điệp chờ</Label>
						<Input
							fullWidth
							id="lucky-wheel-waiting"
							value={wheelConfig.publicCopy.waitingMessage}
							variant="secondary"
							onChange={(event) => updateCopy("waitingMessage", event.currentTarget.value)}
						/>
					</div>
				</Widget.Content>
			</Widget>
		</div>
	);
}

type LuckyWheelConfigEditorCopy = Record<
	"headline" | "subtitle" | "startCtaLabel" | "collectCtaLabel" | "waitingMessage",
	string
>;
