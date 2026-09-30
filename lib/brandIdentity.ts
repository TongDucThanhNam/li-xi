/**
 * Campaign brand-identity metadata contract (slice 4d-3). These fields are
 * WORKSPACE METADATA: they describe the campaign to operators and render on
 * the workspace surfaces (create form, overview, campaigns list). The brand
 * color is deliberately never injected into guest stages — every template
 * owns its token contract (see docs/product-direction.md, "Brand identity
 * and campaign-game asset slots").
 */

/** Primary brand color: `#RGB` or `#RRGGBB` hex, stored lowercase. */
const BRAND_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

export function normalizeCampaignBrandColor(value: string | null | undefined): string | undefined {
  const clean = value?.trim().toLowerCase() ?? "";
  if (!clean) {
    return undefined;
  }
  if (!BRAND_COLOR_PATTERN.test(clean)) {
    throw new Error("Màu thương hiệu phải là mã hex hợp lệ, ví dụ #FF0000");
  }
  return clean;
}

/** Free-text channel/audience note bound, mirroring the other copy bounds. */
export const CAMPAIGN_AUDIENCE_NOTE_MAX_LENGTH = 200;

/**
 * Small closed audience/channel-intent set with Vietnamese labels. Stored as
 * stable string keys so renaming a label never rewrites campaign rows.
 */
export const campaignAudienceTags = [
  "existing-customers",
  "new-customers",
  "staff",
  "partners",
  "event-guests",
  "students",
] as const;

export type CampaignAudienceTag = (typeof campaignAudienceTags)[number];

export const campaignAudienceTagLabels: Record<CampaignAudienceTag, string> = {
  "existing-customers": "Khách hàng hiện hữu",
  "new-customers": "Khách hàng mới",
  staff: "Nhân viên nội bộ",
  partners: "Đối tác / đại lý",
  "event-guests": "Khách mời sự kiện",
  students: "Học sinh – sinh viên",
};

export const CAMPAIGN_AUDIENCE_TAGS_MAX = campaignAudienceTags.length;

export function isCampaignAudienceTag(value: string): value is CampaignAudienceTag {
  return (campaignAudienceTags as readonly string[]).includes(value);
}

/**
 * Deduplicated, first-occurrence-ordered tag list; empty input clears.
 * Unknown keys fail closed so a typo can never silently store an
 * unrenderable tag.
 */
export function normalizeCampaignAudienceTags(
  value: readonly string[] | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const tags: string[] = [];
  for (const raw of value) {
    const tag = raw?.trim() ?? "";
    if (!tag) {
      continue;
    }
    if (!isCampaignAudienceTag(tag)) {
      throw new Error("Nhóm đối tượng không hợp lệ");
    }
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags.length > 0 ? tags : undefined;
}
