import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { isLegacyAccountAuthEnabled, isLegacyOwnerBridgeEnabled } from "./authorization";
import {
  configuredPolarServer,
  polar,
  polarProducts,
  polarWebhookPath,
  resolvedPolarServer,
} from "./polarClient";
import {
  configuredMigrationTokenName,
  isConfiguredMigrationTokenProductionSafe,
  isMigrationTokenConfigured,
  migrationTokenEnvNames,
} from "./migrationToken";
import { isSafeCampaignAssetBucketName } from "../lib/assetPolicy";
import { timingSafeEqual } from "../lib/secretPolicy";

type EnvRequirement = {
  key: string;
  label: string;
  names: string[];
  required: boolean;
};

type RuntimeRequirement = {
  key: string;
  label: string;
  required: boolean;
  ready: boolean;
  status: "ready" | "missingEnv" | "missingSync" | "invalidConfig" | "unavailable";
  detail: string;
};

const readinessRequirements: Record<string, EnvRequirement[]> = {
  oauth: [
    {
      key: "convexSiteUrl",
      label: "Convex HTTP Actions URL",
      names: ["CONVEX_SITE_URL"],
      required: true,
    },
    {
      key: "siteUrl",
      label: "Frontend site URL",
      names: ["SITE_URL"],
      required: true,
    },
    {
      key: "googleClientId",
      label: "Google OAuth client id",
      names: ["AUTH_GOOGLE_ID"],
      required: true,
    },
    {
      key: "googleClientSecret",
      label: "Google OAuth client secret",
      names: ["AUTH_GOOGLE_SECRET"],
      required: true,
    },
    {
      key: "jwtPrivateKey",
      label: "Convex Auth JWT private key",
      names: ["JWT_PRIVATE_KEY"],
      required: true,
    },
    {
      key: "jwks",
      label: "Convex Auth public JWKS",
      names: ["JWKS"],
      required: true,
    },
  ],
  r2: [
    {
      key: "token",
      label: "Cloudflare R2 token",
      names: ["R2_TOKEN"],
      required: true,
    },
    {
      key: "accessKeyId",
      label: "Cloudflare R2 access key id",
      names: ["R2_ACCESS_KEY_ID"],
      required: true,
    },
    {
      key: "secretAccessKey",
      label: "Cloudflare R2 secret access key",
      names: ["R2_SECRET_ACCESS_KEY"],
      required: true,
    },
    {
      key: "endpoint",
      label: "Cloudflare R2 endpoint",
      names: ["R2_ENDPOINT"],
      required: true,
    },
    {
      key: "bucket",
      label: "Cloudflare R2 bucket",
      names: ["R2_BUCKET"],
      required: true,
    },
  ],
  polar: [
    {
      key: "organizationToken",
      label: "Polar organization token",
      names: ["POLAR_ORGANIZATION_TOKEN"],
      required: true,
    },
    {
      key: "server",
      label: "Polar server",
      names: ["POLAR_SERVER"],
      required: true,
    },
    {
      key: "webhookSecret",
      label: "Polar webhook secret",
      names: ["POLAR_WEBHOOK_SECRET"],
      required: true,
    },
    {
      key: "proProductId",
      label: "Polar Pro product id",
      names: ["POLAR_PRO_PRODUCT_ID", "LI_XI_POLAR_PRO_PRODUCT_ID"],
      required: true,
    },
    {
      key: "businessProductId",
      label: "Polar Business product id",
      names: ["POLAR_BUSINESS_PRODUCT_ID", "LI_XI_POLAR_BUSINESS_PRODUCT_ID"],
      required: true,
    },
    {
      key: "billingAdminToken",
      label: "Billing product sync admin token",
      names: ["LI_XI_BILLING_ADMIN_TOKEN", "LIXI_BILLING_ADMIN_TOKEN"],
      required: false,
    },
  ],
  operations: [
    {
      key: "opsAdminToken",
      label: "Ops readiness admin token",
      names: ["LI_XI_OPS_ADMIN_TOKEN", "LIXI_OPS_ADMIN_TOKEN"],
      required: false,
    },
    {
      key: "migrationToken",
      label: "Legacy migration token",
      names: [...migrationTokenEnvNames],
      required: false,
    },
    {
      key: "legacyAccountAuth",
      label: "Legacy username/PIN account auth",
      names: ["LI_XI_ENABLE_LEGACY_AUTH", "LEGACY_AUTH_ENABLED"],
      required: false,
    },
    {
      key: "legacyOwnerBridge",
      label: "Legacy ownerId bridge",
      names: ["LI_XI_ENABLE_LEGACY_OWNER_BRIDGE", "LEGACY_OWNER_BRIDGE_ENABLED"],
      required: false,
    },
    {
      key: "paidPlanFallback",
      label: "Paid plan fallback override",
      names: ["LI_XI_ENABLE_PAID_PLAN_FALLBACK", "LIXI_ENABLE_PAID_PLAN_FALLBACK"],
      required: false,
    },
  ],
};

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function buildPublicEndpoint(baseUrl: string | null | undefined, path: string) {
  if (!baseUrl?.trim()) {
    return null;
  }

  try {
    return new URL(path, new URL(baseUrl).origin).toString();
  } catch {
    return null;
  }
}

