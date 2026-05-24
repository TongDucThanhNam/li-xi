import { Chip, Description, Input, Label, Tabs, TextArea } from "@heroui/react";
import { ItemCard, ItemCardGroup, NativeSelect, Widget } from "@heroui-pro/react";
import type { LucideIcon } from "lucide-react";
import { CampaignAssetsPanel } from "./CampaignAssetsPanel";
import type { CampaignAssetsPanelProps } from "./CampaignAssetsPanel";
import type { CampaignForm, CampaignStatus, CampaignTheme } from "./types";

type ClaimCopyRow = {
	icon: LucideIcon;
	title: string;
	description: string;
	chip: string;
	color: "success" | "warning" | "default";
};

type CampaignEditorProps = CampaignAssetsPanelProps & {
	claimCopyRows: readonly ClaimCopyRow[];
	form: CampaignForm;
	onFormChange: <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => void;
};

export function CampaignEditor({
	assetLimitReached,
	assetStateRows,
	claimCopyRows,
	form,
	heroPreview,
	retryingUploadAttach,
	selectedHeroAsset,
	selectedHeroAssetSize,
	uploading,
	uploadingAsset,
	uploadProgress,
	visiblePendingUploadedAsset,
	onAssetDrop,
	onAssetSelect,
	onFormChange,
	onRetryAttachUploadedAsset,
}: CampaignEditorProps) {
	return (
		<Tabs className="w-full" defaultSelectedKey="details" variant="secondary">
			<Tabs.ListContainer className="overflow-x-auto">
				<Tabs.List aria-label="Campaign editor sections" className="w-fit">
					<Tabs.Tab id="details">
						Details
						<Tabs.Indicator />
					</Tabs.Tab>
					<Tabs.Tab id="copy">
						Claim Copy
						<Tabs.Indicator />
					</Tabs.Tab>
					<Tabs.Tab id="assets">
						Assets
						<Tabs.Indicator />
					</Tabs.Tab>
				</Tabs.List>
			</Tabs.ListContainer>
			<Tabs.Panel className="pt-4" id="details">
				<Widget>
					<Widget.Header className="items-start gap-4 sm:flex-row sm:justify-between">
						<div>
							<Widget.Title>Campaign details</Widget.Title>
							<Widget.Description>
								Thông tin campaign và trạng thái public.
							</Widget.Description>
						</div>
						<Chip color={form.status === "active" ? "success" : "default"} variant="soft">
							{form.status === "active" ? "Đang chạy" : "Bản nháp"}
						</Chip>
					</Widget.Header>
					<Widget.Content className="gap-4">
						<div className="admin-field">
							<Label htmlFor="campaign-name">Tên chiến dịch</Label>
							<Input
								fullWidth
								id="campaign-name"
								value={form.name}
								variant="secondary"
								onChange={(event) => onFormChange("name", event.currentTarget.value)}
							/>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="admin-field">
								<Label htmlFor="campaign-slug">Slug</Label>
								<Input
									fullWidth
									id="campaign-slug"
									value={form.slug}
									variant="secondary"
									onChange={(event) => onFormChange("slug", event.currentTarget.value)}
								/>
								<Description>Dùng cho public URL và campaign lookup.</Description>
							</div>
							<div className="admin-field">
								<Label htmlFor="campaign-brand">Thương hiệu</Label>
								<Input
									fullWidth
									id="campaign-brand"
									value={form.brandName}
									variant="secondary"
									onChange={(event) =>
										onFormChange("brandName", event.currentTarget.value)
									}
								/>
								<Description>Fallback sang tên host nếu để trống.</Description>
							</div>
						</div>
						<div className="admin-field">
							<Label htmlFor="campaign-description">Mô tả end-user</Label>
							<TextArea
								fullWidth
								id="campaign-description"
								rows={4}
								value={form.description}
								variant="secondary"
								onChange={(event) =>
									onFormChange("description", event.currentTarget.value)
								}
							/>
							<Description>Giữ trong 1-2 câu để hero khách không bị nặng chữ.</Description>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<NativeSelect fullWidth variant="secondary">
								<Label>Theme</Label>
								<NativeSelect.Trigger
									value={form.theme}
									onChange={(event) =>
										onFormChange("theme", event.currentTarget.value as CampaignTheme)
									}
								>
									<NativeSelect.Option value="lunar">Lì xì</NativeSelect.Option>
									<NativeSelect.Option value="brand">Brand</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
								<Description>Chọn template khách; admin vẫn giữ theme SaaS.</Description>
							</NativeSelect>
							<NativeSelect fullWidth variant="secondary">
								<Label>Trạng thái</Label>
								<NativeSelect.Trigger
									value={form.status}
									onChange={(event) =>
										onFormChange("status", event.currentTarget.value as CampaignStatus)
									}
								>
									<NativeSelect.Option value="active">Active</NativeSelect.Option>
									<NativeSelect.Option value="draft">Draft</NativeSelect.Option>
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
								<Description>Draft để chỉnh, Active để mở station/public claim.</Description>
							</NativeSelect>
						</div>
					</Widget.Content>
				</Widget>
			</Tabs.Panel>

			<Tabs.Panel className="pt-4" id="copy">
				<Widget>
					<Widget.Header>
						<Widget.Title>Public claim copy</Widget.Title>
						<Widget.Description>
							Copy này hiển thị ở hero khi người nhận mở link rút.
						</Widget.Description>
					</Widget.Header>
					<Widget.Content className="gap-4">
						<ItemCardGroup className="admin-card-grid--three" layout="grid" variant="secondary">
							{claimCopyRows.map((row) => (
								<ItemCard className="items-start" key={row.title} variant="secondary">
									<ItemCard.Icon
										className={
											row.color === "success"
												? "text-success"
												: row.color === "warning"
													? "text-warning"
													: "text-muted"
										}
									>
										<row.icon aria-hidden="true" size={18} strokeWidth={2} />
									</ItemCard.Icon>
									<ItemCard.Content>
										<ItemCard.Title>{row.title}</ItemCard.Title>
										<ItemCard.Description className="line-clamp-2 whitespace-normal">
											{row.description}
										</ItemCard.Description>
									</ItemCard.Content>
									<ItemCard.Action>
										<Chip color={row.color} size="sm" variant="soft">
											{row.chip}
										</Chip>
									</ItemCard.Action>
								</ItemCard>
							))}
						</ItemCardGroup>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="admin-field">
								<Label htmlFor="claim-headline">Headline</Label>
								<Input
									fullWidth
									id="claim-headline"
									placeholder={form.name || "Lunar Fortune"}
									value={form.claimHeadline}
									variant="secondary"
									onChange={(event) =>
										onFormChange("claimHeadline", event.currentTarget.value)
									}
								/>
							</div>
							<div className="admin-field">
								<Label htmlFor="claim-start-cta">Start CTA</Label>
								<Input
									fullWidth
									id="claim-start-cta"
									placeholder="Thử vận may"
									value={form.claimCtaLabel}
									variant="secondary"
									onChange={(event) =>
										onFormChange("claimCtaLabel", event.currentTarget.value)
									}
								/>
								<Description>Nút bắt đầu trên hero claim.</Description>
							</div>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="admin-field">
								<Label htmlFor="claim-subtitle">Subtitle</Label>
								<TextArea
									fullWidth
									id="claim-subtitle"
									placeholder={form.brandName || "Premium Gacha Experience"}
									rows={3}
									value={form.claimSubtitle}
									variant="secondary"
									onChange={(event) =>
										onFormChange("claimSubtitle", event.currentTarget.value)
									}
								/>
							</div>
							<div className="admin-field">
								<Label htmlFor="claim-collect-cta">Collect CTA</Label>
								<Input
									fullWidth
									id="claim-collect-cta"
									placeholder="Nhận thưởng"
									value={form.claimCollectLabel}
									variant="secondary"
									onChange={(event) =>
										onFormChange("claimCollectLabel", event.currentTarget.value)
									}
								/>
								<Description>Nút xác nhận sau khi người nhận thấy giải.</Description>
							</div>
						</div>
						<div className="admin-field">
							<Label htmlFor="claim-waiting">Thông điệp chờ</Label>
							<TextArea
								fullWidth
								id="claim-waiting"
								placeholder="Đang chuẩn bị lượt rút..."
								rows={3}
								value={form.claimWaitingMessage}
								variant="secondary"
								onChange={(event) =>
									onFormChange("claimWaitingMessage", event.currentTarget.value)
								}
							/>
						</div>
					</Widget.Content>
				</Widget>
			</Tabs.Panel>

			<Tabs.Panel className="pt-4" id="assets">
				<CampaignAssetsPanel
					assetLimitReached={assetLimitReached}
					assetStateRows={assetStateRows}
					heroPreview={heroPreview}
					retryingUploadAttach={retryingUploadAttach}
					selectedHeroAsset={selectedHeroAsset}
					selectedHeroAssetSize={selectedHeroAssetSize}
					uploading={uploading}
					uploadingAsset={uploadingAsset}
					uploadProgress={uploadProgress}
					visiblePendingUploadedAsset={visiblePendingUploadedAsset}
					onAssetDrop={onAssetDrop}
					onAssetSelect={onAssetSelect}
					onRetryAttachUploadedAsset={onRetryAttachUploadedAsset}
				/>
			</Tabs.Panel>
		</Tabs>
	);
}
