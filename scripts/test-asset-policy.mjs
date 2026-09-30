#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  CAMPAIGN_ASSET_MAX_BYTES,
  CAMPAIGN_ASSET_USAGE_LIMITS,
  assertR2ObjectKey,
  campaignAssetUsageLimit,
  isAllowedCampaignAssetContentType,
  isCampaignAssetUsage,
  isCampaignGameAssetUsage,
  isRenderableCampaignAssetRecord,
  isSafeCampaignAssetBucketName,
  normalizeR2ObjectKey,
  normalizeAssetContentType,
  sanitizeAssetFileName,
  validateCampaignAssetPolicy,
} from "../lib/assetPolicy.ts";

const ownerId = "owner_1";
const configuredBucket = "brand-campaign-assets";
const attachedR2Asset = {
  ownerId,
  bucket: configuredBucket,
  status: "attached",
  metadataSource: "r2",
  validatedAt: 1_700_000_000_000,
  size: 2048,
  contentType: "image/webp",
};

assert.equal(normalizeAssetContentType(" Image/PNG ; charset=utf-8 "), "image/png");
assert.equal(isAllowedCampaignAssetContentType("image/avif"), true);
assert.equal(isAllowedCampaignAssetContentType("image/svg+xml"), false);
assert.equal(isSafeCampaignAssetBucketName("brand-campaign-assets"), true);
assert.equal(isSafeCampaignAssetBucketName("ab"), false);
assert.equal(isSafeCampaignAssetBucketName("Brand-Campaign-Assets"), false);
assert.equal(isSafeCampaignAssetBucketName("brand..assets"), false);
assert.equal(isSafeCampaignAssetBucketName("brand-assets-"), false);
assert.equal(
  isSafeCampaignAssetBucketName("192.168.0.1"),
  false,
  "R2 bucket names shaped like IPv4 literals should fail closed"
);
assert.equal(normalizeR2ObjectKey(" campaign-assets/key-1 "), "campaign-assets/key-1");
assert.equal(assertR2ObjectKey("campaign-assets/key-1"), "campaign-assets/key-1");
for (const key of [
  "ab",
  "/campaign-assets/key-1",
  "\\campaign-assets\\key-1",
  "//evil.example.com/key-1",
  "https://assets.example.com/key-1",
  "campaign-assets/../key-1",
  "campaign-assets//key-1",
  "campaign-assets/key-1?signature=secret",
  "campaign-assets/key-1#hash",
  "campaign assets/key-1",
  "campaign-assets/<key-1>",
  "campaign-assets/\"key-1\"",
  "campaign-assets/'key-1'",
  "campaign-assets/`key-1`",
]) {
  assert.equal(normalizeR2ObjectKey(key), null, `${key} should not be accepted as an R2 object key`);
  assert.throws(() => assertR2ObjectKey(key), /Key asset R2 không hợp lệ/);
}
assert.deepEqual(
  validateCampaignAssetPolicy({
    contentType: "IMAGE/JPEG; charset=binary",
    fileName: "  Brand   hero.jpg  ",
    size: 1024,
  }),
  {
    contentType: "image/jpeg",
    fileName: "Brand hero.jpg",
    size: 1024,
  },
  "asset upload validation should normalize content type and file name"
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "too-large.png",
      size: CAMPAIGN_ASSET_MAX_BYTES + 1,
    }),
  /Ảnh hero tối đa 8 MB/
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "zero.png",
      size: 0,
    }),
  /Không đọc được dung lượng ảnh upload/
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "fractional.png",
      size: 1.5,
    }),
  /Không đọc được dung lượng ảnh upload/
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "nan.png",
      size: Number.NaN,
    }),
  /Không đọc được dung lượng ảnh upload/
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/svg+xml",
      fileName: "vector.svg",
      size: 1024,
    }),
  /Chỉ hỗ trợ ảnh JPG, PNG, WebP, GIF hoặc AVIF/
);
assert.equal(sanitizeAssetFileName(""), "Campaign asset");
assert.equal(
  sanitizeAssetFileName("../brand\\hero\nfinal.png"),
  ".. brand hero final.png",
  "asset filenames should strip path separators and control characters before display/storage"
);
assert.equal(sanitizeAssetFileName("a".repeat(121)).length, 120);

// Slice 4d-3: kind-parameterized asset policy. The hero path keeps its exact
// literal; every declared kind carries its own ceiling and operator label;
// unknown/absent kinds fall back to the hero limits.
assert.deepEqual(CAMPAIGN_ASSET_USAGE_LIMITS.hero, {
  maxBytes: CAMPAIGN_ASSET_MAX_BYTES,
  label: "Ảnh hero",
  sizeLabel: "8 MB",
});
assert.equal(isCampaignAssetUsage("hero"), true);
assert.equal(isCampaignAssetUsage("brand-logo"), true);
assert.equal(isCampaignAssetUsage("game-wheel-hub"), true);
assert.equal(isCampaignAssetUsage("game-quiz-backdrop"), true);
assert.equal(isCampaignAssetUsage("banner"), false);
assert.equal(isCampaignAssetUsage(undefined), false);
assert.equal(isCampaignGameAssetUsage("hero"), false);
assert.equal(isCampaignGameAssetUsage("brand-logo"), false);
assert.equal(isCampaignGameAssetUsage("game-wheel-hub"), true);
assert.equal(isCampaignGameAssetUsage("game-quiz-backdrop"), true);

assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "too-large.png",
      size: CAMPAIGN_ASSET_MAX_BYTES + 1,
    }),
  /Ảnh hero tối đa 8 MB/,
  "the default (hero) size message must keep its exact literal"
);
assert.equal(campaignAssetUsageLimit(undefined).maxBytes, CAMPAIGN_ASSET_MAX_BYTES);
assert.equal(campaignAssetUsageLimit("not-a-kind").maxBytes, CAMPAIGN_ASSET_MAX_BYTES);

assert.equal(CAMPAIGN_ASSET_USAGE_LIMITS["brand-logo"].maxBytes, 2 * 1024 * 1024);
assert.doesNotThrow(() =>
  validateCampaignAssetPolicy({
    contentType: "image/png",
    fileName: "logo.png",
    size: 1.5 * 1024 * 1024,
    usage: "brand-logo",
  })
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "logo-too-large.png",
      size: 2 * 1024 * 1024 + 1,
      usage: "brand-logo",
    }),
  /Logo thương hiệu tối đa 2 MB/
);
assert.throws(
  () =>
    validateCampaignAssetPolicy({
      contentType: "image/png",
      fileName: "logo-huge.png",
      size: 3 * 1024 * 1024,
      usage: "brand-logo",
    }),
  /Logo thương hiệu tối đa 2 MB/,
  "a brand logo over its kind ceiling must fail even though it is under the hero ceiling"
);

for (const usage of ["game-wheel-hub", "game-quiz-backdrop"]) {
  const limit = CAMPAIGN_ASSET_USAGE_LIMITS[usage];
  assert.equal(limit.maxBytes, CAMPAIGN_ASSET_MAX_BYTES);
  assert.doesNotThrow(() =>
    validateCampaignAssetPolicy({
      contentType: "image/webp",
      fileName: `${usage}.webp`,
      size: limit.maxBytes,
      usage,
    })
  );
  assert.throws(
    () =>
      validateCampaignAssetPolicy({
        contentType: "image/webp",
        fileName: `${usage}-too-large.webp`,
        size: limit.maxBytes + 1,
        usage,
      }),
    new RegExp(`${limit.label} tối đa ${limit.sizeLabel}`)
  );
}

assert.equal(
  isRenderableCampaignAssetRecord(
    { ...attachedR2Asset, usage: "brand-logo", size: 2 * 1024 * 1024 + 1 },
    ownerId,
    configuredBucket
  ),
  false,
  "an oversized brand-logo row must not render even under the global ceiling"
);
assert.equal(
  isRenderableCampaignAssetRecord(
    { ...attachedR2Asset, usage: "brand-logo", size: 1024 },
    ownerId,
    configuredBucket
  ),
  true,
  "an attached R2-validated brand-logo row inside its kind ceiling should render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, usage: undefined }, ownerId, configuredBucket),
  true,
  "legacy rows without a usage keep rendering under the hero limits"
);
assert.equal(
  isRenderableCampaignAssetRecord(attachedR2Asset, ownerId, configuredBucket),
  true,
  "attached R2-validated owner asset in the configured bucket should render"
);
assert.equal(
  isRenderableCampaignAssetRecord(attachedR2Asset, ownerId, "other-bucket"),
  false,
  "wrong-bucket assets should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, status: "uploaded" }, ownerId, configuredBucket),
  false,
  "raw uploaded assets should not render before attach"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, metadataSource: "client" }, ownerId, configuredBucket),
  false,
  "client-declared metadata should not render without R2 validation"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, validatedAt: undefined }, ownerId, configuredBucket),
  false,
  "legacy rows missing validatedAt should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, validatedAt: 0 }, ownerId, configuredBucket),
  false,
  "assets with zero validation timestamps should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, validatedAt: Number.NaN }, ownerId, configuredBucket),
  false,
  "assets with unsafe validation timestamps should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, size: 0 }, ownerId, configuredBucket),
  false,
  "zero-byte attached R2 assets should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, size: Number.NaN }, ownerId, configuredBucket),
  false,
  "assets with unsafe R2 sizes should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, contentType: "image/svg+xml" }, ownerId, configuredBucket),
  false,
  "unsupported image content types should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord(
    { ...attachedR2Asset, size: CAMPAIGN_ASSET_MAX_BYTES + 1 },
    ownerId,
    configuredBucket
  ),
  false,
  "oversized attached R2 assets should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord({ ...attachedR2Asset, ownerId: "owner_2" }, ownerId, configuredBucket),
  false,
  "foreign owner assets should not render"
);
assert.equal(
  isRenderableCampaignAssetRecord(attachedR2Asset, ownerId, "   "),
  false,
  "missing configured R2 bucket should fail closed"
);
assert.equal(
  isRenderableCampaignAssetRecord(
    { ...attachedR2Asset, bucket: "Brand-Campaign-Assets" },
    ownerId,
    "Brand-Campaign-Assets"
  ),
  false,
  "unsafe configured R2 bucket names should fail closed even when asset rows match"
);

console.log("asset policy regression tests passed");