function buildPublicOrigin(baseUrl: string | undefined) {
  if (!isPublicHttpsOriginUrl(baseUrl)) {
    return null;
  }

  return new URL(baseUrl!.trim()).origin;
}

function buildConvexHttpActionsOrigin(baseUrl: string | undefined) {
  if (!isConvexHttpActionsOrigin(baseUrl)) {
    return null;
  }

  return new URL(baseUrl!.trim()).origin;
}

function isHttpsOriginUrl(value: string | undefined) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return false;
  }

  try {
    const url = new URL(trimmedValue);
    const normalizedOrigin = url.origin.toLowerCase();
    const normalizedInput = trimmedValue.toLowerCase();
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === "" &&
      (normalizedInput === normalizedOrigin || normalizedInput === `${normalizedOrigin}/`)
    );
  } catch {
    return false;
  }
}

function isLocalOrPrivateHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local")
  ) {
    return true;
  }

  if (
    normalizedHostname === "::" ||
    normalizedHostname === "::1" ||
    normalizedHostname.startsWith("fc") ||
    normalizedHostname.startsWith("fd") ||
    normalizedHostname.startsWith("fe80:")
  ) {
    return true;
  }

  const mappedIpv4 = normalizedHostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (normalizedHostname.startsWith("::ffff:") && !mappedIpv4) {
    return true;
  }
  const ipv4Hostname = mappedIpv4?.[1] ?? normalizedHostname;

  const ipv4Match = ipv4Hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return true;
  }

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 169 && second === 254 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isRawIpHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return /^\d+\.\d+\.\d+\.\d+$/.test(normalizedHostname) || normalizedHostname.includes(":");
}

function isPublicHttpsOriginUrl(value: string | undefined) {
  if (!isHttpsOriginUrl(value)) {
    return false;
  }

  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return false;
  }

  const hostname = new URL(trimmedValue).hostname;
  return !isRawIpHostname(hostname) && !isLocalOrPrivateHostname(hostname);
}

function isCloudflareR2EndpointOrigin(value: string | undefined) {
  if (!isHttpsOriginUrl(value)) {
    return false;
  }

  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return false;
  }

  const hostname = new URL(trimmedValue).hostname.toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.r2\.cloudflarestorage\.com$/.test(hostname);
}

function isConvexHttpActionsOrigin(value: string | undefined) {
  if (!isHttpsOriginUrl(value)) {
    return false;
  }

  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return false;
  }

  const hostname = new URL(trimmedValue).hostname.toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.convex\.site$/.test(hostname);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const placeholderSecretValues = new Set([
  "changeme",
  "change-me",
  "example",
  "placeholder",
  "secret",
  "todo",
  "token",
  "your-secret",
  "your-token",
]);

function hasProductionSecretShape(value: string | undefined, minLength = 16) {
  const secret = value?.trim();
  return Boolean(
    secret &&
      secret.length >= minLength &&
      !/\s/.test(secret) &&
      !/[<>]/.test(secret) &&
      !placeholderSecretValues.has(secret.toLowerCase())
  );
}

function hasPkcs8PrivateKeyShape(value: string | undefined) {
  const privateKey = value?.trim();
  return Boolean(
    privateKey &&
      privateKey.startsWith("-----BEGIN PRIVATE KEY-----") &&
      privateKey.endsWith("-----END PRIVATE KEY-----")
  );
}

function hasGoogleOAuthClientIdShape(value: string | undefined) {
  const clientId = value?.trim();
  return Boolean(
    clientId &&
      /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(clientId)
  );
}

