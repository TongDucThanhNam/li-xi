import { Input, Label, TextArea } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import type { CampaignGameConfig } from "@/lib/gameTemplates";

export function LiXiGameConfigEditor({ config, onChange }: { config: CampaignGameConfig; onChange: (config: CampaignGameConfig) => void }) {
	const updateCopy = (key: keyof CampaignGameConfig["publicCopy"], value: string) => onChange({ ...config, publicCopy: { ...config.publicCopy, [key]: value } });
	return (
		<div className="grid gap-6">
			<Widget>
				<Widget.Header><Widget.Title>Giao diện trò chơi</Widget.Title><Widget.Description>Chọn ngôn ngữ hình ảnh thuộc phạm vi mẫu li xi.</Widget.Description></Widget.Header>
				<Widget.Content><div className="admin-field"><Label htmlFor="li-xi-style">Phong cách</Label><NativeSelect fullWidth variant="secondary"><NativeSelect.Trigger aria-label="Phong cách trò chơi" id="li-xi-style" value={config.styleVariant} onChange={(event) => onChange({ ...config, styleVariant: event.currentTarget.value as CampaignGameConfig["styleVariant"] })}><NativeSelect.Option value="lunar">Lunar Fortune</NativeSelect.Option><NativeSelect.Option value="brand">Thương hiệu trung tính</NativeSelect.Option><NativeSelect.Indicator /></NativeSelect.Trigger></NativeSelect></div></Widget.Content>
			</Widget>
			<Widget>
				<Widget.Header><Widget.Title>Nội dung trải nghiệm</Widget.Title><Widget.Description>Nội dung này xuất hiện trên trạm và liên kết chơi công khai.</Widget.Description></Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field"><Label htmlFor="li-xi-headline">Tiêu đề</Label><Input fullWidth id="li-xi-headline" value={config.publicCopy.headline} variant="secondary" onChange={(event) => updateCopy("headline", event.currentTarget.value)} /></div>
					<div className="admin-field"><Label htmlFor="li-xi-subtitle">Mô tả ngắn</Label><TextArea fullWidth id="li-xi-subtitle" value={config.publicCopy.subtitle} variant="secondary" onChange={(event) => updateCopy("subtitle", event.currentTarget.value)} /></div>
					<div className="grid gap-4 md:grid-cols-2"><div className="admin-field"><Label htmlFor="li-xi-start-label">Nút bắt đầu</Label><Input fullWidth id="li-xi-start-label" value={config.publicCopy.startCtaLabel} variant="secondary" onChange={(event) => updateCopy("startCtaLabel", event.currentTarget.value)} /></div><div className="admin-field"><Label htmlFor="li-xi-collect-label">Nút nhận kết quả</Label><Input fullWidth id="li-xi-collect-label" value={config.publicCopy.collectCtaLabel} variant="secondary" onChange={(event) => updateCopy("collectCtaLabel", event.currentTarget.value)} /></div></div>
					<div className="admin-field"><Label htmlFor="li-xi-waiting">Thông điệp chờ</Label><Input fullWidth id="li-xi-waiting" value={config.publicCopy.waitingMessage} variant="secondary" onChange={(event) => updateCopy("waitingMessage", event.currentTarget.value)} /></div>
				</Widget.Content>
			</Widget>
		</div>
	);
}
