"use client";

import { Input, Label, TextArea } from "@heroui/react";
import { Button } from "@heroui/react";
import { campaignAudienceTagLabels, campaignAudienceTags } from "@/lib/brandIdentity";

/**
 * Shared brand-identity fields (workspace metadata only — the brand color is
 * never injected into guest stages; see docs/product-direction.md). Used by
 * the campaign create form and the campaign overview.
 */
export type CampaignBrandIdentityDraft = {
	brandColor: string;
	audienceTags: string[];
	audienceNote: string;
};

const HEX_PREVIEW_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function CampaignBrandIdentityFields({
	draft,
	idPrefix,
	onChange,
}: {
	draft: CampaignBrandIdentityDraft;
	idPrefix: string;
	onChange: (draft: CampaignBrandIdentityDraft) => void;
}) {
	const toggleTag = (tag: string) => {
		onChange({
			...draft,
			audienceTags: draft.audienceTags.includes(tag)
				? draft.audienceTags.filter((item) => item !== tag)
				: [...draft.audienceTags, tag],
		});
	};

	return (
		<>
			<div className="admin-field">
				<Label htmlFor={`${idPrefix}-brand-color`}>Màu thương hiệu (tuỳ chọn)</Label>
				<div className="flex items-center gap-3">
					<span
						aria-hidden="true"
						className="size-8 shrink-0 rounded-lg border border-border"
						style={{
							background: HEX_PREVIEW_PATTERN.test(draft.brandColor)
								? draft.brandColor
								: "transparent",
						}}
					/>
					<Input
						fullWidth
						id={`${idPrefix}-brand-color`}
						placeholder="#FF0000"
						value={draft.brandColor}
						variant="secondary"
						onChange={(event) => onChange({ ...draft, brandColor: event.currentTarget.value })}
					/>
				</div>
				<p className="mt-1 text-xs text-muted">
					Mã hex (#RGB hoặc #RRGGBB). Chỉ hiển thị trong không gian làm việc, không áp
					dụng lên màn chơi của khách.
				</p>
			</div>
			<div className="admin-field">
				<Label>Đối tượng / kênh dự kiến (tuỳ chọn)</Label>
				<div className="flex flex-wrap gap-2">
					{campaignAudienceTags.map((tag) => {
						const selected = draft.audienceTags.includes(tag);
						return (
							<Button
								aria-pressed={selected}
								key={tag}
								type="button"
								variant={selected ? "primary" : "outline"}
								onPress={() => toggleTag(tag)}
							>
								{campaignAudienceTagLabels[tag]}
							</Button>
						);
					})}
				</div>
			</div>
			<div className="admin-field">
				<Label htmlFor={`${idPrefix}-audience-note`}>Ghi chú đối tượng (tuỳ chọn)</Label>
				<TextArea
					fullWidth
					id={`${idPrefix}-audience-note`}
					placeholder="Ví dụ: ưu tiên kênh QR tại sự kiện, khách vãng lai trung tâm thương mại…"
					value={draft.audienceNote}
					variant="secondary"
					onChange={(event) => onChange({ ...draft, audienceNote: event.currentTarget.value })}
				/>
			</div>
		</>
	);
}