function hasGoogleOAuthClientSecretShape(value: string | undefined) {
  return hasProductionSecretShape(value);
}

function hasRsaSigningJwk(value: unknown) {
  return (
    isRecord(value) &&
    value.kty === "RSA" &&
    typeof value.n === "string" &&
    value.n.length > 0 &&
    typeof value.e === "string" &&
    value.e.length > 0 &&
    (value.use === undefined || value.use === "sig") &&
    (value.alg === undefined || value.alg === "RS256")
  );
}

function hasJwksShape(value: string | undefined) {
  const jwks = value?.trim();
  if (!jwks) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(jwks);
    return (
      isRecord(parsed) &&
      Array.isArray(parsed.keys) &&
      parsed.keys.some((key) => hasRsaSigningJwk(key))
    );
  } catch {
    return false;
  }
}

function configuredOpsAdminToken() {
  return process.env.LI_XI_OPS_ADMIN_TOKEN?.trim() || process.env.LIXI_OPS_ADMIN_TOKEN?.trim() || "";
}

function requireOpsAdminToken(adminToken?: string) {
  const expectedToken = configuredOpsAdminToken();
  if (!expectedToken) {
    throw new Error("Cần LI_XI_OPS_ADMIN_TOKEN hoặc LIXI_OPS_ADMIN_TOKEN để xem trạng thái cấu hình production đầy đủ");
  }
  if (!hasProductionSecretShape(expectedToken, 32)) {
    throw new Error("LI_XI_OPS_ADMIN_TOKEN / LIXI_OPS_ADMIN_TOKEN phải là secret production dài, không phải placeholder");
  }
  if (timingSafeEqual(adminToken?.trim(), expectedToken)) {
    return "adminToken";
  }

  throw new Error("Cần LI_XI_OPS_ADMIN_TOKEN hoặc LIXI_OPS_ADMIN_TOKEN để xem trạng thái cấu hình production đầy đủ");
}

async function requireHostReadinessAccess(ctx: QueryCtx) {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId) {
    return "convexAuth";
  }

  throw new Error("Cần đăng nhập Google để xem tóm tắt cấu hình SaaS");
}

function evaluateRequirement(requirement: EnvRequirement) {
  const configuredName = requirement.names.find(hasEnv) ?? null;

  return {
    key: requirement.key,
    label: requirement.label,
    required: requirement.required,
    configured: configuredName !== null,
    configuredName,
    acceptedNames: requirement.names,
  };
}

function normalizeFallbackTier(value: string | undefined) {
  return value === "pro" || value === "business" ? value : "free";
}

function configuredFallbackTier() {
  return normalizeFallbackTier(process.env.LI_XI_DEFAULT_PLAN ?? process.env.LIXI_DEFAULT_PLAN);
}

function isPaidPlanFallbackExplicitlyEnabled() {
  return (
    process.env.LI_XI_ENABLE_PAID_PLAN_FALLBACK === "true" ||
    process.env.LIXI_ENABLE_PAID_PLAN_FALLBACK === "true"
  );
}

function evaluatePaidFallbackConfiguration(): RuntimeRequirement[] {
  const fallbackTier = configuredFallbackTier();
  const paidFallbackEnabled =
    fallbackTier !== "free" && isPaidPlanFallbackExplicitlyEnabled();

  return [
    {
      key: "paidPlanFallbackDisabled",
      label: "Paid fallback plan disabled",
      required: true,
      ready: !paidFallbackEnabled,
      status: paidFallbackEnabled ? "invalidConfig" : "ready",
      detail: paidFallbackEnabled
        ? "Tắt LI_XI_ENABLE_PAID_PLAN_FALLBACK trong production; quyền Pro/Business phải đến từ Polar"
        : fallbackTier === "free"
          ? "Fallback tier đang là Free"
          : "Paid fallback env không có hiệu lực nếu chưa bật override dev/staging",
    },
  ];
}

