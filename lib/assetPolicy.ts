export const CAMPAIGN_ASSET_MAX_BYTES = 8 * 1024 * 1024;
export const CAMPAIGN_ASSET_MAX_BYTES_LABEL = "8 MB";

export const CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const CAMPAIGN_ASSET_ALLOWED_TYPES_LABEL = "JPG, PNG, WebP, GIF hoặc AVIF";

/**
 * Declared campaign-asset usages. `"hero"` is the campaign-level hero the
 * draw-era flow already consumes; `"brand-logo"` is campaign brand identity
 * (workspace metadata); the `game-*` kinds are per-game template slots, each
 * owned by exactly one campaign game. Adding a kind is additive: schema,
 * policy limits and the game-editor panel read this table.
 */
export const CAMPAIGN_ASSET_USAGES = [
  "hero",
  "brand-logo",
  "game-wheel-hub",
  "game-quiz-backdrop",
] as const;

export type CampaignAssetUsage = (typeof CAMPAIGN_ASSET_USAGES)[number];

/** Per-game kinds: every `game-*` usage binds its asset row to one game. */
export const CAMPAIGN_GAME_ASSET_USAGES: readonly CampaignAssetUsage[] =
  CAMPAIGN_ASSET_USAGES.filter((usage) => usage.startsWith("game-"));

export function isCampaignAssetUsage(value: string | null | undefined): value is CampaignAssetUsage {
  return (CAMPAIGN_ASSET_USAGES as readonly string[]).includes(value ?? "");
}

export function isCampaignGameAssetUsage(
  value: string | null | undefined,
): value is Exclude<CampaignAssetUsage, "hero" | "brand-logo"> {
  return typeof value === "string" && value.startsWith("game-") && isCampaignAssetUsage(value);
}

/** Kind-parameterized size ceilings with the operator-facing Vietnamese labels. */
export const CAMPAIGN_ASSET_USAGE_LIMITS: Record<
  CampaignAssetUsage,
  { maxBytes: number; label: string; sizeLabel: string }
> = {
  hero: { maxBytes: CAMPAIGN_ASSET_MAX_BYTES, label: "Ảnh hero", sizeLabel: CAMPAIGN_ASSET_MAX_BYTES_LABEL },
  "brand-logo": { maxBytes: 2 * 1024 * 1024, label: "Logo thương hiệu", sizeLabel: "2 MB" },
  "game-wheel-hub": {
    maxBytes: CAMPAIGN_ASSET_MAX_BYTES,
    label: "Ảnh tâm vòng quay",
    sizeLabel: CAMPAIGN_ASSET_MAX_BYTES_LABEL,
  },
  "game-quiz-backdrop": {
    maxBytes: CAMPAIGN_ASSET_MAX_BYTES,
    label: "Ảnh nền trắc nghiệm",
    sizeLabel: CAMPAIGN_ASSET_MAX_BYTES_LABEL,
  },
};

export function campaignAssetUsageLimit(usage: string | null | undefined) {
  return CAMPAIGN_ASSET_USAGE_LIMITS[
    isCampaignAssetUsage(usage) ? usage : "hero"
  ];
}

export type CampaignAssetContentType = (typeof CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES)[number];

export type CampaignAssetRenderCandidate = {
  ownerId?: string;
  bucket?: string;
  status?: string;
  metadataSource?: string;
  validatedAt?: number;
  size?: number;
  contentType?: string | null;
  usage?: string | null;
};

export function normalizeR2ObjectKey(key: string | null | undefined) {
  const value = key?.trim() ?? "";
  if (value.length < 3 || value.length > 1024) {
    return null;
  }
  if (
    ![...value].every((character) => {
      const code = character.charCodeAt(0);
      return !/\s/.test(character) && code > 31 && code !== 127 && !/[<>"'`]/.test(character);
    })
  ) {
    return null;
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return null;
  }
  if (
    !value
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  ) {
    return null;
  }
  return value;
}

export function assertR2ObjectKey(key: string) {
  const normalizedKey = normalizeR2ObjectKey(key);
  if (!normalizedKey) {
    throw new Error("Key asset R2 không hợp lệ");
  }
  return normalizedKey;
}

export function isSafeCampaignAssetBucketName(bucket: string | null | undefined) {
  const normalizedBucket = bucket?.trim() ?? "";
  return (
    normalizedBucket.length >= 3 &&
    normalizedBucket.length <= 63 &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(normalizedBucket) &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalizedBucket) &&
    !normalizedBucket.includes("..") &&
    !normalizedBucket.includes(".-") &&
    !normalizedBucket.includes("-.")
  );
}

export function normalizeAssetContentType(contentType: string | null | undefined) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedCampaignAssetContentType(
  contentType: string | null | undefined
): contentType is CampaignAssetContentType {
  return CAMPAIGN_ASSET_ALLOWED_CONTENT_TYPES.includes(
    normalizeAssetContentType(contentType) as CampaignAssetContentType
  );
}

export function sanitizeAssetFileName(fileName: string | null | undefined) {
  const clean = fileName
    ?.split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === "/" || character === "\\" || code <= 31 || code === 127
        ? " "
        : character;
    })
    .join("")
    .trim()
    .replace(/\s+/g, " ");
  if (!clean) {
    return "Campaign asset";
  }
  return clean.slice(0, 120);
}

export function validateCampaignAssetPolicy(input: {
  contentType?: string | null;
  fileName?: string | null;
  size?: number | null;
  /** Asset kind; defaults to the campaign hero so the legacy path is untouched. */
  usage?: string | null;
}) {
  const contentType = normalizeAssetContentType(input.contentType);
  const size = input.size;
  const limit = campaignAssetUsageLimit(input.usage);
  if (!isAllowedCampaignAssetContentType(contentType)) {
    throw new Error(`Chỉ hỗ trợ ảnh ${CAMPAIGN_ASSET_ALLOWED_TYPES_LABEL}`);
  }

  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Không đọc được dung lượng ảnh upload");
  }

  if (size > limit.maxBytes) {
    throw new Error(`${limit.label} tối đa ${limit.sizeLabel}`);
  }

  return {
    contentType,
    fileName: sanitizeAssetFileName(input.fileName),
    size,
  };
}

export function isRenderableCampaignAssetRecord(
  asset: CampaignAssetRenderCandidate | null | undefined,
  ownerId: string,
  configuredBucket: string | undefined
) {
  const bucket = configuredBucket?.trim() ?? "";
  return Boolean(
    isSafeCampaignAssetBucketName(bucket) &&
      asset &&
      asset.ownerId === ownerId &&
      asset.bucket === bucket &&
      asset.status === "attached" &&
      asset.metadataSource === "r2" &&
      typeof asset.validatedAt === "number" &&
      Number.isSafeInteger(asset.validatedAt) &&
      asset.validatedAt > 0 &&
      typeof asset.size === "number" &&
      Number.isSafeInteger(asset.size) &&
      asset.size > 0 &&
      (asset.usage && asset.usage !== "hero"
        ? // Per-game slots and the brand logo carry their own ceilings.
          asset.size <= campaignAssetUsageLimit(asset.usage).maxBytes
        : asset.size <= CAMPAIGN_ASSET_MAX_BYTES) &&
      isAllowedCampaignAssetContentType(asset.contentType)
  );
}