function evaluateLegacyAuthConfiguration(): RuntimeRequirement[] {
  const legacyAccountAuthEnabled = isLegacyAccountAuthEnabled();
  const legacyOwnerBridgeEnabled = isLegacyOwnerBridgeEnabled();

  return [
    {
      key: "legacyAccountAuthDisabled",
      label: "Legacy account auth disabled",
      required: true,
      ready: !legacyAccountAuthEnabled,
      status: legacyAccountAuthEnabled ? "invalidConfig" : "ready",
      detail: legacyAccountAuthEnabled
        ? "Tắt LI_XI_ENABLE_LEGACY_AUTH trong production; account login phải dùng Convex Auth"
        : "Legacy username/PIN account auth đang tắt",
    },
    {
      key: "legacyOwnerBridgeDisabled",
      label: "Legacy owner bridge disabled",
      required: true,
      ready: !legacyOwnerBridgeEnabled,
      status: legacyOwnerBridgeEnabled ? "invalidConfig" : "ready",
      detail: legacyOwnerBridgeEnabled
        ? "Tắt legacy owner bridge trong production; owner phải resolve từ Convex Auth"
        : "Legacy owner bridge đang tắt",
    },
  ];
}

function evaluateMigrationTokenConfiguration(): RuntimeRequirement[] {
  const migrationTokenConfigured = isMigrationTokenConfigured();
  const configuredName = configuredMigrationTokenName();
  const migrationTokenShapeReady =
    !migrationTokenConfigured || isConfiguredMigrationTokenProductionSafe();

  return [
    {
      key: "migrationTokenDisabled",
      label: "Migration token disabled",
      required: true,
      ready: !migrationTokenConfigured,
      status: migrationTokenConfigured ? "invalidConfig" : "ready",
      detail: migrationTokenConfigured
        ? `Gỡ ${configuredName ?? migrationTokenEnvNames.join(" / ")} khỏi production; backfill token chỉ dùng trong migration window`
        : "Migration token không được cấu hình",
    },
    {
      key: "migrationTokenShapeSafe",
      label: "Migration token shape safe",
      required: migrationTokenConfigured,
      ready: migrationTokenShapeReady,
      status: migrationTokenShapeReady ? "ready" : "invalidConfig",
      detail: migrationTokenShapeReady
        ? "Migration token không cấu hình hoặc có hình dạng secret production-safe"
        : `${configuredName ?? migrationTokenEnvNames.join(" / ")} phải là secret production dài, không phải placeholder`,
    },
  ];
}

function evaluateConvexAuthKeyConfiguration(): RuntimeRequirement[] {
  const privateKeyReady = hasPkcs8PrivateKeyShape(process.env.JWT_PRIVATE_KEY);
  const jwksReady = hasJwksShape(process.env.JWKS);

  return [
    {
      key: "jwtPrivateKeyShape",
      label: "Convex Auth JWT private key shape",
      required: true,
      ready: privateKeyReady,
      status: privateKeyReady
        ? "ready"
        : hasEnv("JWT_PRIVATE_KEY")
          ? "invalidConfig"
          : "missingEnv",
      detail: privateKeyReady
        ? "JWT_PRIVATE_KEY có định dạng PKCS8"
        : "JWT_PRIVATE_KEY phải là PKCS8 private key do Convex Auth generate",
    },
    {
      key: "jwksShape",
      label: "Convex Auth JWKS shape",
      required: true,
      ready: jwksReady,
      status: jwksReady
        ? "ready"
        : hasEnv("JWKS")
          ? "invalidConfig"
          : "missingEnv",
      detail: jwksReady
        ? "JWKS có RSA signing key công khai"
        : "JWKS phải là JSON Web Key Set công khai do Convex Auth generate",
    },
  ];
}

function evaluateGoogleOAuthCredentialConfiguration(): RuntimeRequirement[] {
  const clientIdReady = hasGoogleOAuthClientIdShape(process.env.AUTH_GOOGLE_ID);
  const clientSecretReady = hasGoogleOAuthClientSecretShape(process.env.AUTH_GOOGLE_SECRET);

  return [
    {
      key: "googleClientIdShape",
      label: "Google OAuth client id shape",
      required: true,
      ready: clientIdReady,
      status: clientIdReady
        ? "ready"
        : hasEnv("AUTH_GOOGLE_ID")
          ? "invalidConfig"
          : "missingEnv",
      detail: clientIdReady
        ? "AUTH_GOOGLE_ID có dạng Google OAuth client id"
        : "AUTH_GOOGLE_ID phải có dạng <client-id>.apps.googleusercontent.com",
    },
    {
      key: "googleClientSecretShape",
      label: "Google OAuth client secret shape",
      required: true,
      ready: clientSecretReady,
      status: clientSecretReady
        ? "ready"
        : hasEnv("AUTH_GOOGLE_SECRET")
          ? "invalidConfig"
          : "missingEnv",
      detail: clientSecretReady
        ? "AUTH_GOOGLE_SECRET có hình dạng secret hợp lệ"
        : "AUTH_GOOGLE_SECRET không được là placeholder, quá ngắn, hoặc chứa whitespace",
    },
  ];
}

function evaluateR2Configuration(): RuntimeRequirement[] {
  const endpointReady = isCloudflareR2EndpointOrigin(process.env.R2_ENDPOINT);
  const bucketReady = isSafeCampaignAssetBucketName(process.env.R2_BUCKET);

  return [
    {
      key: "r2EndpointHttpsOrigin",
      label: "R2 endpoint HTTPS origin",
      required: true,
      ready: endpointReady,
      status: endpointReady
        ? "ready"
        : hasEnv("R2_ENDPOINT")
          ? "invalidConfig"
          : "missingEnv",
      detail: endpointReady
        ? "R2_ENDPOINT là Cloudflare R2 HTTPS origin"
        : "R2_ENDPOINT phải có dạng https://<account-id>.r2.cloudflarestorage.com, không kèm path/query/hash/port/credentials",
    },
    {
      key: "r2BucketNameSafe",
      label: "R2 bucket name safe",
      required: true,
      ready: bucketReady,
      status: bucketReady
        ? "ready"
        : hasEnv("R2_BUCKET")
          ? "invalidConfig"
          : "missingEnv",
      detail: bucketReady
        ? "R2_BUCKET có tên bucket an toàn"
        : "R2_BUCKET phải dài 3-63 ký tự, chỉ gồm chữ thường, số, dấu chấm hoặc gạch nối, và không được là IPv4 literal",
    },
  ];
}

function evaluateR2CredentialConfiguration(): RuntimeRequirement[] {
  const tokenReady = hasProductionSecretShape(process.env.R2_TOKEN);
  const accessKeyReady = hasProductionSecretShape(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKeyReady = hasProductionSecretShape(process.env.R2_SECRET_ACCESS_KEY);

  return [
    {
      key: "r2TokenShape",
      label: "R2 token shape",
      required: true,
      ready: tokenReady,
      status: tokenReady
        ? "ready"
        : hasEnv("R2_TOKEN")
          ? "invalidConfig"
          : "missingEnv",
      detail: tokenReady
        ? "R2_TOKEN có hình dạng credential hợp lệ"
        : "R2_TOKEN không được là placeholder, quá ngắn, chứa whitespace, hoặc dùng dấu < >",
    },
    {
      key: "r2AccessKeyIdShape",
      label: "R2 access key id shape",
      required: true,
      ready: accessKeyReady,
      status: accessKeyReady
        ? "ready"
        : hasEnv("R2_ACCESS_KEY_ID")
          ? "invalidConfig"
          : "missingEnv",
      detail: accessKeyReady
        ? "R2_ACCESS_KEY_ID có hình dạng credential hợp lệ"
        : "R2_ACCESS_KEY_ID không được là placeholder, quá ngắn, chứa whitespace, hoặc dùng dấu < >",
    },
    {
      key: "r2SecretAccessKeyShape",
      label: "R2 secret access key shape",
      required: true,
      ready: secretAccessKeyReady,
      status: secretAccessKeyReady
        ? "ready"
        : hasEnv("R2_SECRET_ACCESS_KEY")
          ? "invalidConfig"
          : "missingEnv",
      detail: secretAccessKeyReady
        ? "R2_SECRET_ACCESS_KEY có hình dạng secret hợp lệ"
        : "R2_SECRET_ACCESS_KEY không được là placeholder, quá ngắn, chứa whitespace, hoặc dùng dấu < >",
    },
  ];
}

function evaluatePolarServerConfiguration(): RuntimeRequirement[] {
  const configuredServer = configuredPolarServer();
  const ready = configuredServer === "production" && resolvedPolarServer() === "production";

  return [
    {
      key: "productionPolarServer",
      label: "Polar production server",
      required: true,
      ready,
      status: configuredServer ? (ready ? "ready" : "invalidConfig") : "missingEnv",
      detail: ready
        ? "Polar billing đang trỏ production server"
        : configuredServer
          ? "POLAR_SERVER phải là production trong production deployment"
          : "Thiếu POLAR_SERVER=production cho production billing",
    },
  ];
}

function evaluatePolarCredentialConfiguration(): RuntimeRequirement[] {
  const organizationTokenReady = hasProductionSecretShape(process.env.POLAR_ORGANIZATION_TOKEN);
  const webhookSecretReady = hasProductionSecretShape(process.env.POLAR_WEBHOOK_SECRET);
  const billingAdminTokenConfigured =
    process.env.LI_XI_BILLING_ADMIN_TOKEN !== undefined ||
    process.env.LIXI_BILLING_ADMIN_TOKEN !== undefined;
  const configuredBillingAdminToken =
    process.env.LI_XI_BILLING_ADMIN_TOKEN?.trim() ||
    process.env.LIXI_BILLING_ADMIN_TOKEN?.trim() ||
    "";
  const billingAdminTokenShapeReady =
    !billingAdminTokenConfigured || hasProductionSecretShape(configuredBillingAdminToken, 32);

  return [
    {
      key: "polarOrganizationTokenShape",
      label: "Polar organization token shape",
      required: true,
      ready: organizationTokenReady,
      status: organizationTokenReady
        ? "ready"
        : hasEnv("POLAR_ORGANIZATION_TOKEN")
          ? "invalidConfig"
          : "missingEnv",
      detail: organizationTokenReady
        ? "POLAR_ORGANIZATION_TOKEN có hình dạng token hợp lệ"
        : "POLAR_ORGANIZATION_TOKEN không được là placeholder, quá ngắn, chứa whitespace, hoặc dùng dấu < >",
    },
    {
      key: "polarWebhookSecretShape",
      label: "Polar webhook secret shape",
      required: true,
      ready: webhookSecretReady,
      status: webhookSecretReady
        ? "ready"
        : hasEnv("POLAR_WEBHOOK_SECRET")
          ? "invalidConfig"
          : "missingEnv",
      detail: webhookSecretReady
        ? "POLAR_WEBHOOK_SECRET có hình dạng secret hợp lệ"
        : "POLAR_WEBHOOK_SECRET không được là placeholder, quá ngắn, chứa whitespace, hoặc dùng dấu < >",
    },
    {
      key: "billingAdminTokenDisabled",
      label: "Billing admin token disabled",
      required: true,
      ready: !billingAdminTokenConfigured,
      status: billingAdminTokenConfigured ? "invalidConfig" : "ready",
      detail: billingAdminTokenConfigured
        ? "Gỡ LI_XI_BILLING_ADMIN_TOKEN / LIXI_BILLING_ADMIN_TOKEN sau khi sync Polar products"
        : "Billing product sync admin token không được cấu hình sau khi sync xong",
    },
    {
      key: "billingAdminTokenShapeSafe",
      label: "Billing admin token shape safe",
      required: billingAdminTokenConfigured,
      ready: billingAdminTokenShapeReady,
      status: billingAdminTokenShapeReady ? "ready" : "invalidConfig",
      detail: billingAdminTokenShapeReady
        ? "Billing admin token không cấu hình hoặc có hình dạng secret production-safe"
        : "LI_XI_BILLING_ADMIN_TOKEN / LIXI_BILLING_ADMIN_TOKEN phải là secret production dài, không phải placeholder",
    },
  ];
}

function evaluatePolarProductConfiguration(): RuntimeRequirement[] {
  const configuredProductIds = [polarProducts.pro, polarProducts.business].filter(Boolean);
  if (configuredProductIds.length < 2) {
    return [
      {
        key: "uniqueConfiguredProducts",
        label: "Polar product IDs unique",
        required: true,
        ready: false,
        status: "missingEnv",
        detail: "Cần cấu hình riêng Polar Pro và Business product IDs",
      },
    ];
  }

  const uniqueProductIds = new Set(configuredProductIds);
  const ready = uniqueProductIds.size === configuredProductIds.length;
  return [
    {
      key: "uniqueConfiguredProducts",
      label: "Polar product IDs unique",
      required: true,
      ready,
      status: ready ? "ready" : "invalidConfig",
      detail: ready
        ? "Pro và Business product IDs là hai product riêng biệt"
        : "Pro và Business phải trỏ tới hai Polar product khác nhau",
    },
  ];
}

function evaluatePublicEndpointConfiguration(endpoints: {
  convexSiteOrigin: string | null;
  googleCallbackUrl: string | null;
  polarWebhookUrl: string | null;
  siteUrlOrigin: string | null;
}): RuntimeRequirement[] {
  const convexSiteUrlReady = isConvexHttpActionsOrigin(process.env.CONVEX_SITE_URL);
  const siteUrlReady = isPublicHttpsOriginUrl(process.env.SITE_URL);

  return [
    {
      key: "convexSiteUrlHttps",
      label: "Convex site URL HTTPS origin",
      required: true,
      ready: convexSiteUrlReady,
      status: convexSiteUrlReady
        ? "ready"
        : hasEnv("CONVEX_SITE_URL")
          ? "invalidConfig"
          : "missingEnv",
      detail: convexSiteUrlReady
        ? "CONVEX_SITE_URL là Convex HTTP Actions origin https://<deployment>.convex.site"
        : "CONVEX_SITE_URL production phải là Convex HTTP Actions origin https://<deployment>.convex.site, không kèm path/query/hash/port/credentials",
    },
    {
      key: "siteUrlHttps",
      label: "Frontend site URL HTTPS origin",
      required: true,
      ready: siteUrlReady,
      status: siteUrlReady
        ? "ready"
        : hasEnv("SITE_URL")
          ? "invalidConfig"
          : "missingEnv",
      detail: siteUrlReady
        ? "SITE_URL là HTTPS public origin"
        : "SITE_URL production phải là HTTPS public origin theo domain, không phải localhost/IP riêng/raw IP, và không kèm path/query/hash/port/credentials",
    },
    {
      key: "siteUrlOriginDerived",
      label: "Frontend site URL origin derived",
      required: true,
      ready: endpoints.siteUrlOrigin !== null,
      status: endpoints.siteUrlOrigin ? "ready" : "invalidConfig",
      detail: endpoints.siteUrlOrigin
        ? "SITE_URL public origin đã được dựng để so khớp frontend"
        : "SITE_URL phải là URL hợp lệ để so khớp với VITE_SITE_URL",
    },
    {
      key: "googleCallbackUrlDerived",
      label: "Google callback URL derived",
      required: true,
      ready: endpoints.googleCallbackUrl !== null,
      status: endpoints.googleCallbackUrl ? "ready" : "invalidConfig",
      detail: endpoints.googleCallbackUrl
        ? "Google OAuth callback URL đã được dựng từ CONVEX_SITE_URL"
        : "CONVEX_SITE_URL phải là URL hợp lệ để dựng Google OAuth callback",
    },
    {
      key: "polarWebhookUrlDerived",
      label: "Polar webhook URL derived",
      required: true,
      ready: endpoints.polarWebhookUrl !== null,
      status: endpoints.polarWebhookUrl ? "ready" : "invalidConfig",
      detail: endpoints.polarWebhookUrl
        ? "Polar webhook URL đã được dựng từ CONVEX_SITE_URL"
        : "CONVEX_SITE_URL phải là URL hợp lệ để dựng Polar webhook",
    },
  ];
}

async function evaluatePolarProductSync(ctx: QueryCtx): Promise<RuntimeRequirement[]> {
  const configuredProducts = Object.entries(polarProducts).map(([tier, productId]) => ({
    tier,
    productId,
  }));

  let syncedProductIds = new Set<string>();
  let readError: string | null = null;
  if (configuredProducts.some((product) => product.productId)) {
    try {
      const products = await polar.listProducts(ctx);
      syncedProductIds = new Set(products.map((product) => product.id));
    } catch (error) {
      readError = error instanceof Error ? error.message : "Không thể đọc Polar products đã sync";
    }
  }

  return configuredProducts.map(({ tier, productId }) => {
    const label = tier === "pro" ? "Polar Pro product synced" : "Polar Business product synced";
    if (!productId) {
      return {
        key: `${tier}ProductSynced`,
        label,
        required: true,
        ready: false,
        status: "missingEnv",
        detail: "Thiếu product id trong Convex env",
      };
    }
    if (readError) {
      return {
        key: `${tier}ProductSynced`,
        label,
        required: true,
        ready: false,
        status: "unavailable",
        detail: readError,
      };
    }

    const ready = syncedProductIds.has(productId);
    return {
      key: `${tier}ProductSynced`,
      label,
      required: true,
      ready,
      status: ready ? "ready" : "missingSync",
      detail: ready
        ? "Product đã có trong Convex Polar component"
        : "Chạy billing:syncPolarProducts sau khi cấu hình product id",
    };
  });
}

async function buildSaaSReadiness(ctx: QueryCtx) {
  const convexSiteOrigin = buildConvexHttpActionsOrigin(process.env.CONVEX_SITE_URL);
  const endpoints = {
    convexSiteOrigin,
    googleCallbackUrl: buildPublicEndpoint(convexSiteOrigin, "/api/auth/callback/google"),
    polarWebhookUrl: buildPublicEndpoint(convexSiteOrigin, polarWebhookPath),
    siteUrlOrigin: buildPublicOrigin(process.env.SITE_URL),
  };
  const integrations = Object.fromEntries(
    Object.entries(readinessRequirements).map(([group, requirements]) => [
      group,
      requirements.map(evaluateRequirement),
    ])
  );
  const missingRequired = Object.entries(integrations).flatMap(([group, requirements]) =>
    requirements
      .filter((requirement) => requirement.required && !requirement.configured)
      .map((requirement) => `${group}.${requirement.key}`)
  );
  const runtimeChecks = {
    oauth: [
      ...evaluatePublicEndpointConfiguration(endpoints),
      ...evaluateGoogleOAuthCredentialConfiguration(),
      ...evaluateConvexAuthKeyConfiguration(),
    ],
    r2: [
      ...evaluateR2CredentialConfiguration(),
      ...evaluateR2Configuration(),
    ],
    polar: [
      ...evaluatePolarCredentialConfiguration(),
      ...evaluatePolarServerConfiguration(),
      ...evaluatePolarProductConfiguration(),
      ...(await evaluatePolarProductSync(ctx)),
    ],
    operations: [
      ...evaluatePaidFallbackConfiguration(),
      ...evaluateLegacyAuthConfiguration(),
      ...evaluateMigrationTokenConfiguration(),
    ],
  };
  const missingRuntimeRequired = Object.entries(runtimeChecks).flatMap(([group, requirements]) =>
    requirements
      .filter((requirement) => requirement.required && !requirement.ready)
      .map((requirement) => `${group}.${requirement.key}`)
  );

  return {
    checkedAt: Date.now(),
    allRequiredConfigured: missingRequired.length === 0,
    allRequiredReady: missingRequired.length === 0 && missingRuntimeRequired.length === 0,
    missingRequired,
    missingRuntimeRequired,
    endpoints,
    integrations,
    runtimeChecks,
  };
}

function hostRuntimeDetail(requirement: RuntimeRequirement) {
  if (requirement.ready) {
    return "Ready";
  }
  if (requirement.status === "missingSync") {
    return "Cần admin đồng bộ cấu hình production";
  }
  if (requirement.status === "unavailable") {
    return "Admin cần kiểm tra lại tích hợp production";
  }
  return "Cần admin kiểm tra cấu hình production";
}

function redactReadinessForHost(readiness: Awaited<ReturnType<typeof buildSaaSReadiness>>) {
  return {
    checkedAt: readiness.checkedAt,
    accessSource: "convexAuth" as const,
    allRequiredConfigured: readiness.allRequiredConfigured,
    allRequiredReady: readiness.allRequiredReady,
    missingRequired: readiness.missingRequired,
    missingRuntimeRequired: readiness.missingRuntimeRequired,
    endpoints: readiness.endpoints,
    integrations: Object.fromEntries(
      Object.entries(readiness.integrations).map(([group, requirements]) => [
        group,
        requirements.map((requirement) => ({
          key: requirement.key,
          label: requirement.label,
          required: requirement.required,
          configured: requirement.configured,
        })),
      ])
    ),
    runtimeChecks: Object.fromEntries(
      Object.entries(readiness.runtimeChecks).map(([group, requirements]) => [
        group,
        requirements.map((requirement) => ({
          key: requirement.key,
          label: requirement.label,
          required: requirement.required,
          ready: requirement.ready,
          status: requirement.status,
          detail: hostRuntimeDetail(requirement),
        })),
      ])
    ),
  };
}

export const getSaaSReadiness = query({
  args: {
    adminToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accessSource = requireOpsAdminToken(args.adminToken);

    return {
      ...(await buildSaaSReadiness(ctx)),
      accessSource,
    };
  },
});

export const getHostSaaSReadiness = query({
  args: {},
  handler: async (ctx) => {
    await requireHostReadinessAccess(ctx);
    return redactReadinessForHost(await buildSaaSReadiness(ctx));
  },
});
