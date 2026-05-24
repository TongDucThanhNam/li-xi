#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertFileExists(relativePath) {
  assert(existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
}

function assertFileMissing(relativePath) {
  assert(!existsSync(path.join(root, relativePath)), `${relativePath} must not exist`);
}

function walk(relativeDir, predicate = () => true) {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const result = [];
  for (const entry of readdirSync(absoluteDir)) {
    const relativePath = path.join(relativeDir, entry);
    const absolutePath = path.join(root, relativePath);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      result.push(...walk(relativePath, predicate));
    } else if (predicate(relativePath)) {
      result.push(relativePath);
    }
  }
  return result;
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) {
    fail(`Missing section start: ${start}`);
    return "";
  }
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) {
    fail(`Missing section end after ${start}: ${end}`);
    return source.slice(startIndex);
  }
  return source.slice(startIndex, endIndex);
}

function tailSection(source, start) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) {
    fail(`Missing section start: ${start}`);
    return "";
  }
  return source.slice(startIndex);
}

function assertNoPatternInFiles(files, pattern, message) {
  for (const file of files) {
    const source = read(file);
    if (pattern.test(source)) {
      fail(`${message}: ${file}`);
    }
  }
}

const packageJsonSource = read("package.json");
const packageJson = JSON.parse(packageJsonSource);
const packageLock = JSON.parse(read("package-lock.json"));
const allDependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};
const lockfilePackages = Object.keys(packageLock.packages ?? {});

assert(packageJson.scripts?.dev === "vite dev", "dev script must use Vite");
assert(packageJson.scripts?.build === "vite build", "build script must use Vite");
assert(
  packageJson.scripts?.start === "node .output/server/index.mjs",
  "start script must use TanStack Start/Nitro output"
);
assert(
  packageJson.scripts?.["verify:production"] ===
    "node scripts/verify-production-readiness.mjs --prod",
  "verify:production script must check production SaaS readiness"
);
assert(
  packageJson.scripts?.["verify:local"] === "node scripts/verify-local-readiness.mjs",
  "verify:local script must run the local SaaS readiness gate"
);
assert(
  packageJson.scripts?.["verify:evidence"] === "node scripts/validate-production-evidence.mjs",
  "verify:evidence script must validate the production evidence artifact"
);
assert(
  packageJson.scripts?.["verify:evidence-report"] ===
    "node scripts/validate-production-evidence-report.mjs",
  "verify:evidence-report script must validate the filled production evidence report"
);
assert(
  packageJson.scripts?.["test:contracts"] ===
    "node scripts/verify-saas-contracts.mjs && node scripts/verify-production-readiness.mjs --self-test && node scripts/test-production-readiness-import.mjs && node scripts/validate-production-evidence.mjs --self-test && node scripts/test-production-evidence-validator.mjs && node scripts/validate-production-evidence-report.mjs --self-test && node scripts/test-production-evidence-report-validator.mjs && node scripts/test-host-route-guard.mjs && node scripts/test-authorization-policy.mjs && node scripts/test-secret-policy.mjs && node scripts/test-migration-token-policy.mjs && node scripts/test-asset-policy.mjs && node scripts/test-network-policy.mjs && node scripts/test-billing-policy.mjs && node scripts/test-polar-server-policy.mjs && node scripts/test-entitlement-policy.mjs && node scripts/test-public-app-url-policy.mjs && node scripts/test-public-link-policy.mjs && node scripts/test-analytics-policy.mjs && node scripts/test-saas-workflow-policy.mjs",
  "contract tests must include production readiness self-tests, evidence artifact/report validator self-tests, host route guard regressions, authorization policy regressions, secret policy regressions, migration token policy regressions, asset policy regressions, shared network policy regressions, billing policy regressions, Polar server policy regressions, entitlement policy regressions, public app URL regressions, public link policy regressions, analytics policy regressions, and SaaS workflow policy regressions"
);
const productionVerifier = read("scripts/verify-production-readiness.mjs");
const productionReadinessImportTest = read("scripts/test-production-readiness-import.mjs");
const productionEvidenceValidator = read("scripts/validate-production-evidence.mjs");
const productionEvidenceValidatorImportTest = read("scripts/test-production-evidence-validator.mjs");
const productionEvidenceReportValidator = read("scripts/validate-production-evidence-report.mjs");
const productionEvidenceReportValidatorImportTest = read("scripts/test-production-evidence-report-validator.mjs");
const localVerifier = read("scripts/verify-local-readiness.mjs");
const hostRouteGuardTest = read("scripts/test-host-route-guard.mjs");
const secretPolicy = read("lib/secretPolicy.ts");
const secretPolicyTest = read("scripts/test-secret-policy.mjs");
const assetPolicyTest = read("scripts/test-asset-policy.mjs");
const billingPolicyTest = read("scripts/test-billing-policy.mjs");
const polarServerPolicy = read("lib/polarServerPolicy.ts");
const polarServerPolicyTest = read("scripts/test-polar-server-policy.mjs");
const entitlementPolicyTest = read("scripts/test-entitlement-policy.mjs");
const networkPolicy = read("lib/networkPolicy.ts");
const networkPolicyTest = read("scripts/test-network-policy.mjs");
const publicAppUrlPolicy = read("lib/publicAppUrlPolicy.ts");
const publicAppUrlPolicyTest = read("scripts/test-public-app-url-policy.mjs");
const publicLinkPolicyTest = read("scripts/test-public-link-policy.mjs");
const analyticsPolicyTest = read("scripts/test-analytics-policy.mjs");
const viteConfig = read("vite.config.ts");
const viteEnv = read("vite-env.d.ts");
assert(
  productionVerifier.includes("isConvexCloudDeploymentOrigin") &&
    productionVerifier.includes("convexCloudDeploymentHostPattern") &&
    productionVerifier.includes("[a-z0-9-]*[a-z0-9]") &&
    productionVerifier.includes('url.port === ""') &&
	    productionVerifier.includes("const normalizedOrigin = url.origin.toLowerCase()") &&
	    productionVerifier.includes("normalizedInput === `${normalizedOrigin}/`") &&
	    productionVerifier.includes("https://<deployment>.convex.cloud") &&
	    productionVerifier.includes("const convexUrlReady = isConvexCloudDeploymentOrigin(process.env.VITE_CONVEX_URL)") &&
	    productionVerifier.includes("const siteUrlReady = isPublicHttpsOriginUrl(process.env.VITE_SITE_URL)") &&
    productionVerifier.includes("frontendSiteUrlPublicOrigin") &&
    productionVerifier.includes("--evidence-out") &&
    productionVerifier.includes("li-xi.production-readiness-evidence.v1") &&
    productionVerifier.includes('mode: "audit-safe"') &&
    productionVerifier.includes('"runtimeCheck.detail"') &&
    productionVerifier.includes("writeEvidence") &&
    productionVerifier.includes('JSON.stringify(readyEvidence).includes(\'"configuredName":\') === false') &&
    productionVerifier.includes('JSON.stringify(readyEvidence).includes(\'"acceptedNames":\') === false') &&
    productionVerifier.includes('JSON.stringify(readyEvidence).includes(\'"detail":\') === false') &&
    productionVerifier.includes("Wrote redacted readiness evidence") &&
	    productionVerifier.includes("--self-test") &&
	    productionVerifier.includes("runSelfTests") &&
	    productionVerifier.includes("pathToFileURL") &&
	    productionVerifier.includes("import.meta.url === pathToFileURL(process.argv[1]).href") &&
	    productionVerifier.includes("export {") &&
	    productionVerifier.includes("evaluateFrontendReadiness") &&
	    productionVerifier.includes("evaluateCrossRuntimeReadiness") &&
	    packageJsonSource.includes("node scripts/test-production-readiness-import.mjs") &&
	    productionReadinessImportTest.includes('from "./verify-production-readiness.mjs"') &&
	    productionReadinessImportTest.includes("production readiness import tests passed") &&
	    productionReadinessImportTest.includes("frontendBackendConvexDeploymentMatch") &&
	    productionReadinessImportTest.includes('"detail":') &&
	    productionReadinessImportTest.includes("evidence should remain audit-safe") &&
	    productionVerifier.includes('const googleCallbackPath = "/api/auth/callback/google"') &&
	    productionVerifier.includes('const polarWebhookPath = "/polar/events"') &&
	    productionVerifier.includes("deriveExpectedBackendEndpoints") &&
	    productionVerifier.includes("buildReadinessEndpoint") &&
	    productionVerifier.includes("https://prod-a.convex.site/api/auth/callback/google") &&
	    productionVerifier.includes("https://prod-a.convex.site/polar/events") &&
	    productionVerifier.includes("https://prod-a.convex.cloud") &&
	    productionVerifier.includes("https://prod-a.convex.site") &&
	    productionVerifier.includes("https://prod-b.convex.site") &&
	    productionVerifier.includes("deployment.frontendBackendConvexDeploymentMatch") &&
	    productionVerifier.includes("deployment.frontendBackendSiteOriginMatch") &&
	    !productionVerifier.includes('hostname.endsWith(".convex.cloud")') &&
    !productionVerifier.includes('hostname === "convex.cloud"'),
  "production verifier must require VITE_CONVEX_URL to be a clean Convex cloud deployment origin and support redacted evidence output"
);
assert(
  localVerifier.includes('args: ["convex", "codegen"]') &&
    localVerifier.includes('args: ["run", "typecheck"]') &&
    localVerifier.includes('args: ["run", "test:contracts"]') &&
    localVerifier.includes('args: ["run", "lint"]') &&
    localVerifier.includes('args: ["audit", "--omit=dev"]') &&
    localVerifier.includes('args: ["run", "test:smoke"]') &&
    localVerifier.includes('await rm(".output", { recursive: true, force: true })') &&
    localVerifier.includes('existsSync(".output")') &&
    localVerifier.includes("local readiness verification passed"),
  "local verifier must run codegen, typecheck, contracts, lint, audit, smoke, and .output cleanup"
);
assert(
  packageJson.scripts?.["test:contracts"]?.includes("node scripts/test-migration-token-policy.mjs"),
  "contract test suite must include migration token policy regression tests"
);
assert(
  packageJson.scripts?.["test:contracts"]?.includes("node scripts/test-network-policy.mjs") &&
    networkPolicy.includes("export function normalizeHostname") &&
    networkPolicy.includes("export function isRawIpv4Hostname") &&
    networkPolicy.includes("export function isRawIpv6Hostname") &&
    networkPolicy.includes("export function isRawIpHostname") &&
    networkPolicy.includes("export function isLocalOrPrivateHostname") &&
    networkPolicy.includes("first === 100 && second >= 64 && second <= 127") &&
    networkPolicy.includes("first === 169 && second === 254") &&
    networkPolicy.includes("first === 192 && second === 0 && third === 2") &&
    networkPolicy.includes("first === 198 && second === 51 && third === 100") &&
    networkPolicy.includes("first === 203 && second === 0 && third === 113") &&
    networkPolicy.includes("normalizedHostname.startsWith(\"fd\")") &&
    networkPolicy.includes("normalizedHostname.startsWith(\"fe80:\")") &&
    networkPolicy.includes("mappedIpv4") &&
    networkPolicy.includes("normalizedHostname.startsWith(\"::ffff:\")") &&
    networkPolicyTest.includes("network policy regression tests passed") &&
    networkPolicyTest.includes("100.64.0.1") &&
    networkPolicyTest.includes("169.254.1.1") &&
    networkPolicyTest.includes("2606:4700:4700::1111"),
  "shared network policy must own hostname/IP helpers and have regression coverage"
);
for (const [consumerName, source] of [
  ["lib/billingPolicy.ts", read("lib/billingPolicy.ts")],
  ["lib/publicAppUrlPolicy.ts", read("lib/publicAppUrlPolicy.ts")],
  ["convex/ops.ts", read("convex/ops.ts")],
  ["scripts/verify-production-readiness.mjs", read("scripts/verify-production-readiness.mjs")],
  ["scripts/validate-production-evidence-report.mjs", read("scripts/validate-production-evidence-report.mjs")],
]) {
  assert(
    !/function (?:normalizeHostname|isRawIpv4Hostname|isRawIpv6Hostname|isRawIpHostname|isLocalOrPrivateHostname)\b/.test(
      source
    ),
    `${consumerName} must import shared network helpers instead of redefining them`
  );
}
assert(
	  productionEvidenceValidator.includes("li-xi.production-readiness-evidence.v1") &&
	    productionEvidenceValidator.includes("validateProductionEvidence") &&
	    productionEvidenceValidator.includes("pathToFileURL") &&
	    productionEvidenceValidator.includes("import.meta.url === pathToFileURL(process.argv[1]).href") &&
	    productionEvidenceValidator.includes("convexSiteDeploymentHostPattern") &&
	    productionEvidenceValidator.includes("[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.convex\\.site") &&
	    productionEvidenceValidator.includes("convex site origin with leading hyphen") &&
	    productionEvidenceValidator.includes("convex site origin with trailing hyphen") &&
	    productionEvidenceValidator.includes("convex site origin with explicit default port") &&
	    packageJsonSource.includes("node scripts/test-production-evidence-validator.mjs") &&
	    productionEvidenceValidatorImportTest.includes('from "./validate-production-evidence.mjs"') &&
	    productionEvidenceValidatorImportTest.includes("production evidence validator import tests passed") &&
	    productionEvidenceValidatorImportTest.includes("bad Convex site deployment label") &&
	    productionEvidenceValidatorImportTest.includes("default-port Convex site origin") &&
	    productionEvidenceValidatorImportTest.includes("CGNAT site origin") &&
	    productionEvidenceValidatorImportTest.includes("raw public IPv4 site origin") &&
	    productionEvidenceValidatorImportTest.includes("raw public IPv6 site origin") &&
	    productionEvidenceValidatorImportTest.includes("default-port Google callback") &&
	    productionEvidenceValidatorImportTest.includes("default-port Polar webhook") &&
	    productionEvidenceValidatorImportTest.includes("missing required backend runtime group") &&
	    productionEvidenceValidatorImportTest.includes("required runtime not ready") &&
	    productionEvidenceValidatorImportTest.includes("forbidden runtime detail") &&
	    productionEvidenceValidator.includes("requiredOmittedFields") &&
    productionEvidenceValidator.includes("forbiddenFieldNames") &&
    productionEvidenceValidator.includes("assertIsoDateString") &&
    productionEvidenceValidator.includes("assertUnixMs") &&
    productionEvidenceValidator.includes("assertEvidenceTimestampConsistency") &&
    productionEvidenceValidator.includes("allowedClockSkewMs") &&
    productionEvidenceValidator.includes("maxGeneratedAfterCheckedAtMs") &&
    productionEvidenceValidator.includes('accessSource === "adminToken"') &&
    productionEvidenceValidator.includes("invalid generatedAt") &&
    productionEvidenceValidator.includes("invalid checkedAt") &&
    productionEvidenceValidator.includes("generated before checkedAt") &&
    productionEvidenceValidator.includes("generated too long after checkedAt") &&
    productionEvidenceValidator.includes("host readiness access source") &&
    productionEvidenceValidator.includes("productionReady === true") &&
    productionEvidenceValidator.includes("allRequiredReady === true") &&
    productionEvidenceValidator.includes("missingRuntimeRequired.length === 0") &&
    productionEvidenceValidator.includes("assertRequiredRuntimeCheckKeys") &&
    productionEvidenceValidator.includes("assertRequiredRuntimeCheckGroups") &&
    productionEvidenceValidator.includes("oauth: [") &&
    productionEvidenceValidator.includes("r2: [") &&
    productionEvidenceValidator.includes("polar: [") &&
    productionEvidenceValidator.includes("operations: [") &&
    productionEvidenceValidator.includes("frontendConvexUrlHttpsOrigin") &&
    productionEvidenceValidator.includes("frontendLegacyAccountAuthDisabled") &&
    productionEvidenceValidator.includes("frontendLegacyOwnerBridgeDisabled") &&
    productionEvidenceValidator.includes("convexSiteUrlHttps") &&
    productionEvidenceValidator.includes("siteUrlOriginDerived") &&
    productionEvidenceValidator.includes("googleCallbackUrlDerived") &&
    productionEvidenceValidator.includes("polarWebhookUrlDerived") &&
    productionEvidenceValidator.includes("googleClientIdShape") &&
    productionEvidenceValidator.includes("googleClientSecretShape") &&
    productionEvidenceValidator.includes("jwtPrivateKeyShape") &&
    productionEvidenceValidator.includes("jwksShape") &&
    productionEvidenceValidator.includes("r2EndpointHttpsOrigin") &&
    productionEvidenceValidator.includes("r2BucketNameSafe") &&
    productionEvidenceValidator.includes("r2TokenShape") &&
    productionEvidenceValidator.includes("r2AccessKeyIdShape") &&
    productionEvidenceValidator.includes("r2SecretAccessKeyShape") &&
    productionEvidenceValidator.includes("polarOrganizationTokenShape") &&
    productionEvidenceValidator.includes("polarWebhookSecretShape") &&
    productionEvidenceValidator.includes("productionPolarServer") &&
    productionEvidenceValidator.includes("uniqueConfiguredProducts") &&
    productionEvidenceValidator.includes("billingAdminTokenShapeSafe") &&
    productionEvidenceValidator.includes("paidPlanFallbackDisabled") &&
    productionEvidenceValidator.includes("migrationTokenDisabled") &&
    productionEvidenceValidator.includes("migrationTokenShapeSafe") &&
    productionEvidenceValidator.includes("legacyAccountAuthDisabled") &&
    productionEvidenceValidator.includes("legacyOwnerBridgeDisabled") &&
    productionEvidenceValidator.includes("frontendBackendSiteOriginMatch") &&
	    productionEvidenceValidator.includes("frontendBackendConvexDeploymentMatch") &&
	    productionEvidenceValidator.includes("assertRuntimeCheckKeysPresent") &&
	    productionEvidenceValidator.includes("missing backend billing token shape check") &&
	    productionEvidenceValidator.includes("missing backend migration token shape check") &&
	    productionEvidenceValidatorImportTest.includes("missing optional token shape checks") &&
	    productionEvidenceValidator.includes("assertRequiredRuntimeChecksReady") &&
	    productionEvidenceValidator.includes("check.required === true") &&
	    productionEvidenceValidator.includes("check.ready === true") &&
    productionEvidenceValidator.includes('check.status === "ready"') &&
    productionEvidenceValidator.includes("required runtime check not ready") &&
    productionEvidenceValidator.includes("missing frontend legacy shutdown check") &&
    productionEvidenceValidator.includes("missing backend migration token shutdown check") &&
    productionEvidenceValidator.includes("missing backend google callback derived check") &&
    productionEvidenceValidator.includes("missing backend r2 endpoint readiness check") &&
    productionEvidenceValidator.includes("misplaced backend r2 endpoint readiness check") &&
    productionEvidenceValidator.includes("missing backend configured products check") &&
    productionEvidenceValidator.includes("missing cross-runtime site origin match check") &&
    productionEvidenceValidator.includes("assertConvexSiteOrigin") &&
    productionEvidenceValidator.includes("assertPublicSiteOrigin") &&
    productionEvidenceValidator.includes("assertEndpointUrl") &&
    productionEvidenceValidator.includes("must be a clean origin") &&
    productionEvidenceValidator.includes("must be a clean endpoint URL") &&
    productionEvidenceValidator.includes("convex site origin with path") &&
    productionEvidenceValidator.includes("private public site origin") &&
    productionEvidenceValidator.includes("cgnat public site origin") &&
    productionEvidenceValidator.includes("raw public ipv4 site origin") &&
    productionEvidenceValidator.includes("raw public ipv6 site origin") &&
    productionEvidenceValidator.includes("localhost subdomain public site origin") &&
    productionEvidenceValidator.includes('!hostname.endsWith(".localhost")') &&
    productionEvidenceValidator.includes("private ipv6 public site origin") &&
    productionEvidenceValidator.includes("private/link-local/CGNAT") &&
    productionEvidenceValidator.includes("must not be a raw IPv6 address") &&
    productionEvidenceValidator.includes("mismatched google callback origin") &&
    productionEvidenceValidator.includes("google callback with credentials") &&
    productionEvidenceValidator.includes("google callback with explicit default port") &&
    productionEvidenceValidator.includes("polar webhook with explicit default port") &&
    productionEvidenceValidator.includes("must not include credentials") &&
    productionEvidenceValidator.includes("wrong Polar webhook path") &&
    productionEvidenceValidator.includes("production evidence validator self-tests passed"),
  "production evidence validator must enforce ready state, schema, endpoint shapes, and audit-safe redaction"
);
assert(
  productionEvidenceReportValidator.includes("validateProductionEvidenceReport") &&
    productionEvidenceReportValidator.includes("requiredSections") &&
    productionEvidenceReportValidator.includes("valueLines.join") &&
    productionEvidenceReportValidator.includes("Google OAuth") &&
    productionEvidenceReportValidator.includes("Campaign And Public Claim") &&
	    productionEvidenceReportValidator.includes("Start CTA rendered") &&
	    productionEvidenceReportValidator.includes("Collect CTA rendered") &&
	    productionEvidenceReportValidator.includes("function assertRenderedCopyEvidence") &&
	    productionEvidenceReportValidator.includes("must record the observed copy text, not a boolean result") &&
	    productionEvidenceReportValidator.includes("start and collect CTA evidence must be distinct copy values") &&
	    productionEvidenceReportValidator.includes("missing collect CTA evidence") &&
	    productionEvidenceReportValidator.includes("boolean start CTA evidence") &&
	    productionEvidenceReportValidator.includes("duplicate CTA evidence") &&
	    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Campaign And Public Claim", campaignBody, "Campaign id or slug")') &&
	    productionEvidenceReportValidator.includes("Malformed public code closed") &&
	    productionEvidenceReportValidator.includes("missing malformed public code check") &&
	    productionEvidenceReportValidator.includes("Expired public code closed") &&
	    productionEvidenceReportValidator.includes("Inactive campaign public claim closed") &&
	    productionEvidenceReportValidator.includes("Guest API internal ids absent") &&
	    productionEvidenceReportValidator.includes("missing expired public-code check") &&
	    productionEvidenceReportValidator.includes("failed inactive campaign public-claim check") &&
	    productionEvidenceReportValidator.includes("missing guest API internal id privacy check") &&
	    productionEvidenceReportValidator.includes("failed guest API internal id privacy check") &&
	    productionEvidenceReportValidator.includes("Negative checks") &&
    productionEvidenceReportValidator.includes("missing R2 negative checks") &&
    productionEvidenceReportValidator.includes("Owner backfill audit decisions") &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Analytics And Backfill", analyticsBody, "Owner id")') &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Analytics And Backfill", analyticsBody, "Campaign id")') &&
    productionEvidenceReportValidator.includes("Campaign id must match Campaign And Public Claim.Campaign id or slug") &&
    productionEvidenceReportValidatorImportTest.includes("mismatched analytics campaign evidence") &&
    productionEvidenceReportValidator.includes("missing owner backfill audit decisions") &&
    productionEvidenceReportValidator.includes("Maintenance dry-run audit decisions") &&
    productionEvidenceReportValidator.includes("missing maintenance audit decisions") &&
    productionEvidenceReportValidator.includes("assertCommandIncludes") &&
    productionEvidenceReportValidator.includes("assertProductionReadinessCommandShape") &&
    productionEvidenceReportValidator.includes("assertDeploymentMetadataEvidence") &&
    productionEvidenceReportValidator.includes("must be an ISO date") &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Deployment", deploymentBody, "Verifier")') &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Deployment", deploymentBody, "Release/ref")') &&
    productionEvidenceReportValidator.includes("assertDeploymentOriginsMatchReadinessCommand") &&
    productionEvidenceReportValidator.includes("assertGoogleOAuthEvidence") &&
    productionEvidenceReportValidator.includes("assertR2Evidence") &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Cloudflare R2", r2Body, "Asset row id")') &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Cloudflare R2", r2Body, "Asset owner id")') &&
    productionEvidenceReportValidator.includes("Asset owner id must match Analytics And Backfill.Owner id") &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Cloudflare R2", r2Body, "Asset campaign id or slug")') &&
    productionEvidenceReportValidator.includes("Asset campaign id or slug must match Campaign And Public Claim.Campaign id or slug") &&
    productionEvidenceReportValidator.includes("assertPolarEvidence") &&
    productionEvidenceReportValidator.includes("function assertConcreteEvidenceValue") &&
    productionEvidenceReportValidator.includes("must record the concrete id or alias, not a boolean/status result") &&
    productionEvidenceReportValidator.includes("must not be a placeholder") &&
    productionEvidenceReportValidator.includes("must not be a URL") &&
    productionEvidenceReportValidator.includes("assertEndpointUrl") &&
    productionEvidenceReportValidator.includes("commandEnvValue") &&
    productionEvidenceReportValidator.includes("convexDeploymentLabel") &&
    productionEvidenceReportValidator.includes("publicAppOrigin") &&
    productionEvidenceReportValidator.includes('from "../lib/networkPolicy.ts"') &&
    productionEvidenceReportValidator.includes("isLocalOrPrivateHostname") &&
    !productionEvidenceReportValidator.includes("function isLocalOrPrivateHostname") &&
    !productionEvidenceReportValidator.includes("function isRawIpv4Hostname") &&
    !productionEvidenceReportValidator.includes("function isRawIpv6Hostname") &&
    productionEvidenceReportValidator.includes("must not include a port") &&
    productionEvidenceReportValidator.includes("must be a clean origin") &&
    productionEvidenceReportValidator.includes("must not be a raw IPv4 address") &&
    productionEvidenceReportValidator.includes("must not be a raw IPv6 address") &&
    productionEvidenceReportValidator.includes("must be a public app origin") &&
    productionEvidenceReportValidator.includes("convexDeploymentLabelPattern") &&
    productionEvidenceReportValidator.includes("must include a clean deployment label") &&
    productionEvidenceReportValidator.includes("VITE_SITE_URL must match Deployment.App origin") &&
    productionEvidenceReportValidator.includes("VITE_CONVEX_URL must match Deployment.Convex cloud origin") &&
    productionEvidenceReportValidator.includes("Convex cloud and HTTP Actions origins must use the same deployment label") &&
    productionEvidenceReportValidator.includes("Google OAuth.Google callback URL") &&
    productionEvidenceReportValidator.includes("assertPassEvidence") &&
    productionEvidenceReportValidator.includes("assertYesEvidence") &&
    productionEvidenceReportValidator.includes("Browser sign-in result") &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Google OAuth", googleOAuthBody, "Host profile row id")') &&
    productionEvidenceReportValidator.includes("Legacy owner session absent or ignored") &&
    productionEvidenceReportValidator.includes("Campaign status") &&
    productionEvidenceReportValidator.includes('["active"]') &&
    productionEvidenceReportValidator.includes("/api/auth/callback/google") &&
    productionEvidenceReportValidator.includes("Checkout return origin") &&
    productionEvidenceReportValidator.includes("Customer portal return origin") &&
    productionEvidenceReportValidator.includes("allowedSearches.includes(url.search)") &&
    productionEvidenceReportValidator.includes('["", "?checkout=success"]') &&
    productionEvidenceReportValidator.includes("must use one of these query strings") &&
    productionEvidenceReportValidator.includes("Polar.Checkout return origin must match Deployment.App origin") &&
    productionEvidenceReportValidator.includes("Polar.Customer portal return origin must match Deployment.App origin") &&
	    productionEvidenceReportValidator.includes("Convex billing state") &&
	    productionEvidenceReportValidator.includes("Billing sync token removed") &&
	    productionEvidenceReportValidator.includes("Billing admin token shape checked") &&
	    productionEvidenceReportValidator.includes("Migration token shape checked") &&
	    productionEvidenceReportValidator.includes("Webhook receipt time") &&
	    productionEvidenceReportValidator.includes("assertIsoDateTimeField") &&
	    productionEvidenceReportValidator.includes("must be an ISO-8601 UTC timestamp") &&
	    productionEvidenceReportValidator.includes("Polar.Polar webhook URL") &&
    productionEvidenceReportValidator.includes("/polar/events") &&
    productionEvidenceReportValidator.includes("campaignAssetAllowedContentTypes") &&
    productionEvidenceReportValidator.includes("campaignAssetMaxBytes") &&
    productionEvidenceReportValidator.includes("Cloudflare R2.Size must be between 1 byte and 8 MB") &&
    productionEvidenceReportValidator.includes("stripInlineCode") &&
    productionEvidenceReportValidator.includes("pathToFileURL") &&
    productionEvidenceReportValidator.includes("import.meta.url === pathToFileURL(process.argv[1]).href") &&
    packageJsonSource.includes("node scripts/test-production-evidence-report-validator.mjs") &&
    productionEvidenceReportValidatorImportTest.includes('import { validateProductionEvidenceReport } from "./validate-production-evidence-report.mjs"') &&
    productionEvidenceReportValidatorImportTest.includes("production evidence report validator import tests passed") &&
    productionEvidenceReportValidatorImportTest.includes("Content type: image/webp; charset=binary") &&
    productionEvidenceReportValidatorImportTest.includes("LI_XI_OPS_ADMIN_TOKEN=raw-secret") &&
    productionEvidenceReportValidatorImportTest.includes("wrong R2 metadata source") &&
    productionEvidenceReportValidatorImportTest.includes("boolean R2 asset row id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("placeholder R2 asset row id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("URL R2 asset row id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("mismatched R2 asset owner evidence") &&
    productionEvidenceReportValidatorImportTest.includes("boolean R2 asset owner evidence") &&
    productionEvidenceReportValidatorImportTest.includes("mismatched R2 asset campaign evidence") &&
    productionEvidenceReportValidatorImportTest.includes("placeholder R2 asset campaign evidence") &&
    productionEvidenceReportValidatorImportTest.includes("failed public claim redeem") &&
    productionEvidenceReportValidatorImportTest.includes("guest API internal ids exposed") &&
    productionEvidenceReportValidatorImportTest.includes("boolean campaign id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("placeholder campaign id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("URL campaign id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("mismatched Polar checkout return origin") &&
    productionEvidenceReportValidatorImportTest.includes("boolean Polar customer id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("placeholder Polar subscription id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("URL Polar product evidence") &&
    productionEvidenceReportValidatorImportTest.includes("failed Polar checkout result") &&
    productionEvidenceReportValidatorImportTest.includes("default-port Polar checkout return origin") &&
    productionEvidenceReportValidatorImportTest.includes("default-port Google callback URL") &&
    productionEvidenceReportValidatorImportTest.includes("boolean host profile row id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("placeholder host profile row id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("URL host profile row id evidence") &&
    productionEvidenceReportValidatorImportTest.includes("invalid deployment environment") &&
    productionEvidenceReportValidatorImportTest.includes("invalid evidence date") &&
    productionEvidenceReportValidatorImportTest.includes("boolean verifier evidence") &&
    productionEvidenceReportValidatorImportTest.includes("URL release ref evidence") &&
    productionEvidenceReportValidatorImportTest.includes("default-port Polar webhook URL") &&
    productionEvidenceReportValidatorImportTest.includes("raw Polar portal return origin") &&
	    productionEvidenceReportValidatorImportTest.includes("billing sync token still present") &&
	    productionEvidenceReportValidatorImportTest.includes("invalid Polar webhook receipt time") &&
	    productionEvidenceReportValidatorImportTest.includes("boolean analytics owner id evidence") &&
	    productionEvidenceReportValidatorImportTest.includes("placeholder analytics campaign id evidence") &&
	    productionEvidenceReportValidatorImportTest.includes("URL analytics campaign id evidence") &&
	    productionEvidenceReportValidatorImportTest.includes("ops token shape unchecked") &&
	    productionEvidenceReportValidatorImportTest.includes("billing admin token shape unchecked") &&
	    productionEvidenceReportValidatorImportTest.includes("migration token shape unchecked") &&
    productionEvidenceReportValidatorImportTest.includes("migration token still present") &&
    productionEvidenceReportValidatorImportTest.includes("generic temporary token cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("missing ops admin token cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("missing billing admin token cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("missing billing admin alias token cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("missing migration token cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("missing migration token alias cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("generic legacy flag cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("missing paid fallback cleanup evidence") &&
    productionEvidenceReportValidatorImportTest.includes("wrong Polar webhook path") &&
    productionEvidenceReportValidator.includes("`VITE_CONVEX_URL=https://prod-a.convex.cloud") &&
    productionEvidenceReportValidator.includes("`npm run verify:evidence -- /tmp/li-xi-production-readiness.json`") &&
    productionEvidenceReportValidator.includes("Bucket matches configured R2 bucket") &&
    productionEvidenceReportValidator.includes("Metadata source") &&
    productionEvidenceReportValidator.includes("Artifact location must match --evidence-out path") &&
    productionEvidenceReportValidator.includes("Artifact validation must validate the generated artifact path") &&
    productionEvidenceReportValidator.includes("li-xi-production-readiness") &&
    productionEvidenceReportValidator.includes("must be a li-xi production readiness JSON artifact") &&
    productionEvidenceReportValidator.includes("npm run verify:local") &&
    productionEvidenceReportValidator.includes("npm run verify:production") &&
    productionEvidenceReportValidator.includes("--evidence-out") &&
    productionEvidenceReportValidator.includes("VITE_CONVEX_URL=") &&
    productionEvidenceReportValidator.includes("VITE_CONVEX_URL=https://") &&
    productionEvidenceReportValidator.includes("convex.cloud") &&
    productionEvidenceReportValidator.includes("VITE_SITE_URL=") &&
    productionEvidenceReportValidator.includes("VITE_SITE_URL=https://") &&
    productionEvidenceReportValidator.includes("LI_XI_OPS_ADMIN_TOKEN=") &&
    productionEvidenceReportValidator.includes("LIXI_OPS_ADMIN_TOKEN") &&
    productionEvidenceReportValidator.includes("LI_XI_OPS_ADMIN_TOKEN=<") &&
    productionEvidenceReportValidatorImportTest.includes("LIXI_OPS_ADMIN_TOKEN=<token>") &&
    productionEvidenceReportValidatorImportTest.includes("raw ops alias token") &&
    productionEvidenceReportValidator.includes("must keep the ops token redacted") &&
    productionEvidenceReportValidator.includes("npm run verify:evidence") &&
    productionEvidenceReportValidator.includes("wrong local gate command") &&
    productionEvidenceReportValidator.includes("missing production evidence command") &&
    productionEvidenceReportValidator.includes("missing production evidence env") &&
    productionEvidenceReportValidator.includes("artifact location mismatch") &&
    productionEvidenceReportValidator.includes("artifact validation mismatch") &&
    productionEvidenceReportValidator.includes("unsupported R2 content type") &&
    productionEvidenceReportValidator.includes("oversized R2 asset") &&
    productionEvidenceReportValidator.includes("skipped R2 negative checks") &&
    productionEvidenceReportValidator.includes("mismatched R2 bucket evidence") &&
    productionEvidenceReportValidator.includes("client-sourced R2 metadata") &&
    productionEvidenceReportValidator.includes("raw R2 lifecycle") &&
    productionEvidenceReportValidator.includes("missing R2 validation timestamp") &&
    productionEvidenceReportValidator.includes("missing R2 preview render") &&
    productionEvidenceReportValidator.includes("missing public hero render") &&
    productionEvidenceReportValidator.includes("missing station hero render") &&
    productionEvidenceReportValidator.includes("\"Public claim hero rendered\"") &&
    productionEvidenceReportValidator.includes("\"Station hero rendered\"") &&
    !productionEvidenceReportValidator.includes("Public/station hero rendered") &&
    productionEvidenceReportValidator.includes("non-json artifact path") &&
    productionEvidenceReportValidator.includes("generic artifact path") &&
    productionEvidenceReportValidator.includes("placeholder artifact path") &&
    productionEvidenceReportValidator.includes("placeholder convex url") &&
    productionEvidenceReportValidator.includes("placeholder site url") &&
    productionEvidenceReportValidator.includes("app origin with port") &&
    productionEvidenceReportValidator.includes("app origin with default port") &&
    productionEvidenceReportValidator.includes("convex cloud origin with port") &&
    productionEvidenceReportValidator.includes("convex site origin with port") &&
    productionEvidenceReportValidator.includes("localhost app origin") &&
    productionEvidenceReportValidator.includes("private app origin") &&
    productionEvidenceReportValidator.includes("raw public ipv4 app origin") &&
    productionEvidenceReportValidator.includes("raw ipv6 app origin") &&
    productionEvidenceReportValidator.includes("mismatched deployment app origin") &&
    productionEvidenceReportValidator.includes("mismatched deployment convex origin") &&
    productionEvidenceReportValidator.includes("mismatched convex site deployment") &&
    productionEvidenceReportValidator.includes("convex cloud origin leading hyphen") &&
    productionEvidenceReportValidator.includes("convex site origin trailing hyphen") &&
    productionEvidenceReportValidator.includes("mismatched google callback origin") &&
    productionEvidenceReportValidator.includes("wrong google callback path") &&
    productionEvidenceReportValidator.includes("google callback with default port") &&
    productionEvidenceReportValidator.includes("must be a clean endpoint URL") &&
    productionEvidenceReportValidator.includes("failed OAuth sign-in result") &&
    productionEvidenceReportValidator.includes("legacy owner session present") &&
    productionEvidenceReportValidator.includes("inactive campaign status") &&
    productionEvidenceReportValidator.includes("failed station session creation") &&
    productionEvidenceReportValidator.includes("failed redeem result") &&
    productionEvidenceReportValidator.includes("missing checkout return origin") &&
    productionEvidenceReportValidator.includes("mismatched checkout return origin") &&
    productionEvidenceReportValidator.includes("raw checkout return origin") &&
    productionEvidenceReportValidator.includes("checkout return origin with default port") &&
    productionEvidenceReportValidator.includes("unexpected checkout return query") &&
    productionEvidenceReportValidatorImportTest.includes("unexpected Polar checkout return query") &&
    productionEvidenceReportValidator.includes("mismatched customer portal return origin") &&
    productionEvidenceReportValidator.includes("raw customer portal return origin") &&
    productionEvidenceReportValidator.includes("unexpected customer portal return query") &&
    productionEvidenceReportValidatorImportTest.includes("unexpected Polar portal return query") &&
    productionEvidenceReportValidator.includes("failed polar checkout result") &&
    productionEvidenceReportValidator.includes("failed polar plan change result") &&
    productionEvidenceReportValidator.includes("failed polar customer portal result") &&
    productionEvidenceReportValidator.includes("inactive convex billing state") &&
    productionEvidenceReportValidator.includes("billing sync token still present") &&
    productionEvidenceReportValidator.includes("missing polar webhook url") &&
    productionEvidenceReportValidator.includes("mismatched polar webhook origin") &&
    productionEvidenceReportValidator.includes("wrong polar webhook path") &&
    productionEvidenceReportValidator.includes("polar webhook with default port") &&
    productionEvidenceReportValidator.includes("raw ops token") &&
    productionEvidenceReportValidator.includes("Ops token shape checked") &&
    productionEvidenceReportValidator.includes("ops token shape unchecked") &&
    productionEvidenceReportValidator.includes("missing evidence validator command") &&
    productionEvidenceReportValidator.includes("skipped expired public-code check") &&
	    productionEvidenceReportValidator.includes("local-only OAuth reload check") &&
	    productionEvidenceReportValidator.includes("failed owner backfill apply") &&
	    productionEvidenceReportValidator.includes("failed campaign backfill") &&
	    productionEvidenceReportValidator.includes("Campaign backfill rerun idempotent") &&
	    productionEvidenceReportValidator.includes("failed campaign rerun idempotency") &&
    productionEvidenceReportValidator.includes("migration token still present") &&
    productionEvidenceReportValidator.includes("temporary tokens still present") &&
    productionEvidenceReportValidator.includes("legacy flags still enabled") &&
    productionEvidenceReportValidator.includes("assertReviewedCleanupEvidence") &&
    productionEvidenceReportValidator.includes("assertSecretExposureCleanupEvidence") &&
    productionEvidenceReportValidator.includes("must record reviewed secret-exposure evidence") &&
    productionEvidenceReportValidatorImportTest.includes("bare secrets rotation not needed") &&
    productionEvidenceReportValidator.includes("LIXI_OPS_ADMIN_TOKEN") &&
    productionEvidenceReportValidator.includes("LI_XI_BILLING_ADMIN_TOKEN") &&
    productionEvidenceReportValidator.includes("LIXI_BILLING_ADMIN_TOKEN") &&
    productionEvidenceReportValidator.includes("LI_XI_ENABLE_LEGACY_AUTH") &&
    productionEvidenceReportValidator.includes("LEGACY_AUTH_ENABLED") &&
    productionEvidenceReportValidator.includes("LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    productionEvidenceReportValidator.includes("LEGACY_OWNER_BRIDGE_ENABLED") &&
    productionEvidenceReportValidator.includes("VITE_LI_XI_ENABLE_LEGACY_AUTH") &&
    productionEvidenceReportValidator.includes("VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    productionEvidenceReportValidator.includes("LI_XI_ENABLE_PAID_PLAN_FALLBACK") &&
    productionEvidenceReportValidator.includes("LIXI_ENABLE_PAID_PLAN_FALLBACK") &&
    productionEvidenceReportValidator.includes("test polar subscriptions not cleaned") &&
    productionEvidenceReportValidator.includes("secrets rotation unverified") &&
    productionEvidenceReportValidator.includes("assertFieldOneOf") &&
    productionEvidenceReportValidator.includes("productionReady not true") &&
    productionEvidenceReportValidator.includes("redaction metadata not present") &&
    productionEvidenceReportValidator.includes('normalized !== "skipped"') &&
    productionEvidenceReportValidator.includes('normalized !== "local only"') &&
    productionEvidenceReportValidator.includes("Cloudflare R2") &&
    productionEvidenceReportValidator.includes("Analytics And Backfill") &&
    productionEvidenceReportValidator.includes('result === "pass"') &&
    productionEvidenceReportValidator.includes('accepted === "yes"') &&
    productionEvidenceReportValidator.includes('remainingRisks === "none"') &&
    productionEvidenceReportValidator.includes("assertNonBlockingFollowUpEvidence") &&
    productionEvidenceReportValidator.includes("Follow-up tasks") &&
    productionEvidenceReportValidatorImportTest.includes("missing final follow-up tasks") &&
    productionEvidenceReportValidatorImportTest.includes("blocking final follow-up tasks") &&
    productionEvidenceReportValidator.includes('assertConcreteEvidenceValue("Final Decision", finalBody, "Approver")') &&
    productionEvidenceReportValidatorImportTest.includes("boolean final approver evidence") &&
    productionEvidenceReportValidatorImportTest.includes("placeholder final approver evidence") &&
    productionEvidenceReportValidatorImportTest.includes("URL final approver evidence") &&
    productionEvidenceReportValidator.includes("production evidence report validator self-tests passed"),
  "production evidence report validator must require filled live evidence sections, PASS results, final acceptance, and no remaining risks"
);
assert(
  viteConfig.includes('envPrefix: "VITE_"') &&
    viteConfig.includes('import { tanstackStart } from "@tanstack/react-start/plugin/vite"') &&
    viteConfig.includes('import { nitro } from "nitro/vite"') &&
    viteConfig.includes("tailwindcss()") &&
    viteConfig.includes("tanstackStart({") &&
    viteConfig.includes('srcDirectory: "."') &&
    viteConfig.includes('routesDirectory: "app"') &&
    viteConfig.includes("routeFileIgnorePattern") &&
    viteConfig.includes("(^|/)(components|fortune|templates)(/|$)") &&
    viteConfig.includes("(^|/)(ConvexClientProvider|CssDebugger|FortuneStage|hostUtils)(\\\\.|$)") &&
    viteConfig.includes('dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]') &&
    viteConfig.includes("viteReact()") &&
    viteConfig.includes("nitro()") &&
    !viteConfig.includes("NEXT_PUBLIC_") &&
    viteEnv.includes("readonly VITE_CONVEX_URL?: string") &&
    viteEnv.includes("readonly VITE_SITE_URL?: string") &&
    !viteEnv.includes("NEXT_PUBLIC_") &&
    !viteEnv.includes("VITE_CONVEX_SITE_URL"),
  "Vite/TanStack runtime must expose only VITE_ public env types and prefixes"
);
const rootRoute = read("app/__root.tsx");
const routerConfig = read("router.tsx");
assert(
  rootRoute.includes("createRootRoute") &&
    rootRoute.includes("HeadContent") &&
    rootRoute.includes("Outlet") &&
    rootRoute.includes("Scripts") &&
    rootRoute.includes("Prize Draw Campaign Studio") &&
    rootRoute.includes("SaaS prize-draw platform") &&
    !rootRoute.includes("Ứng dụng rút lì xì với ngân sách theo số lượng tờ") &&
    !rootRoute.includes('import appCss from "./globals.css?url"') &&
    read("app/styles/base.css").includes('@import "tailwindcss"') &&
    read("app/styles/admin.css").includes('@import "./base.css"') &&
    read("app/styles/admin.css").includes('@import "@heroui/styles"') &&
    read("app/styles/draw.css").includes("--color-gold-shine") &&
    read("app/draw/templates/registry.ts").includes('import drawCss from "@/app/styles/draw.css?url"') &&
    read("app/draw/templates/registry.ts").includes('cssHref: drawCss') &&
    rootRoute.includes("<ConvexClientProvider>") &&
    rootRoute.includes("<Outlet />") &&
    routerConfig.includes('import { createRouter } from "@tanstack/react-router"') &&
    routerConfig.includes('import { routeTree } from "./routeTree.gen"') &&
    routerConfig.includes("createRouter({") &&
    routerConfig.includes("routeTree") &&
    routerConfig.includes("scrollRestoration: true") &&
    routerConfig.includes('declare module "@tanstack/react-router"'),
  "TanStack Start root/router must follow the App Router migration shape with __root, HeadContent/Scripts, generated routeTree, and typed router registration"
);
assert(!("next" in allDependencies), "Next.js package must not remain installed");
assert(!("postcss" in allDependencies), "PostCSS must not remain a direct dependency after moving Tailwind to the Vite plugin");
assert(
  "@tanstack/react-router" in allDependencies &&
    "@tanstack/react-start" in allDependencies &&
    "@vitejs/plugin-react" in allDependencies &&
    "@tailwindcss/vite" in allDependencies &&
    "vite" in allDependencies &&
    "nitro" in allDependencies,
  "TanStack Start migration dependencies must remain installed"
);
assert(
  !lockfilePackages.some(
    (packagePath) =>
      packagePath === "node_modules/next" ||
      packagePath.startsWith("node_modules/next/") ||
      packagePath === "node_modules/@next" ||
      packagePath.startsWith("node_modules/@next/")
  ),
  "package-lock.json must not retain Next.js packages after the TanStack Start migration"
);
assert(
  !lockfilePackages.includes("node_modules/@tailwindcss/postcss"),
  "package-lock.json must not retain the removed Tailwind PostCSS plugin"
);
assert(
  !read(".gitignore").includes(".next") &&
    !read(".gitignore").includes("next-env.d.ts") &&
    !read("eslint.config.mjs").includes(".next"),
  "Next.js build/type artifacts must not stay hidden by gitignore or ESLint ignores"
);
assert(
  read(".gitignore").includes("li-xi-production-readiness*.json") &&
    read(".gitignore").includes("/production-evidence/"),
  "generated production readiness evidence artifacts must stay ignored by default"
);
const smokeRoutes = read("scripts/smoke-routes.mjs");
assert(
    smokeRoutes.includes('path: "/setup"') &&
    smokeRoutes.includes('path: "/draw"') &&
    smokeRoutes.includes('path: "/campaigns"') &&
    smokeRoutes.includes('path: "/claim/abcdefabcdefabcdefabcdef"') &&
    smokeRoutes.includes('path: "/claim/not-a-code"') &&
    !smokeRoutes.includes('path: "/claim/test-code"') &&
    smokeRoutes.includes('path: "/leaderboard"') &&
    smokeRoutes.includes("Đang mở trạm") &&
    smokeRoutes.includes("Loading setup") &&
    smokeRoutes.includes("ĐANG TẢI TRẠM RÚT") &&
    smokeRoutes.includes("Đang tải Campaign Studio") &&
    smokeRoutes.includes("Đang kiểm tra link rút") &&
    smokeRoutes.includes("Link không hợp lệ") &&
    smokeRoutes.includes("Loading leaderboard"),
  "route smoke coverage must include route-specific root, host, campaign, public-claim, malformed public-claim, and leaderboard shells"
);

for (const removedNextFile of [
  "next.config.ts",
  "next.config.mjs",
  "next-env.d.ts",
  "postcss.config.mjs",
  "app/layout.tsx",
  "app/page.tsx",
  "app/auth/page.tsx",
  "app/setup/page.tsx",
  "app/draw/page.tsx",
  "app/leaderboard/page.tsx",
]) {
  assertFileMissing(removedNextFile);
}
const nextAppRouterConventionFiles = walk("app", (file) =>
  ["page.tsx", "page.jsx", "layout.tsx", "layout.jsx", "route.ts", "route.js"].includes(
    path.basename(file)
  )
);
assert(
  nextAppRouterConventionFiles.length === 0,
  `app/ must not contain Next App Router convention files after TanStack migration: ${nextAppRouterConventionFiles.join(", ")}`
);
for (const removedNextStarterAsset of [
  "public/file.svg",
  "public/globe.svg",
  "public/next.svg",
  "public/vercel.svg",
  "public/window.svg",
]) {
  assertFileMissing(removedNextStarterAsset);
}

for (const tanstackFile of [
  "vite.config.ts",
  "router.tsx",
  "routeTree.gen.ts",
  "app/__root.tsx",
  "app/index.tsx",
  "app/auth.tsx",
  "app/setup.tsx",
  "app/draw.tsx",
  "app/campaigns.tsx",
  "app/leaderboard.tsx",
  "app/claim/$publicCode.tsx",
]) {
  assertFileExists(tanstackFile);
}
const routeTreeSource = read("routeTree.gen.ts");
assert(
  routeTreeSource.includes("import { Route as DrawRouteImport } from './app/draw'") &&
    routeTreeSource.includes("import { Route as ClaimPublicCodeRouteImport } from './app/claim/$publicCode'") &&
    !routeTreeSource.includes("./app/draw/FortuneStage") &&
    !routeTreeSource.includes("./app/draw/components/") &&
    !routeTreeSource.includes("./app/draw/fortune/") &&
    !routeTreeSource.includes("./app/components/"),
  "generated TanStack route tree must include only route files, not nested helper components under app/"
);

const indexRoute = read("app/index.tsx");
assert(
  indexRoute.includes("api.setup.getSetupState") &&
    indexRoute.includes('to: "/auth"') &&
    indexRoute.includes('setupState.hasSetup ? "/campaigns" : "/setup"') &&
    indexRoute.includes("Đang mở trạm") &&
    !indexRoute.includes("Premium Gacha Experience") &&
    !indexRoute.includes("Lunar Fortune"),
  "root route must be a SaaS app-flow gateway into setup or Campaign Studio, not a marketing landing page"
);

const hostRouteGuard = read("lib/hostRouteGuard.ts");
const hostRouteAuthPolicy = read("lib/hostRouteAuthPolicy.ts");
const hostOnlyRouteFiles = [
  "app/index.tsx",
  "app/setup.tsx",
  "app/draw.tsx",
  "app/campaigns.tsx",
  "app/leaderboard.tsx",
];
const appTsxFiles = walk("app", (file) => file.endsWith(".tsx"));
assert(
  hostRouteGuard.includes("export function requireHostRouteAuth") &&
  hostRouteGuard.includes("throw redirect({") &&
    hostRouteGuard.includes('to: "/auth"') &&
    hostRouteGuard.includes("shouldAllowHostRoute") &&
    hostRouteAuthPolicy.includes("export function shouldAllowHostRoute") &&
    hostRouteAuthPolicy.includes("export function hasConvexAuthSessionInStorage") &&
    hostRouteAuthPolicy.includes("export function convexAuthStorageNamespace") &&
    hostRouteGuard.includes('isBrowser: typeof window !== "undefined"') &&
    hostRouteAuthPolicy.includes("Convex Auth stores the browser session client-side") &&
    hostRouteGuard.includes("shouldAllowHostRoute({") &&
    !hostRouteGuard.includes("function hasStoredConvexAuthSession") &&
    hostRouteAuthPolicy.includes("__convexAuthJWT") &&
    hostRouteAuthPolicy.includes("__convexAuthRefreshToken") &&
    !hostRouteGuard.includes("VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    !hostRouteAuthPolicy.includes("VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    !hostRouteGuard.includes("VITE_LI_XI_ENABLE_LEGACY_AUTH") &&
    !hostRouteGuard.includes("readOwnerSession") &&
    hostRouteGuardTest.includes("hasConvexAuthSessionInStorage") &&
    hostRouteGuardTest.includes("shouldAllowHostRoute") &&
    hostRouteGuardTest.includes("missing VITE_CONVEX_URL should fail closed") &&
    hostRouteGuardTest.includes("Convex Auth session should allow host routes") &&
    hostRouteGuardTest.includes("stale legacy owner session should not allow host routes") &&
    hostRouteGuardTest.includes("host routes should redirect without Convex Auth"),
  "host route guard must support tested Convex Auth token presence without accepting legacy owner sessions"
);
for (const routeFile of hostOnlyRouteFiles) {
  const routeSource = read(routeFile);
  assert(
    routeSource.includes("beforeLoad: requireHostRouteAuth") &&
      routeSource.includes("useOwnerSession()") &&
      routeSource.includes('"skip"') &&
      routeSource.includes('to: "/auth"'),
    `${routeFile} must use a TanStack beforeLoad host guard while preserving live owner-session validation and query skipping`
  );
}
assert(
  !read("app/auth.tsx").includes("beforeLoad: requireHostRouteAuth") &&
    !read("app/claim/$publicCode.tsx").includes("beforeLoad: requireHostRouteAuth"),
  "auth and public claim routes must remain public"
);

const appAndLibFiles = [
  ...walk("app", (file) => /\.(tsx?|jsx?)$/.test(file)),
  ...walk("lib", (file) => /\.(tsx?|jsx?)$/.test(file)),
];
const convexAndLibRuntimeFiles = [
  ...walk("convex", (file) => /\.(tsx?|jsx?)$/.test(file)),
  ...walk("lib", (file) => /\.(tsx?|jsx?)$/.test(file)),
];
for (const file of convexAndLibRuntimeFiles) {
  const source = read(file);
  const disallowedTsImports = [...source.matchAll(/from\s+["']([^"']+\.ts)["']/g)]
    .map((match) => match[1])
    .filter((specifier) => !specifier.endsWith("/networkPolicy.ts") && specifier !== "./networkPolicy.ts");
  assert(
    disallowedTsImports.length === 0,
    `${file} must avoid .ts import specifiers except the shared network policy used by Node ESM contract tests`
  );
}
assertNoPatternInFiles(
  appAndLibFiles,
  /from\s+["']next(?:\/|["'])|import\s+["']next(?:\/|["'])/,
  "Next.js imports must not be used after TanStack Start migration"
);
assertNoPatternInFiles(
  appAndLibFiles,
  /NEXT_PUBLIC_CONVEX_URL/,
  "TanStack runtime must use VITE_CONVEX_URL instead of the legacy Next public Convex env"
);
assert(
  !read("scripts/smoke-routes.mjs").includes("NEXT_PUBLIC_CONVEX_URL"),
  "route smoke harness must not keep the legacy Next public Convex env fallback"
);
assert(
  read("scripts/smoke-routes.mjs").includes("VITE_SITE_URL: smokeSiteUrl"),
  "route smoke harness must provide deterministic VITE_SITE_URL for production builds"
);
if (existsSync(path.join(root, ".env.local"))) {
  const envLocal = read(".env.local");
  assert(!envLocal.includes("NEXT_PUBLIC_"), ".env.local must not contain stale Next public env names");
  assert(envLocal.includes("VITE_CONVEX_URL="), ".env.local must use VITE_CONVEX_URL for local Convex config");
  assert(!envLocal.includes("VITE_SITE_URL="), ".env.local must let local dev use browser origin fallback");
}
assertNoPatternInFiles(
  appAndLibFiles,
  /emerald-\d+/,
  "UI status colors must stay within the red/gold/black design system palette"
);
assertNoPatternInFiles(
  appAndLibFiles,
  /#c8ffda|#ffc7a0|rgba\(124,\s*214|rgba\(8,\s*84|rgba\(255,\s*154,\s*96|rgba\(86,\s*29,\s*6/,
  "Host/setup status banners must not introduce green or orange palettes outside the design system"
);
const leaderboardRoute = read("app/leaderboard.tsx");
assert(
  leaderboardRoute.includes('import adminCss from "./styles/admin.css?url"') &&
    leaderboardRoute.includes("AdminPageShell") &&
    leaderboardRoute.includes("Chip color={getRarityStatus(item.rarity)}") &&
    !leaderboardRoute.includes("text-gold-shine/78") &&
    !leaderboardRoute.includes("text-red-vivid") &&
    !leaderboardRoute.includes("text-gold-shine bg-gold-base/22"),
  "leaderboard route must use HeroUI admin shell and semantic rarity chips instead of the Lunar draw palette"
);
assert(
  leaderboardRoute.includes("api.campaigns.getWorkspace") &&
    leaderboardRoute.includes("selectedCampaignId") &&
    leaderboardRoute.includes("api.leaderboard.getCampaignLeaderboard") &&
    leaderboardRoute.includes("api.leaderboard.getCampaignHistory") &&
    leaderboardRoute.includes("Tabs") &&
    leaderboardRoute.includes("onSelectionChange") &&
    leaderboardRoute.includes("setSelectedCampaignId(") &&
    leaderboardRoute.includes("All campaigns") &&
    leaderboardRoute.includes("Top giá trị thưởng") &&
    leaderboardRoute.includes("Chưa có lượt nhận thưởng nào.") &&
    leaderboardRoute.includes("Chiến dịch chưa xác định") &&
    leaderboardRoute.includes("envelopeIndex + 1") &&
    leaderboardRoute.includes("Lịch sử gần đây") &&
    !leaderboardRoute.includes("Top theo số tiền") &&
    !leaderboardRoute.includes("Chưa có lượt rút nào.") &&
    !leaderboardRoute.includes("Legacy campaign"),
  "leaderboard route must expose owner-wide and campaign-scoped SaaS analytics views without one-off legacy copy"
);
const hostShell = read("app/draw/components/HostShell.tsx");
assert(
  hostShell.includes("var(--color-red-vivid)") &&
    hostShell.includes("var(--color-gold-shine)") &&
    !hostShell.includes("#ff4500"),
  "host shell ambient lights must use design-system red/gold tokens"
);
const envelopeCard = read("app/draw/fortune/EnvelopeCard.tsx");
assert(
  envelopeCard.includes("from-gold-shine to-gold-base/35") &&
    envelopeCard.includes("from-gold-shine to-red-vivid/12") &&
    envelopeCard.includes("from-red-deep/90 to-black-ink") &&
    !envelopeCard.includes("#ef9a9a") &&
    !envelopeCard.includes("#ffebee") &&
    !envelopeCard.includes("#8a6e1e") &&
    !envelopeCard.includes("text-[#888]"),
  "envelope ticket states must use design-system red/gold/black palette"
);

const convexConfig = read("convex/convex.config.ts");
for (const component of ["aggregate", "shardedCounter", "r2", "polar"]) {
  assert(
    convexConfig.includes(`app.use(${component})`),
    `convex.config.ts must register ${component}`
  );
}

const authConfig = read("convex/auth.ts");
assert(authConfig.includes("convexAuth"), "Convex Auth must be configured");
assert(authConfig.includes("Google"), "Google OAuth provider must be configured");
const convexAuthConfig = read("convex/auth.config.ts");
assert(
  convexAuthConfig.includes("domain: process.env.CONVEX_SITE_URL!") &&
    !convexAuthConfig.includes("localhost") &&
    !convexAuthConfig.includes("http://") &&
    !convexAuthConfig.includes("NEXT_PUBLIC"),
  "Convex Auth callback domain must come from CONVEX_SITE_URL without local or Next.js fallbacks"
);
assert(
  authConfig.includes("export const getCurrentUser") &&
    !authConfig.includes("export const getUser"),
  "auth.ts must expose only the current authenticated user, not arbitrary user lookups"
);
const currentUserQuery = section(
  authConfig,
  "export const getCurrentUser",
  "export const getCurrentBillingIdentity"
);
const billingIdentityQuery = section(
  authConfig,
  "export const getCurrentBillingIdentity",
  "export const ensureCurrentHostProfile"
);
const ensureCurrentHostProfileMutation = section(
  authConfig,
  "export const ensureCurrentHostProfile",
  "export const setHostPin"
);
const setHostPinMutation = tailSection(authConfig, "export const setHostPin");
assert(
  authConfig.includes("export const ensureCurrentHostProfile") &&
    authConfig.includes("ensureHostProfileForOwner(ctx, user)") &&
    authConfig.includes("Cần đăng nhập Google để khởi tạo hồ sơ host"),
  "Google OAuth sessions must be able to materialize a hostProfile before host routing"
);
assert(
  billingIdentityQuery.includes("export const getCurrentBillingIdentity = internalQuery") &&
    billingIdentityQuery.includes("userId: user._id") &&
    billingIdentityQuery.includes("email: user.email ?? null"),
  "billing identity must stay on an internal Convex query instead of the public current-user surface"
);
for (const [sectionName, authSurface] of [
  ["getCurrentUser", currentUserQuery],
  ["ensureCurrentHostProfile", ensureCurrentHostProfileMutation],
]) {
  assert(
    authSurface.includes("getAuthUserId(ctx)") &&
      authSurface.includes("hostProfile") &&
      authSurface.includes("hasHostPin") &&
      !authSurface.includes("pinHash:") &&
      !authSurface.includes("pinSalt:") &&
      !authSurface.includes("pin:"),
    `${sectionName} must resolve the current Convex Auth user and return only host profile metadata, not PIN credentials`
  );
}
assert(
  currentUserQuery.includes("username: displayName") &&
    currentUserQuery.includes("hostProfile") &&
    currentUserQuery.includes("hasHostPin") &&
    !currentUserQuery.includes("userId: user._id") &&
    !currentUserQuery.includes("email: user.email") &&
    !currentUserQuery.includes("image: user.image") &&
    !currentUserQuery.includes("createdAt: user.createdAt") &&
    !currentUserQuery.includes("updatedAt: user.updatedAt") &&
    !currentUserQuery.includes("_creationTime: user._creationTime") &&
    !currentUserQuery.includes("emailVerificationTime: user.emailVerificationTime"),
  "public getCurrentUser must not return raw Convex user id, email, image, or timestamps"
);
assert(
  ensureCurrentHostProfileMutation.includes("hostProfile") &&
    ensureCurrentHostProfileMutation.includes("hasHostPin") &&
    !ensureCurrentHostProfileMutation.includes("userId: user._id") &&
    !ensureCurrentHostProfileMutation.includes("username: profile.displayName") &&
    !ensureCurrentHostProfileMutation.includes("email: user.email") &&
    !ensureCurrentHostProfileMutation.includes("image: user.image") &&
    !ensureCurrentHostProfileMutation.includes("createdAt: user.createdAt") &&
    !ensureCurrentHostProfileMutation.includes("updatedAt: user.updatedAt") &&
    !ensureCurrentHostProfileMutation.includes("_creationTime: user._creationTime") &&
    !ensureCurrentHostProfileMutation.includes("emailVerificationTime: user.emailVerificationTime"),
  "OAuth host-profile materialization must not return raw Convex user id, email, image, or timestamps"
);
assert(
  setHostPinMutation.includes("getAuthUserId(ctx)") &&
    setHostPinMutation.includes("validatePin(args.pin)") &&
    setHostPinMutation.includes("const { hash, salt } = await createPinHash(pin)") &&
    setHostPinMutation.includes("pinHash: hash") &&
    setHostPinMutation.includes("pinSalt: salt") &&
    !setHostPinMutation.includes("pin: pin") &&
    !setHostPinMutation.includes("pin: args.pin"),
  "setHostPin must require Convex Auth and store only hashed PIN credentials"
);
assert(
  setHostPinMutation.includes("hostProfile") &&
    setHostPinMutation.includes("hasHostPin: true") &&
    !setHostPinMutation.includes("userId: user._id") &&
    !setHostPinMutation.includes("username: profile.displayName") &&
    !setHostPinMutation.includes("email: user.email") &&
    !setHostPinMutation.includes("image: user.image") &&
    !setHostPinMutation.includes("updatedAt: user.updatedAt") &&
    !setHostPinMutation.includes("_creationTime: user._creationTime") &&
    !setHostPinMutation.includes("emailVerificationTime: user.emailVerificationTime"),
  "setHostPin must return only sanitized host profile metadata and PIN readiness"
);
assert(
  authConfig.includes("isLegacyAccountAuthEnabled() && isLegacyOwnerBridgeEnabled()") &&
    authConfig.includes("account auth và owner bridge migration"),
  "legacy account mutations must require both the legacy account flag and owner bridge migration flag"
);
const legacyLogin = section(authConfig, "export const login", "export const getCurrentUser");
assert(
  legacyLogin.includes("assertLegacyAccountAuthEnabled();") &&
    legacyLogin.includes("ensureHostProfileForOwner(ctx, user") &&
    legacyLogin.includes("username: profile.displayName"),
  "legacy login must stay env-gated and promote legacy users into hostProfiles"
);

const httpConfig = read("convex/http.ts");
assert(httpConfig.includes("auth.addHttpRoutes(http)"), "Convex Auth HTTP routes must be registered");
assert(
  httpConfig.includes("polarWebhookPath") &&
    httpConfig.includes("polar.registerRoutes(http, { path: polarWebhookPath })"),
  "Polar HTTP routes must be registered on the explicit shared webhook path"
);
const polarClient = read("convex/polarClient.ts");
assert(
  polarClient.includes("configuredPolarServer") &&
    polarClient.includes("resolvedPolarServer") &&
    polarClient.includes("process.env.POLAR_SERVER") &&
    polarClient.includes("normalizeConfiguredPolarServer(process.env.POLAR_SERVER)") &&
    polarClient.includes("return resolvePolarServer(process.env.POLAR_SERVER)") &&
    polarClient.includes("server: resolvedPolarServer()") &&
    polarServerPolicy.includes('export type PolarServer = "sandbox" | "production"') &&
    polarServerPolicy.includes("export function normalizeConfiguredPolarServer") &&
    polarServerPolicy.includes("export function resolvePolarServer") &&
    polarServerPolicy.includes('configuredServer === "sandbox" || configuredServer === "production"') &&
    polarServerPolicy.includes("POLAR_SERVER phải là sandbox hoặc production") &&
    polarServerPolicyTest.includes("POLAR_SERVER typos should fail closed instead of silently downgrading to sandbox") &&
    polarServerPolicyTest.includes("POLAR_SERVER should be explicit and case-sensitive"),
  "Polar client must centralize strict server selection instead of silently relying on the component default or downgrading typos to sandbox"
);
assert(
  polarClient.includes("function configuredPolarProductId") &&
    polarClient.includes("process.env[primaryName]") &&
    polarClient.includes("process.env[legacyName]") &&
    polarClient.includes(".trim()") &&
    polarClient.includes('configuredPolarProductId("POLAR_PRO_PRODUCT_ID", "LI_XI_POLAR_PRO_PRODUCT_ID")') &&
    polarClient.includes('"POLAR_BUSINESS_PRODUCT_ID"') &&
    polarClient.includes('"LI_XI_POLAR_BUSINESS_PRODUCT_ID"'),
  "Polar product IDs must be normalized from canonical and legacy env names before use"
);
assert(
  polarClient.includes("configuredPolarWebhookSecret") &&
    polarClient.includes("process.env.POLAR_WEBHOOK_SECRET") &&
    polarClient.includes("webhookSecret: configuredPolarWebhookSecret()"),
  "Polar client must bind the webhook verification secret explicitly"
);

const billing = read("convex/billing.ts");
const billingPolicy = read("lib/billingPolicy.ts");
const billingActionSections = [
  section(billing, "export const changeCurrentSubscription", "export const generateCheckoutLink"),
  section(billing, "export const generateCheckoutLink", "export const generateCustomerPortalUrl"),
  section(billing, "export const generateCustomerPortalUrl", "export const syncPolarProducts"),
];
for (const exportedBillingApi of [
  "changeCurrentSubscription",
  "getConfiguredProducts",
  "generateCheckoutLink",
  "generateCustomerPortalUrl",
]) {
  assert(
    billing.includes(exportedBillingApi),
    `billing.ts must export ${exportedBillingApi}`
  );
}
assert(
  !billing.includes("cancelCurrentSubscription") && !billing.includes("getBillingUser"),
  "billing.ts must not export unused billing lifecycle APIs"
);
assert(
  !/export const\s*\{[\s\S]*(changeCurrentSubscription|generateCheckoutLink|generateCustomerPortalUrl)[\s\S]*\}\s*=\s*polar\.api\(\)/.test(
    billing
  ),
  "billing checkout, subscription changes, and customer portal must not be direct Polar API pass-through exports"
);
assert(
  !billing.includes("export const generateCustomerPortalUrl = billingApi.generateCustomerPortalUrl"),
  "billing customer portal must validate returnUrl instead of direct Polar API pass-through export"
);
assert(
  billing.includes("export const getConfiguredProducts = query") &&
    billing.includes("getAuthUserId(ctx)") &&
    billing.includes("Cần đăng nhập để xem gói Polar") &&
    billing.includes("assertCompleteBillingProductConfiguration(polarProducts)") &&
    billing.includes("if (!pro || !business)") &&
    billing.includes("polar.listProducts(ctx)") &&
    !billing.includes("export const getConfiguredProducts = billingApi.getConfiguredProducts"),
  "billing configured product catalog must be backend auth-gated and fail closed unless both configured Polar products are synced"
);
assert(
  billing.includes("async function getBillingIdentity") &&
    billing.includes("const user = await ctx.runQuery(internal.auth.getCurrentBillingIdentity)") &&
    billing.includes("user.userId") &&
    billing.includes("user.email") &&
    !billing.includes("api.auth.getCurrentUser") &&
    billingActionSections.every((billingAction) => billingAction.includes("getBillingIdentity(ctx)")) &&
    !billing.includes("ownerId: v.optional") &&
    !billing.includes("ownerId: v.id") &&
    !billing.includes("args.ownerId"),
  "billing user-scoped surfaces must derive identity from the current Convex Auth user and never accept client-supplied ownerId"
);
assert(
  billing.includes("polarProducts") &&
    billing.includes("async function requireSyncedConfiguredBillingProducts") &&
    billing.includes("configuredBillingProductIds(polarProducts)") &&
    billing.includes("const syncedProducts = await polar.listProducts(ctx)") &&
    billing.includes("new Set(syncedProducts.map((product) => product.id))") &&
    billing.includes("Polar product chưa được sync vào Convex") &&
    billing.includes("assertConfiguredBillingProductId") &&
    billing.includes("assertConfiguredBillingProductId(args.productId, polarProducts)") &&
    billing.includes("assertConfiguredCheckoutProductIds") &&
    billing.includes("assertConfiguredCheckoutProductIds(args.productIds, polarProducts)") &&
    billingPolicy.includes("assertCompleteBillingProductConfiguration") &&
    billingPolicy.includes("function cleanConfiguredBillingProductId") &&
    billingPolicy.includes("cleanConfiguredBillingProductId(productId)") &&
    billingPolicy.includes("Cần cấu hình đủ Polar Pro và Business product IDs") &&
    billingPolicy.includes("Polar Pro và Business product IDs phải khác nhau") &&
    billingPolicyTest.includes("Polar product không thuộc cấu hình") &&
    billingPolicyTest.includes("Checkout chỉ hỗ trợ một gói") &&
    billingPolicyTest.includes("blank configured Polar product ids should fail after trimming") &&
    billingPolicyTest.includes("configured Polar product ids with whitespace should fail closed") &&
    billing.includes("polar.changeSubscription(ctx") &&
    billing.includes("polar.createCheckoutSession(ctx"),
  "billing checkout and subscription changes must enforce complete, distinct configured Pro/Business product allowlists and synced Polar catalog presence"
);
const changeSubscriptionAction = section(
  billing,
  "export const changeCurrentSubscription",
  "export const generateCheckoutLink"
);
assert(
  changeSubscriptionAction.includes("await getBillingIdentity(ctx)") &&
    changeSubscriptionAction.indexOf("await getBillingIdentity(ctx)") <
      changeSubscriptionAction.indexOf("polar.changeSubscription(ctx") &&
    changeSubscriptionAction.includes("assertConfiguredBillingProductId(args.productId, polarProducts)") &&
    changeSubscriptionAction.includes("getCurrentPolarSubscription(ctx, userId)") &&
    changeSubscriptionAction.includes("hasChangeableSubscription(subscription)") &&
    changeSubscriptionAction.includes("Không tìm thấy subscription Polar đang hoạt động để đổi gói") &&
    changeSubscriptionAction.includes("subscription.productId === productId") &&
    changeSubscriptionAction.includes("Subscription Polar đã dùng gói này") &&
    changeSubscriptionAction.includes("await requireSyncedConfiguredBillingProducts(ctx)") &&
    changeSubscriptionAction.indexOf("await requireSyncedConfiguredBillingProducts(ctx)") <
      changeSubscriptionAction.indexOf("polar.changeSubscription(ctx"),
  "billing subscription changes must authenticate the current Convex Auth billing identity and require a changeable existing Polar subscription before touching Polar"
);
assert(
  billing.includes("process.env.SITE_URL") &&
    billing.includes("assertTrustedBillingOrigin(args.origin, process.env.SITE_URL)") &&
    billing.includes('assertTrustedBillingUrl(\n      args.successUrl,\n      "Billing successUrl",\n      process.env.SITE_URL') &&
    billing.includes('assertTrustedBillingUrl(args.returnUrl, "Billing returnUrl", process.env.SITE_URL)') &&
    billing.includes("getDefaultBillingReturnUrl(process.env.SITE_URL)") &&
    billingPolicy.includes('from "./networkPolicy.ts"') &&
    billingPolicy.includes("export function getConfiguredSiteOrigin") &&
    billingPolicy.includes("export function parseCleanOrigin") &&
    !billingPolicy.includes("export function isLocalOrPrivateHostname") &&
    !billingPolicy.includes("export function isRawIpHostname") &&
    billingPolicy.includes('url.protocol === "https:"') &&
    billingPolicy.includes('url.port === ""') &&
    !billingPolicy.includes('url.protocol === "http:"') &&
    billingPolicy.includes("normalizedInput === `${normalizedOrigin}/`") &&
    billingPolicy.includes("!isRawIpHostname(url.hostname)") &&
    billingPolicy.includes("!isLocalOrPrivateHostname(url.hostname)") &&
    billingPolicy.includes("phải là HTTPS public origin không kèm path/query/hash/port/credentials") &&
    billingPolicy.includes("const isTrustedWebUrl") &&
    billingPolicy.includes("const trimmedUrl = url.trim()") &&
    billingPolicy.includes("trimmedUrl !== requestedUrl.toString()") &&
    billingPolicy.includes("phải là URL canonical không kèm explicit default port") &&
    billingPolicy.includes('requestedUrl.protocol === "https:"') &&
    !billingPolicy.includes('requestedUrl.protocol === "http:"') &&
    billingPolicy.includes('requestedUrl.username === ""') &&
    billingPolicy.includes('requestedUrl.password === ""') &&
    billingPolicy.includes('requestedUrl.port === ""') &&
    billingPolicy.includes('requestedUrl.hash === ""') &&
    billingPolicy.includes("!isRawIpHostname(requestedUrl.hostname)") &&
    billingPolicy.includes("!isLocalOrPrivateHostname(requestedUrl.hostname)") &&
    billingPolicy.includes("phải là HTTPS public URL không kèm port/credentials/hash") &&
    billingPolicy.includes("const billingReturnPath = \"/campaigns\"") &&
    billingPolicy.includes("allowedBillingReturnPaths") &&
    billingPolicy.includes("allowedCheckoutResultValues") &&
    billingPolicy.includes("!allowedBillingReturnPaths.has(requestedUrl.pathname)") &&
    billingPolicy.includes("phải quay về route billing hợp lệ") &&
    billingPolicy.includes("searchEntries.length === 0") &&
    billingPolicy.includes('searchEntries[0][0] === "checkout"') &&
    billingPolicy.includes("chỉ được dùng query billing hợp lệ") &&
    billingPolicy.includes("export function normalizeBillingLocale") &&
    billingPolicy.includes("export function assertTrustedPolarCheckoutUrl") &&
    billingPolicy.includes("Polar checkout URL phải là HTTPS public URL không kèm port/credentials/hash") &&
    billingPolicy.includes("Billing locale không hợp lệ") &&
    billingPolicyTest.includes("Billing origin không khớp SITE_URL") &&
    billingPolicyTest.includes("assertTrustedPolarCheckoutUrl") &&
    billingPolicyTest.includes("Polar checkout URL returned to the browser should never downgrade to HTTP") &&
    billingPolicyTest.includes("Polar checkout URL returned to the browser should not include embedded credentials") &&
    billingPolicyTest.includes("Polar checkout URL returned to the browser should not point at local hosts") &&
    billingPolicyTest.includes("Polar checkout URL returned to the browser should not use raw IP hosts") &&
    billingPolicyTest.includes("billing origins should reject explicit default ports before sending URLs to Polar") &&
    billingPolicyTest.includes("billing redirects should be constrained to the Campaign Studio billing return route") &&
    billingPolicyTest.includes("billing redirects should reject explicit default ports before sending URLs to Polar") &&
    billingPolicyTest.includes("billing redirects should reject fragments before sending URLs to Polar") &&
    billingPolicyTest.includes("billing redirects should not carry arbitrary query params to or from Polar") &&
    billingPolicyTest.includes("billing checkout result query should be constrained to known values") &&
    billingPolicyTest.includes("billing redirects should not mix allowed checkout result with extra params") &&
    billingPolicyTest.includes("https://100.64.0.1/campaigns") &&
    billingPolicyTest.includes("https://[fd00::1]/campaigns") &&
    billingPolicyTest.includes("https://8.8.8.8/campaigns") &&
    billingPolicyTest.includes("https://[2606:4700:4700::1111]/campaigns") &&
    billingPolicyTest.includes("vi-vn") &&
    billing.includes("polar.createCustomerPortalSession(ctx"),
  "billing checkout and customer portal URLs must be validated against a clean SITE_URL origin"
);
const checkoutLinkAction = section(
  billing,
  "export const generateCheckoutLink",
  "export const generateCustomerPortalUrl"
);
assert(
  !checkoutLinkAction.includes("metadata") &&
    !checkoutLinkAction.includes("trialInterval") &&
    !checkoutLinkAction.includes("subscriptionId") &&
    checkoutLinkAction.includes("getCurrentPolarSubscription(ctx, userId)") &&
    checkoutLinkAction.includes("hasCheckoutBlockingSubscription(subscription)") &&
    billing.includes('const CHECKOUT_BLOCKING_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"])') &&
    checkoutLinkAction.includes("Tài khoản đã có subscription Polar") &&
    checkoutLinkAction.includes("await requireSyncedConfiguredBillingProducts(ctx)") &&
    checkoutLinkAction.indexOf("await requireSyncedConfiguredBillingProducts(ctx)") <
      checkoutLinkAction.indexOf("polar.createCheckoutSession(ctx") &&
    checkoutLinkAction.includes("assertTrustedPolarCheckoutUrl(baseUrl)") &&
    checkoutLinkAction.includes("const locale = normalizeBillingLocale(args.locale)") &&
    checkoutLinkAction.includes('checkoutUrl.searchParams.set("locale", locale)'),
  "billing checkout must not pass arbitrary Polar metadata, trial, subscription overrides, or unvalidated locale from public args"
);
const customerPortalAction = section(
  billing,
  "export const generateCustomerPortalUrl",
  "export const syncPolarProducts"
);
assert(
  billing.includes("CHECKOUT_BLOCKING_SUBSCRIPTION_STATUSES") &&
    billing.includes("BILLING_PORTAL_STATUSES") &&
    billing.includes("CHANGEABLE_SUBSCRIPTION_STATUSES") &&
    billing.includes("polar.getCurrentSubscription(ctx, { userId })") &&
    customerPortalAction.includes("getCurrentPolarSubscription(ctx, userId)") &&
    customerPortalAction.includes("hasBillingPortalSubscription(subscription)") &&
    customerPortalAction.includes("Không tìm thấy subscription Polar để mở portal"),
  "billing checkout and portal actions must check current Polar subscription state instead of relying only on frontend button state"
);
assert(
  billing.includes("LI_XI_BILLING_ADMIN_TOKEN") &&
    billing.includes("LIXI_BILLING_ADMIN_TOKEN") &&
    billing.includes("adminToken: v.optional(v.string())") &&
    billing.includes("if (!expectedToken)") &&
    billing.includes("hasProductionSecretShape(expectedToken)") &&
    billing.includes("Thiếu LI_XI_BILLING_ADMIN_TOKEN hoặc LIXI_BILLING_ADMIN_TOKEN") &&
    billing.includes("LI_XI_BILLING_ADMIN_TOKEN / LIXI_BILLING_ADMIN_TOKEN phải là secret production dài") &&
    billing.includes("timingSafeEqual(args.adminToken?.trim(), expectedToken)") &&
    billing.includes("polar.syncProducts(ctx)"),
  "Polar product sync must remain production-safe exact admin-token gated"
);
assert(
  secretPolicy.includes("export function hasProductionSecretShape") &&
    secretPolicy.includes("export function timingSafeEqual") &&
    secretPolicy.includes("placeholderSecretValues") &&
    secretPolicy.includes("secret.length >= minLength") &&
    secretPolicy.includes("!/[<>]/.test(secret)") &&
    secretPolicy.includes("mismatch |= (leftValue.charCodeAt(index) || 0) ^ (rightValue.charCodeAt(index) || 0)") &&
    secretPolicyTest.includes("secret policy regression tests passed") &&
    secretPolicyTest.includes("prod_shared_secret_0123456789abcd") &&
    secretPolicyTest.includes("short-secret") &&
    secretPolicyTest.includes("placeholder") &&
    secretPolicyTest.includes("prod shared secret") &&
    secretPolicyTest.includes("<prod_shared_secret_0123456789abcd>") &&
    secretPolicyTest.includes("timingSafeEqual"),
  "shared operational token policy must reject short, placeholder, whitespace, and angle-bracket secrets and compare without early-exit string equality"
);

const opsReadinessSource = read("convex/ops.ts");
const fullReadinessQuery = section(
  opsReadinessSource,
  "export const getSaaSReadiness",
  "export const getHostSaaSReadiness"
);
const hostReadinessQuery = tailSection(opsReadinessSource, "export const getHostSaaSReadiness");
const hostReadinessRedaction = section(
  opsReadinessSource,
  "function redactReadinessForHost",
  "export const getSaaSReadiness"
);
assert(
  opsReadinessSource.includes("function requireOpsAdminToken") &&
    opsReadinessSource.includes("function configuredOpsAdminToken") &&
    opsReadinessSource.includes("LI_XI_OPS_ADMIN_TOKEN") &&
    opsReadinessSource.includes("LIXI_OPS_ADMIN_TOKEN") &&
    opsReadinessSource.includes("hasProductionSecretShape(expectedToken, 32)") &&
    opsReadinessSource.includes("Cần LI_XI_OPS_ADMIN_TOKEN hoặc LIXI_OPS_ADMIN_TOKEN") &&
    opsReadinessSource.includes("LI_XI_OPS_ADMIN_TOKEN / LIXI_OPS_ADMIN_TOKEN phải là secret production dài") &&
    opsReadinessSource.includes("timingSafeEqual(adminToken?.trim(), expectedToken)") &&
    fullReadinessQuery.includes("adminToken: v.optional(v.string())") &&
    fullReadinessQuery.includes("requireOpsAdminToken(args.adminToken)") &&
    fullReadinessQuery.includes("accessSource"),
  "full SaaS readiness must require a production-safe ops admin token before returning admin configuration state"
);
assert(
  opsReadinessSource.includes("async function requireHostReadinessAccess") &&
    opsReadinessSource.includes("const authUserId = await getAuthUserId(ctx)") &&
    opsReadinessSource.includes("Cần đăng nhập Google để xem tóm tắt cấu hình SaaS") &&
    hostReadinessQuery.includes("await requireHostReadinessAccess(ctx)") &&
    hostReadinessQuery.includes("return redactReadinessForHost(await buildSaaSReadiness(ctx))"),
  "host SaaS readiness must require Convex Auth and return only the redacted host projection"
);
assert(
  hostReadinessRedaction.includes('accessSource: "convexAuth"') &&
    hostReadinessRedaction.includes("configured: requirement.configured") &&
    hostReadinessRedaction.includes("detail: hostRuntimeDetail(requirement)") &&
    !hostReadinessRedaction.includes("configuredName") &&
    !hostReadinessRedaction.includes("acceptedNames") &&
    !hostReadinessRedaction.includes("detail: requirement.detail"),
  "host SaaS readiness redaction must omit env names and raw runtime details"
);

const authorization = read("convex/authorization.ts");
const authorizationPolicyTest = read("scripts/test-authorization-policy.mjs");
assert(
  authorization.includes("isLegacyAccountAuthEnabled") &&
    authConfig.includes("isLegacyAccountAuthEnabled()") &&
    authConfig.includes("assertLegacyAccountAuthEnabled();"),
  "Legacy username/PIN account auth must be explicitly env-gated"
);
assert(
  authorization.includes("isLegacyOwnerBridgeEnabled") &&
    !section(
      authorization,
      "export function isLegacyOwnerBridgeEnabled",
      "export function isLegacyAccountAuthEnabled"
    ).includes("isLegacyAccountAuthEnabled()"),
  "Legacy owner bridge must require its own explicit env gate instead of inheriting legacy account auth"
);
assert(
  authorization.includes("LI_XI_ENABLE_LEGACY_OWNER_BRIDGE"),
  "Legacy owner bridge env flag must be explicit"
);
assert(
  !authorization.includes("allowLegacyBridge") &&
    !authorization.includes('source: "legacy"') &&
    authorization.includes("Client ownerId không được dùng để xác thực"),
  "requireResolvedOwner must not expose a legacy owner bridge path"
);
assert(
  authorizationPolicyTest.includes("requireResolvedOwner must not expose a legacy owner bridge path") &&
    authorizationPolicyTest.includes("host owner resolution must derive owner from Convex Auth instead of client ownerId") &&
    authorizationPolicyTest.includes("must not pass legacy bridge options") &&
    authorizationPolicyTest.includes("authorization policy regression tests passed") &&
    read("package.json").includes("node scripts/test-authorization-policy.mjs"),
  "authorization policy regression tests must protect Convex Auth-only host owner resolution"
);
assert(
  authorization.includes("export async function verifyAuthOwner") &&
    authorization.includes("if (!authUserId)") &&
    authorization.includes("throw new Error(unauthenticatedMessage)") &&
    authorization.includes("authUserId !== ownerId") &&
    authorization.includes("unauthenticatedMessage?: string") &&
    authorization.includes("options.unauthenticatedMessage"),
  "verified owner helpers must fail closed without Convex Auth instead of silently accepting unauthenticated owner IDs"
);
assert(
  authorization.includes('message = "Không tìm thấy host"') &&
    authConfig.includes("Không tìm thấy tài khoản host") &&
    authConfig.includes("Cần đăng nhập để thiết lập PIN host"),
  "Convex Auth host helpers must use host/account language in host-facing errors"
);
assertNoPatternInFiles(
  [
    "convex/auth.ts",
    "convex/authorization.ts",
    "convex/analytics.ts",
    "convex/assets.ts",
    "convex/budgetScope.ts",
    "convex/campaigns.ts",
    "convex/draw.ts",
    "convex/leaderboard.ts",
    "convex/setup.ts",
  ],
  /Không tìm thấy chủ ví|Không tìm thấy tài khoản chủ ví|Chủ ví chưa|PIN chủ ví|Cần đăng nhập để thiết lập PIN chủ ví|Cần thiết lập PIN chủ ví/,
  "host-facing backend modules must not leak wallet-era Vietnamese wording"
);

const ownerSession = read("lib/ownerSession.ts");
const useOwnerSession = read("lib/useOwnerSession.ts");
const authRoute = read("app/auth.tsx");
const setupRoute = read("app/setup.tsx");
const ownerSessionValidator = section(ownerSession, "function isLegacyOwnerSession", "let cachedSession");
const readOwnerSessionSection = section(ownerSession, "export function readOwnerSession", "export function clearOwnerSession");
const finishOAuthLogin = section(authRoute, "async function finishOAuthLogin", "const handleGoogleSignIn");
const configureBudgetHandler = section(setupRoute, "const handleSubmit", "const handleSetHostPin");
assert(
  ownerSession.includes('authSource: "convexAuth"') &&
    ownerSession.includes("type StoredLegacyOwnerSession") &&
    ownerSession.includes("type LegacyOwnerSessionCleanupSignal") &&
    !section(ownerSession, "export type OwnerSession", "type StoredLegacyOwnerSession").includes("userId") &&
    ownerSessionValidator.includes('candidate.authSource === "legacy"') &&
    !ownerSessionValidator.includes("candidate.authSource === undefined") &&
    !ownerSessionValidator.includes('candidate.authSource === "convexAuth"'),
  "local owner-session storage must be limited to stale legacy cleanup while live sessions are Convex Auth only"
);
assert(
  !ownerSession.includes("export function writeOwnerSession") &&
    ownerSession.includes("export function clearOwnerSession") &&
    ownerSession.includes("export function readOwnerSession"),
  "frontend must not expose a local owner-session writer after the OAuth-only host boundary"
);
assert(
  readOwnerSessionSection.includes('cachedSession = { authSource: "legacy" }') &&
    !readOwnerSessionSection.includes("...parsed") &&
    !readOwnerSessionSection.includes("userId:") &&
    !readOwnerSessionSection.includes("username:"),
  "readOwnerSession must only expose a sanitized legacy cleanup signal, not raw localStorage user ids"
);
assert(
    !ownerSession.includes("ownerBridgeArgs") &&
    !ownerSession.includes("OwnerBridgeArgs") &&
    appTsxFiles.every((routeFile) => !read(routeFile).includes("ownerBridgeArgs")) &&
    appTsxFiles.every((routeFile) => !read(routeFile).includes("OwnerBridgeArgs")) &&
    appTsxFiles.every((routeFile) => !read(routeFile).includes("ownerArgs")) &&
    appTsxFiles.every((routeFile) => !read(routeFile).includes("hostArgs")) &&
    appTsxFiles.every((routeFile) => !read(routeFile).includes("...ownerArgs")) &&
    appTsxFiles.every((routeFile) => !read(routeFile).includes("...hostArgs")),
  "frontend host routes must use direct Convex Auth owner guards without auth argument helper variables or client ownerId types"
);
assert(
  !useOwnerSession.includes("writeOwnerSession") &&
    useOwnerSession.includes("clearOwnerSession();") &&
    !useOwnerSession.includes("userId: currentUser.userId") &&
    useOwnerSession.includes("return null;") &&
    !useOwnerSession.includes("legacyBridgeEnabled") &&
    !useOwnerSession.includes("VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    !useOwnerSession.includes("VITE_LI_XI_ENABLE_LEGACY_AUTH"),
  "useOwnerSession must derive Convex Auth identity from live auth state and clear stale legacy sessions"
);
assert(
  authRoute.includes("useAuthActions") &&
    authRoute.includes('signIn("google"') &&
    authRoute.includes("Đăng nhập host chiến dịch") &&
    !authRoute.includes("Đăng nhập chủ ví") &&
    !authRoute.includes("legacyAccountAuthEnabled") &&
    !authRoute.includes("legacyOwnerBridgeEnabled") &&
    !authRoute.includes("legacyAuthEnabled") &&
    !authRoute.includes("OtpPinInput") &&
    !authRoute.includes("writeOwnerSession"),
  "auth route must expose Google OAuth only and avoid the legacy username/PIN form"
);
assert(
  finishOAuthLogin.includes("clearOwnerSession();") &&
    finishOAuthLogin.includes("ensureCurrentHostProfile({})") &&
    finishOAuthLogin.includes('setupState.hasSetup ? "/campaigns" : "/setup"') &&
    !finishOAuthLogin.includes("writeOwnerSession"),
  "OAuth login must clear the legacy bridge cache, materialize hostProfile, land configured hosts in Campaign Studio, and avoid persisting Convex Auth identity"
);
assert(
  configureBudgetHandler.includes('navigate({ to: "/campaigns", replace: true })'),
  "budget/PIN setup completion must route hosts into Campaign Studio before creating draw sessions"
);
assert(
  setupRoute.includes('import adminCss from "./styles/admin.css?url"') &&
    setupRoute.includes("AdminPageShell") &&
    setupRoute.includes("Budget Setup") &&
    setupRoute.includes("Host PIN") &&
    setupRoute.includes("Lưu PIN host") &&
    !setupRoute.includes("Chủ ví:") &&
    !setupRoute.includes("PIN chủ ví") &&
    !setupRoute.includes('onPress={() => void navigate({ to: "/draw" })}'),
  "setup route must use the HeroUI admin shell while steering hosts back to Campaign Studio after configuration"
);

const convexFiles = walk("convex", (file) => /\.(ts|js)$/.test(file) && !file.includes("_generated"));
assertNoPatternInFiles(
  convexFiles,
  /Math\.random/,
  "Convex backend must not use Math.random for prize/business logic"
);

const draw = read("convex/draw.ts");
const drawSessionPolicy = read("convex/drawSessionPolicy.ts");
const budgetScope = read("convex/budgetScope.ts");
const publicLinks = read("convex/publicLinks.ts");
assert(
  read("convex/schema.ts").includes("publicCodeExpiresAt") &&
    publicLinks.includes("PUBLIC_LINK_TTL_MS") &&
    publicLinks.includes("isSafePublicLinkTimestamp") &&
    publicLinks.includes("Number.isSafeInteger(value)") &&
    publicLinks.includes("session.publicCodeExpiresAt !== undefined") &&
    publicLinks.includes("const expiresAt = createdAt + PUBLIC_LINK_TTL_MS") &&
    publicLinks.includes("Thời điểm hết hạn link public không hợp lệ") &&
    publicLinks.includes("maxExpiresAt = getPublicLinkExpiresAt(session.createdAt)") &&
    publicLinks.includes("catch") &&
    publicLinks.includes("session.publicCodeExpiresAt > maxExpiresAt") &&
    publicLinks.includes("return 0") &&
    publicLinks.includes("isExpiredPendingLinkSession") &&
    publicLinks.includes("isOpenPendingSession") &&
    publicLinks.includes('session.publicCode ? "link" : "station"') &&
    publicLinkPolicyTest.includes("legacy pending rows with publicCode and missing deliveryMode should be treated as link mode") &&
    publicLinkPolicyTest.includes("explicit expiry beyond the max TTL should fail closed") &&
    publicLinkPolicyTest.includes("unsafe explicit expiry should fail closed") &&
    publicLinkPolicyTest.includes("expiry timestamps that overflow safe integer range should fail closed") &&
    publicLinkPolicyTest.includes("missing explicit expiry should not synthesize an unsafe timestamp") &&
    publicLinkPolicyTest.includes("station pending sessions should not expire through public link TTL") &&
    publicLinkPolicyTest.includes("non-pending link sessions should not count as open") &&
    draw.includes("publicCodeExpiresAt") &&
    draw.includes("getPublicLinkExpiresAt") &&
    draw.includes("resolveSessionDeliveryMode") &&
    draw.includes("isPendingLinkSession(session)") &&
    draw.includes("!isExpiredPendingLinkSession(session") &&
    draw.includes("expiresAt: resolvePublicLinkExpiresAt(session)") &&
    drawSessionPolicy.includes("isOpenPendingSession(session, now)") &&
    drawSessionPolicy.includes("isOpenPendingSession(session)") &&
    read("convex/migrations.ts").includes("sessionsPatchedPublicCodeExpiry") &&
    read("convex/migrations.ts").includes("skippedInvalidPublicCodeExpiry") &&
    read("convex/migrations.ts").includes("patch.publicCodeExpiresAt = getPublicLinkExpiresAt(session.createdAt)") &&
    read("convex/migrations.ts").includes("} catch {\n        stats.skippedInvalidPublicCodeExpiry += 1;"),
  "public claim links must have expiry metadata used by claim lookup, quotas, budget locks, and fail-closed migration"
);
const getPublicSession = section(draw, "export const getPublicSession", "export const cancelSession");
const getPublicSessionResponse = section(
  getPublicSession,
  "return {\n      guestNameDisplay",
  "    };\n  },"
);
const cancelSessionMutation = section(draw, "export const cancelSession", "async function redeemPendingSession");
const stationSessionCampaignView = section(draw, "async function stationSessionCampaignView", "export const getStationState");
assert(!/\bsessionId\b/.test(getPublicSessionResponse), "getPublicSession must not expose sessionId");
assert(!/\bid:\s/.test(getPublicSessionResponse), "getPublicSession must not expose internal ids");
assert(!/\bownerId\b/.test(getPublicSessionResponse), "getPublicSession must not expose ownerId");
assert(!/\bcampaignId\b/.test(getPublicSessionResponse), "getPublicSession must not expose campaignId");
assert(!/\bpublicCode\b/.test(getPublicSessionResponse), "getPublicSession must not echo publicCode");
assert(
  !/\bremainingBudget\b/.test(getPublicSessionResponse),
  "getPublicSession must not expose host budget state"
);
assert(
  getPublicSession.includes("publicRewardPoolView"),
  "getPublicSession must use publicRewardPoolView"
);
assert(
  getPublicSession.includes("campaignCandidate") &&
    draw.includes("function hasSessionCampaignSnapshot") &&
    getPublicSession.includes("const hasSnapshot = hasSessionCampaignSnapshot(session)") &&
    getPublicSession.includes("!hasSnapshot &&") &&
    getPublicSession.includes("hasSnapshot || campaign") &&
    getPublicSession.includes("hasSnapshot\n              ? session.campaignClaimHeadlineSnapshot ?? null") &&
    getPublicSession.includes("campaignCandidate.ownerId === session.ownerId") &&
    getPublicSession.includes("getAvailableBudgetItems(ctx, session.ownerId, session.campaignId)") &&
    getPublicSession.includes("getPayableBudgetItems("),
  "public claim campaign fallback must only use campaigns owned by the session owner, only for legacy sessions without snapshots, and prize previews must stay scoped to the session campaign id"
);
assert(
  !getPublicSessionResponse.includes("ownerName") &&
    !getPublicSessionResponse.includes("hostDisplayNameSnapshot") &&
    !getPublicSessionResponse.includes("hostProfile") &&
    !getPublicSessionResponse.includes("owner?.username") &&
    !getPublicSessionResponse.includes("owner?.name") &&
    !getPublicSessionResponse.includes("displayNameFromUser(owner)"),
  "public claim reads must not expose host display identity; guest-facing branding should come from campaign snapshots"
);
assert(
    getPublicSession.includes("getOwnerBudgetOrThrow(ctx, session.ownerId, session.campaignId).catch") &&
    getPublicSession.includes("hasSpendableBudget(budget)") &&
    getPublicSession.includes("capacityPreservingItems.length === 0") &&
    getPublicSession.includes("getCapacityPreservingBudgetItems(") &&
    getPublicSession.includes("return null"),
  "public claim reads must fail closed when the scoped budget is missing, exhausted, or has no capacity-preserving prize units"
);
assert(
  draw.includes("sanitizePublicCode") &&
    publicLinks.includes("export const PUBLIC_CODE_BYTES = 12") &&
    publicLinks.includes("export const PUBLIC_CODE_HEX_LENGTH = PUBLIC_CODE_BYTES * 2") &&
    publicLinks.includes("new RegExp(`^[a-f0-9]{${PUBLIC_CODE_HEX_LENGTH}}$`)") &&
    publicLinks.includes("export function normalizePublicCode") &&
    publicAppUrlPolicy.includes("export function normalizePublicClaimCode") &&
    publicLinkPolicyTest.includes("normalizePublicCode") &&
    publicAppUrlPolicyTest.includes("normalizePublicClaimCode") &&
    draw.includes("assertPublicCodeRemainsUnambiguous") &&
    read("convex/schema.ts").includes('.index("by_publicCode_status", ["publicCode", "status"])') &&
    draw.includes('withIndex("by_publicCode_status"') &&
    draw.includes('q.eq("publicCode", publicCode).eq("status", "pending")') &&
    draw.includes("normalizePublicCode(value)") &&
    draw.includes("new Uint8Array(PUBLIC_CODE_BYTES)") &&
    draw.includes("crypto.getRandomValues(bytes)") &&
    !draw.includes("crypto.randomUUID()") &&
    draw.includes("findPendingLinkSessionByPublicCode"),
  "public claim lookups must use 96-bit random hex publicCode values, validate opaque publicCode format, and resolve pending link sessions only"
);
assert(
  draw.includes("pendingLinkSessions.length !== 1") &&
    draw.includes("return null"),
  "duplicate publicCode rows must not resolve ambiguously to a public claim session"
);
assert(
  cancelSessionMutation.includes("session.status !== \"pending\"") &&
    cancelSessionMutation.includes("isExpiredPendingLinkSession(session)") &&
    cancelSessionMutation.includes("Link rút đã hết hiệu lực") &&
    cancelSessionMutation.indexOf("isExpiredPendingLinkSession(session)") <
      cancelSessionMutation.indexOf('status: "cancelled"'),
  "cancelSession must not mutate expired or malformed public link sessions"
);

const redeemPublicSession = section(draw, "export const redeemPublicSession", "});");
const redeemPendingSession = section(draw, "async function redeemPendingSession", "export const redeem = mutation");
const redeemableSessionCampaignGuard = section(
  draw,
  "async function requireRedeemableSessionCampaign",
  "async function getCampaignGuestRedemption"
);
assert(
  redeemableSessionCampaignGuard.includes("if (!session.campaignId)") &&
    redeemableSessionCampaignGuard.includes("throw new Error(\"Chiến dịch của lượt rút không còn hiệu lực\")") &&
    !redeemableSessionCampaignGuard.includes("if (!session.campaignId) {\n    return;\n  }") &&
    redeemableSessionCampaignGuard.includes("const campaignId = session.campaignId") &&
    redeemableSessionCampaignGuard.includes("const campaign = await ctx.db.get(campaignId)") &&
    redeemableSessionCampaignGuard.includes("campaign.ownerId !== session.ownerId") &&
    redeemableSessionCampaignGuard.includes('campaign.status !== "active"') &&
    redeemableSessionCampaignGuard.includes("Chiến dịch của lượt rút không còn hiệu lực") &&
    redeemableSessionCampaignGuard.includes("return campaignId") &&
    redeemPendingSession.includes("const campaignId = await requireRedeemableSessionCampaign(ctx, session)") &&
    redeemPendingSession.indexOf("const campaignId = await requireRedeemableSessionCampaign(ctx, session)") <
      redeemPendingSession.indexOf("await getOwnerBudgetOrThrow"),
  "shared redemption path must fail closed before budget and analytics writes when a session campaign is missing, foreign-owned, or inactive"
);
assert(
  draw.includes("function getPayableBudgetItems") &&
    draw.includes("function getPayableBudgetItemsForRemainingBudget") &&
    draw.includes("function getPayablePrizeUnitCapacityForRemainingBudget") &&
    draw.includes("function getCapacityPreservingBudgetItems") &&
    draw.includes("item.isActive") &&
    draw.includes("Number.isSafeInteger(item.remainingQuantity)") &&
    draw.includes("item.remainingQuantity > 0") &&
    getPublicSession.includes("getCapacityPreservingBudgetItems(") &&
    getPublicSession.includes("publicRewardPoolView(capacityPreservingItems)") &&
    section(draw, "export const getStationState", "export const createSession").includes("pendingSessionOpenCampaignSessions") &&
    section(draw, "export const getStationState", "export const createSession").includes("getCapacityPreservingBudgetItems(") &&
    redeemPendingSession.includes("getPayableBudgetItems(") &&
    redeemPendingSession.includes("remainingOpenPendingSessions") &&
    redeemPendingSession.includes("capacityPreservingItems") &&
    draw.includes("getPayablePrizeUnitCapacityForRemainingBudget(nextItems, nextRemainingBudget)") &&
    redeemPendingSession.includes("Không còn mệnh giá nào giữ đủ phần thưởng cho các lượt rút đang chờ") &&
    redeemPendingSession.includes("Không còn mệnh giá nào phù hợp với ngân sách còn lại") &&
    !redeemPendingSession.includes("budget.remainingBudget < selectedItem.amount"),
  "public claim previews and redemption selection must only use active positive prize items payable by the remaining budget while preserving capacity for other open sessions"
);
assert(!/\bsessionId\b/.test(redeemPublicSession), "redeemPublicSession must not accept sessionId");
assert(!/\bownerId\b/.test(redeemPublicSession), "redeemPublicSession must not accept ownerId");
assert(
  !/\bremainingBudget\b/.test(redeemPublicSession),
  "redeemPublicSession must not return host budget state"
);
assert(
  redeemPublicSession.includes("publicCode: v.string()") &&
    redeemPublicSession.includes("envelopeIndex: v.number()"),
  "redeemPublicSession must use only publicCode and envelopeIndex public args"
);

const createSessionPanel = read("app/draw/components/CreateSessionPanel.tsx");
const drawRoute = read("app/draw.tsx");
const publicAppUrl = read("lib/publicAppUrl.ts");
const campaignsRoute = read("app/campaigns.tsx");
const campaignAssetsPanel = read("app/-campaigns/CampaignAssetsPanel.tsx");
const campaignAssetUploadHook = read("app/-campaigns/useCampaignAssetUpload.ts");
const campaignBillingActionsHook = read("app/-campaigns/useCampaignBillingActions.ts");
const campaignReadinessPanel = read("app/-campaigns/ReadinessPanel.tsx");
const campaignUtils = read("app/-campaigns/utils.ts");
const hostHeaderComponent = read("app/draw/components/HostHeader.tsx");
assert(
  hostHeaderComponent.includes("onDraw?: () => void") &&
    hostHeaderComponent.includes("Host chiến dịch") &&
    !hostHeaderComponent.includes("Chủ ví:") &&
    hostHeaderComponent.includes("Mở trạm rút thưởng") &&
    hostHeaderComponent.includes("Trạm rút") &&
    hostHeaderComponent.includes("function TicketIcon"),
  "shared host header must support an explicit draw-session CTA for Campaign Studio"
);
assert(
  createSessionPanel.includes("PIN host") &&
    !createSessionPanel.includes("PIN chủ ví"),
  "create-session panel must present the operational PIN as a host PIN, not wallet-era wording"
);
assert(
  campaignUtils.includes('export const changeableSubscriptionStatuses = new Set(["active", "trialing", "past_due"])') &&
    campaignBillingActionsHook.includes("const currentSubscriptionStatus = planState?.subscription?.status?.toLowerCase()") &&
    campaignBillingActionsHook.includes("changeableSubscriptionStatuses.has(currentSubscriptionStatus)") &&
    !campaignBillingActionsHook.includes('planState?.source === "polar" && planState.subscription'),
  "Campaign Studio billing actions must route past_due subscriptions through subscription change instead of opening duplicate checkout"
);
assert(
  createSessionPanel.includes('window.open(shareUrl, "_blank", "noopener,noreferrer")') &&
    createSessionPanel.includes("Mở link rút") &&
    !createSessionPanel.includes("onOpenGuest") &&
    !createSessionPanel.includes("Mở màn hình rút tại trạm"),
  "host share-link UI must open the public claim link instead of the station guest screen"
);
assert(
  publicAppUrl.includes("import.meta.env.VITE_SITE_URL") &&
    publicAppUrl.includes("parseCleanPublicAppOrigin(import.meta.env.VITE_SITE_URL)") &&
    publicAppUrl.includes("buildPublicAppUrlFromOrigin(path, origin)") &&
    publicAppUrlPolicy.includes('from "./networkPolicy.ts"') &&
    publicAppUrlPolicy.includes("export function parseCleanPublicAppOrigin") &&
    publicAppUrlPolicy.includes("url.username") &&
    publicAppUrlPolicy.includes("url.password") &&
    publicAppUrlPolicy.includes("url.search") &&
    publicAppUrlPolicy.includes("url.hash") &&
    publicAppUrlPolicy.includes('url.pathname !== "/"') &&
    publicAppUrlPolicy.includes("isLocalDevHostname") &&
    publicAppUrlPolicy.includes("isLocalNetworkHostname") &&
    publicAppUrlPolicy.includes("isLocalOrPrivateHostname(hostname)") &&
    publicAppUrlPolicy.includes('url.protocol !== "https:"') &&
    publicAppUrlPolicy.includes("isRawIpHostname") &&
    publicAppUrlPolicy.includes('!path.startsWith("/") || path.startsWith("//")') &&
    publicAppUrlPolicy.includes("Public app URL path must be root-relative") &&
    publicAppUrlPolicy.includes("export function assertPublicClaimPath") &&
    publicAppUrlPolicy.includes("/^\\/claim\\/[a-f0-9]{24}$/") &&
    publicAppUrlPolicyTest.includes("http://app.example.com") &&
    publicAppUrlPolicyTest.includes("https://app.example.com:8443") &&
    publicAppUrlPolicyTest.includes("https://app.localhost") &&
    publicAppUrlPolicyTest.includes("https://preview.local") &&
    publicAppUrlPolicyTest.includes("https://[fd00::1]") &&
    publicAppUrlPolicyTest.includes("https://app.example.com/campaigns") &&
    publicAppUrlPolicyTest.includes("https://user:pass@app.example.com") &&
    publicAppUrlPolicyTest.includes("https://evil.example.com/claim/abc123") &&
    publicAppUrlPolicyTest.includes("//evil.example.com/claim/abc123") &&
    publicAppUrlPolicyTest.includes("assertPublicClaimPath(\"/claim/abcdefabcdefabcdefabcdef\")") &&
    publicAppUrlPolicyTest.includes("/claim/ABCDEFABCDEFABCDEFABCDEF") &&
    publicAppUrlPolicyTest.includes("public app URL policy regression tests passed") &&
    publicAppUrl.includes("export function getPublicAppOrigin") &&
    publicAppUrl.includes("export function buildPublicAppUrl") &&
    publicAppUrl.includes("export function buildPublicClaimUrl") &&
    publicAppUrl.includes("assertPublicClaimPath(path)") &&
    publicAppUrl.includes("export function getBillingReturnPublicAppUrl") &&
    publicAppUrl.includes('return buildPublicAppUrl("/campaigns")') &&
    publicAppUrl.includes("export function getCurrentPublicAppUrl") &&
    publicAppUrl.includes("window.location.origin") &&
    publicAppUrl.includes("const currentPath = `${window.location.pathname}${window.location.search}`") &&
    !publicAppUrl.includes("window.location.hash") &&
    createSessionPanel.includes('import { buildPublicClaimUrl } from "@/lib/publicAppUrl"') &&
    createSessionPanel.includes("const shareUrl = sharePath ? buildPublicClaimUrl(sharePath) : sharePath") &&
    createSessionPanel.includes("const buildShareUrl = (path: string) => buildPublicClaimUrl(path)") &&
    !createSessionPanel.includes("buildPublicAppUrl(sharePath)") &&
    !createSessionPanel.includes("window.location.origin") &&
    campaignBillingActionsHook.includes('import { getBillingReturnPublicAppUrl, getPublicAppOrigin } from "@/lib/publicAppUrl"') &&
    campaignBillingActionsHook.includes("origin: getPublicAppOrigin()") &&
    campaignBillingActionsHook.includes("const billingReturnUrl = getBillingReturnPublicAppUrl()") &&
    campaignBillingActionsHook.includes("successUrl: billingReturnUrl") &&
    campaignBillingActionsHook.includes("returnUrl: getBillingReturnPublicAppUrl()") &&
    !campaignBillingActionsHook.includes("successUrl: currentPublicUrl") &&
    !campaignBillingActionsHook.includes("returnUrl: getCurrentPublicAppUrl()") &&
    !campaignBillingActionsHook.includes("window.location.origin") &&
    !campaignBillingActionsHook.includes("window.location.href"),
  "frontend public share links and Polar return URLs must use VITE_SITE_URL through canonical public app URL helpers"
);
assert(
  draw.includes("pendingLinkSessions") &&
    draw.includes("isPendingLinkSession(session)") &&
    draw.includes("const publicCode = session.publicCode ? normalizePublicCode(session.publicCode) : null") &&
    draw.includes("sharePath: `/claim/${publicCode}`") &&
    !draw.includes("sharePath: `/claim/${session.publicCode}`") &&
    draw.includes(".slice(0, 12)") &&
    draw.includes("campaignNameSnapshot"),
  "station state must expose recent pending public link sessions for host lifecycle management without malformed public claim share paths"
);
assert(
  createSessionPanel.includes("pendingLinkSessions") &&
    createSessionPanel.includes("Link đang chờ") &&
    createSessionPanel.includes("shareExpiresAt") &&
    createSessionPanel.includes("Hết hạn") &&
    createSessionPanel.includes("onCancelLinkSession") &&
    drawRoute.includes("cancelSession") &&
    drawRoute.includes("handleCancelLinkSession") &&
    !drawRoute.includes("holdHostForShare"),
  "host draw UI must list and cancel pending link sessions without reusing station guest mode"
);

const fortuneStage = read("app/draw/FortuneStage.tsx");
const publicClaimRoute = read("app/claim/$publicCode.tsx");
const resultModal = read("app/draw/fortune/ResultModal.tsx");
const schemaForClaimCopy = read("convex/schema.ts");
assert(
  fortuneStage.includes("sessionKey: string | null") &&
    !fortuneStage.includes("sessionId: string | null") &&
    publicClaimRoute.includes("normalizePublicClaimCode(publicCode)") &&
    publicClaimRoute.includes('normalizedPublicCode ? { publicCode: normalizedPublicCode } : "skip"') &&
    publicClaimRoute.includes("publicCode: normalizedPublicCode") &&
    publicClaimRoute.includes("sessionKey={normalizedPublicCode}") &&
    publicClaimRoute.includes("Link không hợp lệ") &&
    !publicClaimRoute.includes("sessionKey={publicCode}") &&
    !publicClaimRoute.includes("sessionId={publicCode}") &&
    publicClaimRoute.includes("redeemPublicSession"),
  "public claim stage must normalize publicCode before querying/redeeming and use publicCode as the session key"
);
assert(
  publicClaimRoute.includes("ctaLabel={visibleSession.campaign?.claimCtaLabel ?? undefined}") &&
    publicClaimRoute.includes("collectLabel={visibleSession.campaign?.claimCollectLabel ?? undefined}") &&
    drawRoute.includes("collectLabel={guestCampaign?.claimCollectLabel ?? undefined}") &&
    fortuneStage.includes("collectLabel?: string") &&
    fortuneStage.includes("collectLabel={collectLabel}") &&
    resultModal.includes("collectLabel?: string") &&
    resultModal.includes('collectLabel?.trim() || "Nhận thưởng"') &&
    schemaForClaimCopy.includes("claimCollectLabel: v.optional(v.string())") &&
    schemaForClaimCopy.includes("campaignClaimCollectLabelSnapshot: v.optional(v.string())") &&
    draw.includes("campaignClaimCollectLabelSnapshot: campaign.claimCollectLabel ?? undefined") &&
    draw.includes("claimCollectLabel: hasSnapshot") &&
    draw.includes("campaign?.claimCollectLabel ?? null") &&
    !resultModal.includes("Nhận lì xì"),
  "public claim collect CTA must use separate campaign result copy with a generic prize fallback"
);
assert(
  drawRoute.includes("stationGuestWaiting") &&
    drawRoute.includes("setStationGuestWaiting(true)") &&
    drawRoute.includes("setGuestMode(true)") &&
    drawRoute.includes("Đang chờ lượt rút tiếp theo") &&
    fortuneStage.includes("canExitToHost") &&
    publicClaimRoute.includes("sessionSnapshot") &&
    publicClaimRoute.includes("claimCompleted") &&
    publicClaimRoute.includes("Đã ghi nhận phần thưởng") &&
    !publicClaimRoute.includes('onCollect={() => void navigate({ to: "/" })') &&
    !publicClaimRoute.includes("useNavigate"),
  "Collect must keep station guests on the waiting hero and close public claims without routing guests to host auth"
);

const assets = read("convex/assets.ts");
const assetPolicy = read("lib/assetPolicy.ts");
const campaignsBackend = read("convex/campaigns.ts");
const schema = read("convex/schema.ts");
const campaignIdentity = read("convex/campaignIdentity.ts");
const assetRenderHelperSection = section(
  assets,
  "export async function getRenderableCampaignAssetUrl",
  "export const generateUploadUrl"
);
const assetUrlQuerySection = tailSection(assets, "export const getAssetUrl = query");
assert(
  campaignsRoute.includes("selectedCampaignId") &&
    campaignsRoute.includes("handleSelectCampaign") &&
    campaignsRoute.includes("handleNewCampaign") &&
    campaignsRoute.includes("AdminPageShell") &&
    read("app/components/AdminPageShell.tsx").includes('{ href: "/draw", label: "Draw Station" }') &&
    campaignsRoute.includes("workspace.campaigns.map") &&
    campaignsRoute.includes("Tạo campaign") &&
    campaignsRoute.includes("Chưa lưu vào Convex") &&
    campaignsRoute.includes("createDraftCampaignForm") &&
    campaignsRoute.includes("formFromCampaign") &&
    campaignsRoute.includes("isSavedSelectionWaitingForQuery") &&
    campaignsRoute.includes("form.id === selectedCampaignId") &&
    campaignsRoute.includes("selectedWorkspaceCampaignId") &&
    campaignsRoute.includes("{ selectedCampaignId: selectedWorkspaceCampaignId }") &&
    campaignsRoute.includes("selectableRecentAssets") &&
    campaignsRoute.includes("asset.campaignId === form.id") &&
    campaignsRoute.includes("selectedCampaign?.heroAsset?.url"),
  "Campaign Studio must expose multi-campaign selection, draft creation, and an explicit draw-session entry point instead of editing only activeCampaign"
);
assert(
  campaignsBackend.includes("getPreferredActiveCampaignForOwner(ctx, ownerId)") &&
    campaignIdentity.includes("export const visibleCampaignStatuses = [\"active\", \"draft\"] as const") &&
    campaignIdentity.includes("export async function listVisibleCampaignsForOwner") &&
    campaignIdentity.includes("export function sortCampaignsByRecency") &&
    campaignIdentity.includes("export async function getPreferredActiveCampaignForOwner") &&
    campaignIdentity.includes("getHostProfileForOwner(ctx, ownerId)") &&
    campaignIdentity.includes("hostProfile?.defaultCampaignId") &&
    campaignsBackend.includes("listVisibleCampaignsForOwner(ctx, ownerId)") &&
    campaignsBackend.includes("sortCampaignsByRecency(visibleCampaigns)") &&
    section(campaignsBackend, "export const getWorkspace", "export const saveCampaign").includes("args.selectedCampaignId && !selectedCampaign") &&
    section(campaignsBackend, "export const getWorkspace", "export const saveCampaign").includes('throw new Error("Không tìm thấy chiến dịch")') &&
    !section(campaignsBackend, "export const getWorkspace", "export const saveCampaign").includes(
      'campaign.status !== "archived"'
    ) &&
    !campaignsBackend.includes('find((campaign) => campaign.status === "active") ??\n      sortedCampaigns[0]'),
  "Campaign workspace activeCampaign must be null when no campaign is active, and selectedCampaignId must fail closed instead of falling back"
);
assert(
    campaignsBackend.includes("hasOpenPendingSessionForCampaign") &&
    campaignsBackend.includes('from "./drawSessionPolicy"') &&
    drawSessionPolicy.includes("PENDING_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes('withIndex("by_campaign_owner_status_delivery"') &&
    drawSessionPolicy.includes('.eq("campaignId", campaignId)') &&
    drawSessionPolicy.includes('.eq("deliveryMode", deliveryMode)') &&
    drawSessionPolicy.includes("isOpenPendingSession(session)") &&
    campaignsBackend.includes('campaign.status === "active"') &&
    campaignsBackend.includes('args.status !== "active"') &&
    section(campaignsBackend, "async function activateOnlyCampaign", "async function campaignView").includes("hasOpenPendingSessionForCampaign(ctx, ownerId, campaign._id)") &&
    section(campaignsBackend, "async function activateOnlyCampaign", "async function campaignView").includes("Không thể kích hoạt chiến dịch khác khi chiến dịch hiện tại còn lượt rút đang chờ") &&
    campaignsBackend.includes("Không thể tắt chiến dịch khi còn lượt rút đang chờ"),
  "saveCampaign must use campaign+owner+delivery pending-session indexes before explicit or implicit deactivation of active campaigns"
);
assert(
  !section(campaignsBackend, "export const getWorkspace", "export const saveCampaign").includes("allowLegacyBridge") &&
    !section(campaignsBackend, "export const getWorkspace", "export const saveCampaign").includes("ownerId: v.optional") &&
    section(campaignsBackend, "export const getWorkspace", "export const saveCampaign").includes("requireResolvedOwner(ctx, undefined") &&
    !section(campaignsBackend, "export const saveCampaign", "export const ensureDefaultCampaign").includes("allowLegacyBridge") &&
    !section(campaignsBackend, "export const saveCampaign", "export const ensureDefaultCampaign").includes("ownerId: v.optional") &&
    section(campaignsBackend, "export const saveCampaign", "export const ensureDefaultCampaign").includes("requireResolvedOwner(ctx, undefined") &&
    !section(campaignsBackend, "export const ensureDefaultCampaign", "export const attachUploadedAsset").includes("allowLegacyBridge") &&
    !section(campaignsBackend, "export const ensureDefaultCampaign", "export const attachUploadedAsset").includes("ownerId: v.optional") &&
    section(campaignsBackend, "export const ensureDefaultCampaign", "export const attachUploadedAsset").includes("requireResolvedOwner(ctx, undefined") &&
    !tailSection(campaignsBackend, "export const attachUploadedAsset").includes("allowLegacyBridge") &&
    !tailSection(campaignsBackend, "export const attachUploadedAsset").includes("ownerId: v.optional") &&
    tailSection(campaignsBackend, "export const attachUploadedAsset").includes("requireResolvedOwner(ctx, undefined"),
  "Campaign Studio mutations and workspace reads must derive owner from Convex Auth without client ownerId args"
);
assert(
  assets.includes("getUniqueOwnedCampaignAssetByKey") &&
    schema.includes('.index("by_key_owner", ["key", "ownerId"])') &&
    assets.includes("function getOwnedAssetsByKey") &&
    assets.includes("function configuredR2Bucket") &&
    assets.includes("process.env.R2_BUCKET?.trim()") &&
    assets.includes("export const getAssetUrl = query") &&
    assets.includes("campaignId: v.id(\"campaigns\")") &&
    assets.includes('withIndex("by_key_owner"') &&
    assets.includes("const safeKey = assertR2ObjectKey(key)") &&
    assets.includes('q.eq("key", safeKey).eq("ownerId", ownerId)') &&
    assets.includes("campaign.ownerId !== ownerId") &&
    assetUrlQuerySection.includes("getRenderableCampaignAssetUrl(ctx, ownerId, args.key, campaign._id)") &&
    assetUrlQuerySection.includes('throw new Error("Không tìm thấy asset chiến dịch")') &&
    !assetUrlQuerySection.includes("r2.getUrl") &&
    !assetUrlQuerySection.includes("getUniqueOwnedCampaignAssetByKey") &&
    assets.includes("ownedAssets.length === 1") &&
    assets.includes("getRenderableCampaignAssetUrl") &&
    assetRenderHelperSection.includes('campaignId: Id<"campaigns">') &&
    assetRenderHelperSection.includes("const campaign = await ctx.db.get(campaignId)") &&
    assetRenderHelperSection.includes("!campaign || campaign.ownerId !== ownerId") &&
    !assetRenderHelperSection.includes('campaignId?: Id<"campaigns">') &&
    !assetRenderHelperSection.includes("if (campaignId") &&
    assets.includes("asset.campaignId !== campaignId") &&
    assetRenderHelperSection.includes("return r2.getUrl(asset.key)") &&
    assets.indexOf("r2.getUrl") === assets.lastIndexOf("r2.getUrl") &&
    !assets.includes("return r2.getUrl(args.key)") &&
    assets.includes("isRenderableCampaignAsset") &&
    assets.includes("isRenderableCampaignAssetRecord(asset, ownerId, configuredR2Bucket())") &&
    assetPolicy.includes("export function normalizeR2ObjectKey") &&
    assetPolicy.includes("export function assertR2ObjectKey") &&
    assetPolicy.includes("Key asset R2 không hợp lệ") &&
    assetPolicy.includes('value.startsWith("/")') &&
    assetPolicy.includes('value.startsWith("\\\\")') &&
    assetPolicy.includes('value.startsWith("//")') &&
    assetPolicy.includes('value.includes("\\\\")') &&
    assetPolicy.includes('value.includes("?")') &&
    assetPolicy.includes('value.includes("#")') &&
    assetPolicy.includes("!/[<>\"'`]/.test(character)") &&
    assetPolicyTest.includes("normalizeR2ObjectKey") &&
    assetPolicyTest.includes("campaign-assets/../key-1") &&
    assetPolicyTest.includes("campaign-assets/key-1?signature=secret") &&
    assetPolicyTest.includes("campaign-assets/<key-1>") &&
    assetPolicyTest.includes("campaign-assets/\\\"key-1\\\"") &&
    assetPolicyTest.includes("campaign-assets/'key-1'") &&
    assetPolicyTest.includes("campaign-assets/`key-1`") &&
    assetPolicy.includes("export function isRenderableCampaignAssetRecord") &&
    assetPolicy.includes("export function isSafeCampaignAssetBucketName") &&
    assetPolicy.includes("normalizedBucket.length >= 3") &&
    assetPolicy.includes("normalizedBucket.length <= 63") &&
    assetPolicy.includes('!/^\\d{1,3}(?:\\.\\d{1,3}){3}$/.test(normalizedBucket)') &&
    assetPolicy.includes("!normalizedBucket.includes(\"..\")") &&
    assetPolicy.includes('asset.status === "attached"') &&
    assetPolicy.includes("asset.ownerId === ownerId") &&
    assetPolicy.includes("asset.bucket === bucket") &&
    assetPolicy.includes('asset.metadataSource === "r2"') &&
    assetPolicy.includes('typeof asset.validatedAt === "number"') &&
    assetPolicy.includes("Number.isSafeInteger(asset.validatedAt)") &&
    assetPolicy.includes("asset.validatedAt > 0") &&
    assetPolicy.includes("Number.isSafeInteger(asset.size)") &&
	    assetPolicy.includes("asset.size > 0") &&
	    assetPolicy.includes("asset.size <= CAMPAIGN_ASSET_MAX_BYTES") &&
	    assetPolicy.includes("isAllowedCampaignAssetContentType(asset.contentType)") &&
	    assetPolicy.includes("character.charCodeAt(0)") &&
	    assetPolicy.includes('character === "/"') &&
	    assetPolicy.includes('character === "\\\\"') &&
	    assetPolicy.includes("code <= 31") &&
	    assetPolicy.includes("code === 127") &&
	    assetPolicyTest.includes("Không đọc được dung lượng ảnh upload") &&
	    assetPolicyTest.includes("Chỉ hỗ trợ ảnh JPG, PNG, WebP, GIF hoặc AVIF") &&
	    assetPolicyTest.includes("isSafeCampaignAssetBucketName") &&
	    assetPolicyTest.includes("R2 bucket names shaped like IPv4 literals should fail closed") &&
	    assetPolicyTest.includes("asset filenames should strip path separators and control characters") &&
	    assetPolicyTest.includes("wrong-bucket assets should not render") &&
    assetPolicyTest.includes("raw uploaded assets should not render before attach") &&
    assetPolicyTest.includes("client-declared metadata should not render without R2 validation") &&
    assetPolicyTest.includes("legacy rows missing validatedAt should not render") &&
    assetPolicyTest.includes("assets with zero validation timestamps should not render") &&
    assetPolicyTest.includes("assets with unsafe validation timestamps should not render") &&
    assetPolicyTest.includes("zero-byte attached R2 assets should not render") &&
    assetPolicyTest.includes("assets with unsafe R2 sizes should not render") &&
    assetPolicyTest.includes("unsupported image content types should not render") &&
    assetPolicyTest.includes("oversized attached R2 assets should not render") &&
    assetPolicyTest.includes("foreign owner assets should not render") &&
    assetPolicyTest.includes("missing configured R2 bucket should fail closed") &&
    assetPolicyTest.includes("unsafe configured R2 bucket names should fail closed even when asset rows match") &&
    !assets.includes('asset.status !== "uploaded"'),
  "R2 asset key reads must resolve exactly one owned campaign-scoped attached and R2-validated asset before minting URLs"
);
assert(
  assets.includes("export const generateUploadUrl = mutation") &&
    !section(assets, "export const generateUploadUrl", "export const syncMetadata").includes("allowLegacyBridge") &&
    !section(assets, "export const generateUploadUrl", "export const syncMetadata").includes("ownerId: v.optional") &&
    section(assets, "export const generateUploadUrl", "export const syncMetadata").includes("requireResolvedOwner(ctx, undefined") &&
    !assetUrlQuerySection.includes("allowLegacyBridge") &&
    !assetUrlQuerySection.includes("ownerId: v.optional") &&
    assetUrlQuerySection.includes("requireResolvedOwner(ctx, undefined") &&
    assets.includes("requireConfiguredR2Bucket") &&
    assets.includes("isSafeCampaignAssetBucketName(bucket)") &&
    !assets.includes('bucket: process.env.R2_BUCKET ?? ""') &&
    assets.includes("campaignId: v.id(\"campaigns\")") &&
    assets.includes("validateCampaignAssetPolicy({") &&
    assets.includes("await assertCanUploadAsset(ctx, ownerId)") &&
    assets.includes("bucket: configuredBucket") &&
    assets.includes('status: "reserved"') &&
    assets.includes("uploadableCampaignAssetStatuses") &&
    assets.includes("metadataSyncableCampaignAssetStatuses") &&
    assets.includes('"reserved", "uploaded"') &&
    assets.includes('"reserved", "uploaded", "attached"') &&
    assets.includes("Upload asset chưa ở trạng thái được khai báo hợp lệ") &&
    assets.includes("Asset không ở trạng thái được đồng bộ metadata") &&
    assets.includes("Upload asset chưa được khai báo trước khi gửi lên R2") &&
    campaignAssetUploadHook.includes("generateUploadUrl = useMutation(api.assets.generateUploadUrl)") &&
    campaignAssetUploadHook.includes("uploadFileWithProgress") &&
    campaignAssetUploadHook.includes("syncUploadedAssetMetadata({ key })"),
  "R2 upload signed URLs must require campaign-scoped declared metadata and a reserved asset row before the browser can upload"
);
assert(
    assets.includes("ownedAssets.length !== 1") &&
    assets.includes("const safeKey = assertR2ObjectKey(key)") &&
    assets.includes("getOwnedAssetsByKey(ctx, userId, safeKey)") &&
    assets.includes("key: safeKey") &&
    assets.includes("const safeKey = assertR2ObjectKey(args.key)") &&
    assets.includes("await r2.getMetadata(ctx, safeKey)") &&
    assets.includes("rejectAmbiguousOwnedAssets") &&
    assets.includes("await rejectAmbiguousOwnedAssets(ctx, ownedAssets, now, {") &&
    assets.includes("rejectCampaignAssetAndScheduleObjectDelete") &&
    assets.includes("r2ObjectDeleteScheduledAt: now") &&
    assets.includes("r2ObjectDeleteReason: rejectedReason") &&
    assets.includes("const safeKey = normalizeR2ObjectKey(asset.key)") &&
    assets.includes("if (safeKey)") &&
    assets.includes("await r2.deleteObject(ctx, safeKey)") &&
    !assets.includes("await r2.deleteObject(ctx, asset.key)") &&
    schema.includes("r2ObjectDeleteScheduledAt: v.optional(v.number())") &&
    schema.includes("r2ObjectDeleteReason: v.optional(v.string())") &&
    assets.includes("bucket,") &&
    assets.includes("bucket !== configuredBucket || asset.bucket !== configuredBucket") &&
    assets.includes("Bucket R2 của upload không khớp cấu hình") &&
    assets.includes("clearCampaignHeroAssetIfCurrent") &&
    assets.includes("Key asset R2 không duy nhất cho owner") &&
    assets.includes("await clearCampaignHeroAssetIfCurrent(ctx, asset, now)") &&
    assets.includes("assertCampaignAssetBucketMatchesConfigured(asset)") &&
    assets.includes("Cần đăng nhập để đồng bộ metadata tài sản chiến dịch") &&
    assets.includes("for (const asset of ownedAssets)") &&
    read("convex/campaigns.ts").includes("rejectCampaignAssetAndScheduleObjectDelete") &&
    !assets.includes("for (const asset of assets)"),
  "R2 upload and metadata callbacks must handle missing, duplicate, malformed, and foreign-owner key rows deterministically, and schedule rejected R2 objects for deletion"
);
assert(
    read("convex/campaigns.ts").includes("getUniqueOwnedCampaignAssetByKey") &&
    read("convex/campaigns.ts").includes("getOwnedAssetsByKey") &&
    read("convex/campaigns.ts").includes("ownedAssets.length > 1") &&
    read("convex/campaigns.ts").includes("rejectAmbiguousOwnedAssets(ctx, ownedAssets, now, {})") &&
    read("convex/campaigns.ts").includes("Key asset R2 không duy nhất cho owner") &&
    read("convex/campaigns.ts").includes("getRenderableCampaignAssetUrl") &&
    !read("convex/campaigns.ts").includes("r2.getUrl") &&
    read("convex/campaigns.ts").includes("assertCampaignAssetBucketMatchesConfigured") &&
    read("convex/campaigns.ts").includes("isRenderableCampaignAsset") &&
    read("convex/campaigns.ts").includes("heroAssetCandidate.campaignId === campaign._id") &&
    schema.includes('.index("by_campaign_owner_status_createdAt", [') &&
    read("convex/campaigns.ts").includes("selectedCampaignId: v.optional(v.id(\"campaigns\"))") &&
    read("convex/campaigns.ts").includes("recentAssetsCampaignId") &&
    read("convex/campaigns.ts").includes('withIndex("by_campaign_owner_status_createdAt"') &&
    read("convex/campaigns.ts").includes('.eq("campaignId", recentAssetsCampaignId)') &&
    read("convex/campaigns.ts").includes('.eq("ownerId", ownerId)') &&
    read("convex/campaigns.ts").includes('.eq("status", "attached")') &&
    read("convex/campaigns.ts").includes("isRenderableCampaignAsset(asset, ownerId)") &&
    !section(read("convex/campaigns.ts"), "export const getWorkspace", "export const saveCampaign").includes('withIndex("by_owner_createdAt"') &&
    read("convex/campaigns.ts").includes("asset.campaignId !== campaign._id") &&
    !read("convex/campaigns.ts").includes("asset.campaignId && asset.campaignId !== campaign._id") &&
    read("convex/campaigns.ts").includes("Asset upload không thuộc chiến dịch này") &&
    read("convex/campaigns.ts").includes("attachableCampaignAssetStatuses") &&
    read("convex/campaigns.ts").includes('"reserved", "uploaded"') &&
    read("convex/campaigns.ts").includes('asset.status === "attached"') &&
    read("convex/campaigns.ts").includes('asset.status === "rejected"') &&
    read("convex/campaigns.ts").includes("Asset upload chưa ở trạng thái có thể gắn") &&
    read("convex/campaigns.ts").includes("heroAsset.campaignId !== campaign._id") &&
    read("convex/campaigns.ts").includes("Ảnh hero phải thuộc chiến dịch này") &&
    read("convex/campaigns.ts").includes("Hãy lưu chiến dịch trước khi gắn ảnh hero") &&
    read("convex/campaigns.ts").includes("!actualMetadata?.contentType || actualMetadata.size === undefined") &&
    read("convex/campaigns.ts").includes("Chưa đọc được metadata R2") &&
    read("convex/campaigns.ts").includes('metadataSource: "r2"') &&
    campaignAssetUploadHook.includes("pendingUploadedAsset") &&
    campaignAssetUploadHook.includes("handleRetryAttachUploadedAsset") &&
    campaignAssetsPanel.includes("Thử gắn lại") &&
    read("docs/admin-design-system.md").includes("Asset retry state") &&
    draw.includes("getRenderableCampaignAssetUrl") &&
    draw.includes("isRenderableCampaignAsset") &&
    draw.includes("campaignHeroAssetCandidate.campaignId === campaign._id") &&
    draw.includes("activeHeroAssetCandidate.campaignId === activeCampaign._id") &&
    draw.includes("session.campaignId\n      ? await getRenderableCampaignAssetUrl") &&
    draw.includes("session.campaignHeroAssetKeySnapshot,\n          session.campaignId") &&
    !draw.includes("getRenderableHeroAssetUrl"),
  "campaign attach, recent asset lists, draw hero rendering, and Campaign Studio retry UX must use R2-validated centralized asset ownership helpers"
);

assert(
    schema.includes('.index("by_campaign_guestName", ["campaignId", "guestNameNormalized"])') &&
    schema.includes('.index("by_campaign_owner_guestName", ["campaignId", "ownerId", "guestNameNormalized"])') &&
    schema.includes('.index("by_campaign_owner_status", ["campaignId", "ownerId", "status"])') &&
    schema.includes('.index("by_campaign_owner_status_delivery", [') &&
    schema.includes('.index("by_campaign_owner_guest_status", [') &&
    schema.includes('"guestNameNormalized"'),
  "campaign-scoped guest and delivery-aware pending-session indexes must exist"
);
assert(
  draw.includes("getCampaignGuestRedemption") &&
    draw.includes("getPendingCampaignGuestSession") &&
    draw.includes('withIndex("by_campaign_owner_guestName"') &&
    draw.includes('withIndex("by_campaign_owner_guest_status"') &&
    draw.includes('eq("guestNameNormalized", guestNameNormalized)') &&
    draw.includes('eq("status", "pending")') &&
    !section(draw, "async function getCampaignGuestRedemption", "async function getPendingCampaignGuestSession").includes("record.ownerId === ownerId"),
  "createSession must enforce campaign-scoped participant uniqueness with owner-indexed redemption and pending-session reads"
);
assert(
  draw.includes("countOpenPendingCampaignSessions") &&
    draw.includes('from "./drawSessionPolicy"') &&
    drawSessionPolicy.includes("PENDING_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes("async function listPendingCampaignSessionsByDelivery") &&
    drawSessionPolicy.includes('withIndex("by_campaign_owner_status_delivery"') &&
    drawSessionPolicy.includes('.eq("campaignId", campaignId)') &&
    drawSessionPolicy.includes('.eq("deliveryMode", deliveryMode)') &&
    draw.includes("pendingSessions.filter(isOpenPendingSession).length") &&
    draw.includes("availablePrizeUnits") &&
    draw.includes("function getPayablePrizeUnitCapacity") &&
    draw.includes("itemsByAscendingAmount") &&
    draw.includes("Math.floor(remainingBudget / item.amount)") &&
    draw.includes("openPendingCampaignSessions >= availablePrizeUnits") &&
    draw.includes("Không còn đủ phần thưởng cho các lượt rút đang chờ") &&
    section(draw, "export const createSession", "export const getPublicSession").includes("getPayableBudgetItems(") &&
    section(draw, "export const createSession", "export const getPublicSession").includes("getPayablePrizeUnitCapacity(availableItems, budget)") &&
    section(draw, "export const createSession", "export const getPublicSession").includes("Không còn mệnh giá nào phù hợp với ngân sách còn lại"),
  "createSession must not create more open campaign sessions than remaining prize units payable by cumulative budget, using delivery-aware campaign pending reads"
);
const createSessionAction = section(draw, "export const createSession", "export const getPublicSession");
assert(
	  createSessionAction.includes("ownerPin: v.string()") &&
	    createSessionAction.includes("const ownerPin = validatePin(args.ownerPin)") &&
	    createSessionAction.includes("verifyPinHash(ownerPin, owner.pinSalt, owner.pinHash)") &&
	    createSessionAction.includes("PIN host không đúng") &&
	    createSessionAction.includes("Host chưa thiết lập PIN") &&
	    !createSessionAction.includes("PIN chủ ví không đúng") &&
	    !createSessionAction.includes("Chủ ví chưa thiết lập PIN"),
	  "station and public-link session creation must still require the host operational PIN"
	);
assert(
  draw.includes("PENDING_STATION_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes("async function listPendingOwnerSessionsByDelivery") &&
    drawSessionPolicy.includes('withIndex("by_owner_status_delivery"') &&
    drawSessionPolicy.includes('q.eq("ownerId", ownerId).eq("status", "pending").eq("deliveryMode", deliveryMode)') &&
    createSessionAction.includes("listPendingOwnerSessionsByDelivery(") &&
    createSessionAction.includes("PENDING_STATION_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes('"station"') &&
    drawSessionPolicy.includes("undefined") &&
    !createSessionAction.includes('withIndex("by_owner_status"'),
  "createSession station-pending guard must use owner+status+delivery buckets while preserving legacy missing-delivery rows"
);
const drawBudgetItems = section(draw, "async function getAvailableBudgetItems", "async function getCampaignForSession");
const budgetItemsSchema = section(schema, "budgetItems: defineTable", "drawSessions: defineTable");
assert(
  budgetItemsSchema.includes('.index("by_campaign_owner_active", ["campaignId", "ownerId", "isActive"])') &&
    budgetItemsSchema.includes('.index("by_campaign_owner_amount", ["campaignId", "ownerId", "amount"])') &&
    budgetItemsSchema.includes('.index("by_owner_campaign_active", ["ownerId", "campaignId", "isActive"])') &&
    budgetItemsSchema.includes('.index("by_owner_campaign_amount", ["ownerId", "campaignId", "amount"])') &&
    drawBudgetItems.includes('withIndex("by_campaign_owner_active"') &&
    drawBudgetItems.includes('q.eq("campaignId", campaignId).eq("ownerId", ownerId).eq("isActive", true)') &&
    drawBudgetItems.includes('withIndex("by_owner_campaign_active"') &&
    drawBudgetItems.includes('q.eq("ownerId", ownerId).eq("campaignId", undefined).eq("isActive", true)') &&
    !drawBudgetItems.includes(".filter((item) => !item.campaignId)") &&
    !drawBudgetItems.includes("ownedCampaignItems.length > 0") &&
    !section(drawBudgetItems, "const items = campaignId", ": (await ctx.db").includes(
      ".filter((item) => item.ownerId === ownerId)"
    ),
  "draw budget item reads must use exact campaign+owner inventory indexes and exact legacy owner+missing-campaign fallback"
);
const drawBudgetLookup = section(draw, "async function getOwnerBudgetOrThrow", "async function getAvailableBudgetItems");
assert(
  drawBudgetLookup.includes("getCompletedOwnerBudgetForScope(ctx, ownerId, campaignId)") &&
    budgetScope.includes("export async function listOwnerBudgetsForScope") &&
    budgetScope.includes('withIndex("by_owner_campaign"') &&
    budgetScope.includes('q.eq("ownerId", ownerId).eq("campaignId", campaignId)') &&
    budgetScope.includes("export function getUniqueOwnerBudget") &&
    budgetScope.includes("budgets.length > 1") &&
    budgetScope.includes("Dữ liệu ngân sách bị trùng") &&
    budgetScope.includes("export async function getCompletedOwnerBudgetForScope") &&
    !budgetScope.includes('withIndex("by_owner"') &&
    !drawBudgetLookup.includes(".find((ownerBudget) => !ownerBudget.campaignId)") &&
    !drawBudgetLookup.includes("campaignBudget ??"),
  "draw budget lookup must require a unique campaign budget for campaign-scoped sessions and fail closed on duplicate owner+campaign budget rows"
);
const getCampaignForSession = section(
  draw,
  "async function getCampaignForSession",
  "async function getCampaignGuestRedemption"
);
assert(
  getCampaignForSession.includes('campaign.status !== "active"') &&
    getCampaignForSession.includes("Chỉ có chiến dịch đang chạy mới được tạo lượt rút"),
  "createSession must reject requested draft or archived campaigns instead of minting draw sessions for inactive campaigns"
);
assert(
  createSessionAction.includes("await assertPublicCodeRemainsUnambiguous(ctx, publicCode)") &&
    createSessionAction.indexOf("await ctx.db.insert(\"drawSessions\"") <
      createSessionAction.indexOf("await assertPublicCodeRemainsUnambiguous(ctx, publicCode)") &&
    createSessionAction.indexOf("await assertPublicCodeRemainsUnambiguous(ctx, publicCode)") <
      createSessionAction.indexOf("await recordSessionCreated"),
  "createSession must re-check link publicCode ambiguity after insert before returning a public claim link"
);
assert(
  getCampaignForSession.includes("visibleCampaigns") &&
    draw.includes("getPreferredActiveCampaignForOwner(ctx, ownerId)") &&
    campaignIdentity.includes("export const visibleCampaignStatuses = [\"active\", \"draft\"] as const") &&
    campaignIdentity.includes("export async function listVisibleCampaignsForOwner") &&
    getCampaignForSession.includes("listVisibleCampaignsForOwner(ctx, ownerId)") &&
    !getCampaignForSession.includes('campaign.status !== "archived"') &&
    getCampaignForSession.includes("visibleCampaigns.length > 0") &&
    getCampaignForSession.includes("Hãy kích hoạt một chiến dịch trước khi tạo lượt rút") &&
    getCampaignForSession.indexOf("visibleCampaigns.length > 0") <
      getCampaignForSession.indexOf("await assertCanCreateCampaign"),
  "createSession fallback must not create a new default campaign when the owner already has visible draft campaigns"
);
const findPendingLinkSession = section(
  draw,
  "async function findPendingLinkSessionByPublicCode",
  "async function generateUniquePublicCode"
);
assert(
  findPendingLinkSession.includes("const campaign = session.campaignId ? await ctx.db.get(session.campaignId) : null") &&
    findPendingLinkSession.includes('campaign.status !== "active"') &&
    findPendingLinkSession.includes("return null"),
  "public claim lookup and redemption must fail closed when the linked campaign is no longer active"
);
const stationState = section(draw, "export const getStationState", "export const createSession");
assert(
  !createSessionAction.includes("allowLegacyBridge") &&
    !createSessionAction.includes("ownerId: v.optional") &&
    createSessionAction.includes("requireResolvedOwner(ctx, undefined") &&
    !stationState.includes("allowLegacyBridge") &&
    !stationState.includes("ownerId: v.optional") &&
    stationState.includes("requireResolvedOwner(ctx, undefined") &&
    !section(draw, "export const cancelSession", "export const redeem").includes("allowLegacyBridge") &&
    !section(draw, "export const cancelSession", "export const redeem").includes("ownerId: v.optional") &&
    section(draw, "export const cancelSession", "export const redeem").includes("requireResolvedOwner(ctx, undefined") &&
    !section(draw, "export const redeem", "export const redeemPublicSession").includes("allowLegacyBridge") &&
    !section(draw, "export const redeem", "export const redeemPublicSession").includes("ownerId: v.optional") &&
    section(draw, "export const redeem", "export const redeemPublicSession").includes("requireResolvedOwner(ctx, undefined"),
  "station draw host operations must derive owner from Convex Auth without client ownerId args"
);
assert(
  stationState.includes("listPendingOwnerSessionsByDelivery(ctx, ownerId)") &&
    stationState.includes("isPendingLinkSession(session)") &&
    stationState.includes("isStationSession") &&
    !stationState.includes('.query("drawSessions")'),
  "station state pending session reads must use owner+status+delivery buckets for station and public-link rows"
);
assert(
  stationState.includes('withIndex("by_campaign_owner_amount"') &&
    stationState.includes('q.eq("campaignId", stationCampaignId).eq("ownerId", ownerId)') &&
    stationState.includes('withIndex("by_owner_campaign_amount"') &&
    stationState.includes('q.eq("ownerId", ownerId).eq("campaignId", undefined)') &&
    !stationState.includes("item.ownerId === ownerId"),
  "station state inventory reads must use campaign+owner indexes and exact legacy owner+missing-campaign fallback"
);
assert(
    draw.includes("stationSessionCampaignView") &&
    draw.includes("session.campaignHeroAssetKeySnapshot") &&
    stationSessionCampaignView.includes("const hasSnapshot = hasSessionCampaignSnapshot(session)") &&
    stationSessionCampaignView.includes("!hasSnapshot &&") &&
    stationSessionCampaignView.includes("hasSnapshot\n      ? session.campaignClaimHeadlineSnapshot ?? null") &&
    stationState.includes("const pendingSessionCandidate =") &&
    stationState.includes("pendingSessionCampaignCandidate") &&
    stationState.includes("pendingSessionCandidate?.campaignId") &&
    stationState.includes("pendingSessionCampaignCandidate.ownerId === ownerId") &&
    stationState.includes('pendingSessionCampaignCandidate.status === "active"') &&
    stationState.includes("stationCampaignId = pendingSession?.campaignId ?? activeCampaignId") &&
    stationState.includes("const availableUnits = budget ? getPayablePrizeUnitCapacity(budgetItems, budget) : 0") &&
    stationState.includes("pendingSessionRewardPool") &&
    stationState.includes("pendingSessionBudget") &&
    stationState.includes("getPayableBudgetItems(") &&
    stationState.includes("campaign: pendingSessionCampaign") &&
    stationState.includes("rewardPool: pendingSessionRewardPool") &&
    drawRoute.includes("activePendingSession") &&
    drawRoute.includes("guestCampaign") &&
    drawRoute.includes("guestRewardPool") &&
    drawRoute.includes("guestRewardPoolReady") &&
    drawRoute.includes("pendingSession.campaign") &&
    drawRoute.includes("pendingSession.rewardPool") &&
    drawRoute.includes("canStart={guestRewardPoolReady}") &&
    drawRoute.includes("disabled={loading || !guestRewardPoolReady}") &&
    !drawRoute.includes("stationState.budgetItems.map((item) =>") &&
    !drawRoute.includes("stationState.activeCampaign?.claimHeadline"),
  "station guest mode must render only active owned campaign pending sessions, using session campaign snapshots and session-scoped reward pool instead of mutable activeCampaign"
);
const leaderboard = read("convex/leaderboard.ts");
assert(
  leaderboard.includes("getCampaignLeaderboard") &&
    leaderboard.includes("getCampaignHistory") &&
    leaderboard.includes("requireOwnedCampaign") &&
    leaderboard.includes("Không tìm thấy host") &&
    !leaderboard.includes("Không tìm thấy chủ ví"),
  "leaderboard APIs must include owner-gated campaign-scoped views"
);
assert(
  !section(leaderboard, "export const getOwnerLeaderboard", "export const getCampaignLeaderboard").includes("allowLegacyBridge") &&
    !section(leaderboard, "export const getOwnerLeaderboard", "export const getCampaignLeaderboard").includes("ownerId: v.optional") &&
    section(leaderboard, "export const getOwnerLeaderboard", "export const getCampaignLeaderboard").includes("requireResolvedOwner(ctx, undefined") &&
    !section(leaderboard, "export const getCampaignLeaderboard", "export const getOwnerHistory").includes("allowLegacyBridge") &&
    !section(leaderboard, "export const getCampaignLeaderboard", "export const getOwnerHistory").includes("ownerId: v.optional") &&
    section(leaderboard, "export const getCampaignLeaderboard", "export const getOwnerHistory").includes("requireResolvedOwner(ctx, undefined") &&
    !section(leaderboard, "export const getOwnerHistory", "export const getCampaignHistory").includes("allowLegacyBridge") &&
    !section(leaderboard, "export const getOwnerHistory", "export const getCampaignHistory").includes("ownerId: v.optional") &&
    section(leaderboard, "export const getOwnerHistory", "export const getCampaignHistory").includes("requireResolvedOwner(ctx, undefined") &&
    !tailSection(leaderboard, "export const getCampaignHistory").includes("allowLegacyBridge") &&
    !tailSection(leaderboard, "export const getCampaignHistory").includes("ownerId: v.optional") &&
    tailSection(leaderboard, "export const getCampaignHistory").includes("requireResolvedOwner(ctx, undefined"),
  "leaderboard/history APIs must derive owner from Convex Auth without client ownerId args"
);
assert(
  schema.includes('.index("by_campaign_owner_amount", ["campaignId", "ownerId", "amount"])') &&
    schema.includes('.index("by_campaign_owner_createdAt", ["campaignId", "ownerId", "createdAt"])') &&
    leaderboard.includes('withIndex("by_campaign_owner_amount"') &&
    leaderboard.includes('q.eq("campaignId", args.campaignId).eq("ownerId", ownerId)') &&
    leaderboard.includes('withIndex("by_campaign_owner_createdAt"') &&
    !section(leaderboard, "export const getCampaignLeaderboard", "export const getOwnerHistory").includes(".filter((item) => item.ownerId === ownerId)") &&
    !section(leaderboard, "export const getCampaignHistory", "});").includes(".filter((item) => item.ownerId === ownerId)"),
  "campaign leaderboard/history must query by campaign and owner before applying ordered limits"
);

const analytics = read("convex/analytics.ts");
const analyticsPolicy = read("lib/analyticsPolicy.ts");
const migrationToken = read("convex/migrationToken.ts");
const migrationTokenPolicy = read("lib/migrationTokenPolicy.ts");
assert(
  !section(analytics, "export const getOwnerAnalytics", "export const backfillOwnerRedemptionAggregate").includes("allowLegacyBridge") &&
    !section(analytics, "export const getOwnerAnalytics", "export const backfillOwnerRedemptionAggregate").includes("ownerId: v.optional") &&
    section(analytics, "export const getOwnerAnalytics", "export const backfillOwnerRedemptionAggregate").includes("requireResolvedOwner(ctx, undefined") &&
    !section(analytics, "export const getCampaignAnalytics", "export const backfillCampaignAnalytics").includes("allowLegacyBridge") &&
    !section(analytics, "export const getCampaignAnalytics", "export const backfillCampaignAnalytics").includes("ownerId: v.optional") &&
    section(analytics, "export const getCampaignAnalytics", "export const backfillCampaignAnalytics").includes("requireResolvedOwner(ctx, undefined"),
  "analytics reporting queries must derive owner from Convex Auth without client ownerId args"
);
assert(
  migrationToken.includes("from \"../lib/migrationTokenPolicy\"") &&
    migrationTokenPolicy.includes('"LI_XI_MIGRATION_TOKEN"') &&
    migrationTokenPolicy.includes('"LIXI_MIGRATION_TOKEN"') &&
    migrationTokenPolicy.includes("hasProductionSecretShape") &&
    migrationTokenPolicy.includes("timingSafeEqual") &&
    migrationTokenPolicy.includes("configuredMigrationTokenName") &&
    migrationTokenPolicy.includes("env[name] !== undefined") &&
    migrationTokenPolicy.includes("isConfiguredMigrationTokenProductionSafe") &&
    migrationTokenPolicy.includes("timingSafeEqual(value?.trim(), token)") &&
    migrationTokenPolicy.includes("isValidMigrationToken") &&
    read("scripts/test-migration-token-policy.mjs").includes('LI_XI_MIGRATION_TOKEN: "   "') &&
	    read("scripts/test-migration-token-policy.mjs").includes("isMigrationTokenConfigured(), true") &&
	    read("scripts/test-migration-token-policy.mjs").includes("isConfiguredMigrationTokenProductionSafe(), false"),
  "migration token helper must accept canonical and legacy env names while requiring production-safe token shape and treating blank configured envs as unsafe, not disabled"
);
assert(
  analytics.includes("normalizeBackfillLimit") &&
    analytics.includes("limit phải là số nguyên dương"),
  "analytics backfills must validate positive limits"
);
assert(
  analytics.includes("requireAnalyticsBackfillOwner") &&
    analytics.includes("getAuthUserId(ctx)") &&
    analytics.includes("isValidMigrationToken(migrationToken)") &&
    analytics.includes("migrationTokenEnvNames.join") &&
    analytics.includes("migrationToken: v.optional(v.string())") &&
    analytics.includes("dryRun: v.optional(v.boolean())") &&
    analytics.includes("async function wouldRecordAnalyticsCounterEvent") &&
    analytics.includes("ownerId là bắt buộc khi backfill analytics bằng migration token"),
  "analytics backfills must require authenticated ownership or a configured migration token and support dry-run"
);
assert(
  analytics.includes("session?.ownerId === ownerId && session.campaignId === args.campaignId"),
  "campaign analytics backfill must only patch redemptions for the requested owned campaign"
);
const analyticsDryRunEstimate = tailSection(
  analyticsPolicy,
  "export function estimateAnalyticsCounterEventWrite"
);
assert(
  analyticsDryRunEstimate.includes("markerWouldInsert") &&
    analyticsDryRunEstimate.includes("markerWouldPatch") &&
    analyticsDryRunEstimate.includes("ownerCounterWouldIncrement") &&
    analyticsDryRunEstimate.includes("campaignCounterWouldIncrement") &&
    analyticsDryRunEstimate.includes("counterIncrementsWouldBackfill") &&
    !analyticsDryRunEstimate.includes("ctx.db.insert") &&
    !analyticsDryRunEstimate.includes("ctx.db.patch") &&
    !analyticsDryRunEstimate.includes("ownerCounters.inc") &&
    analytics.includes("estimateAnalyticsCounterEventWrite({") &&
    analyticsPolicyTest.includes("owner-only legacy markers should upgrade to campaign scope without incrementing owner twice") &&
    analyticsPolicyTest.includes("reruns for the same campaign-scoped marker should not count again") &&
    analyticsPolicyTest.includes("owner backfill reruns should not downgrade existing campaign-scoped markers"),
  "analytics dry-run counter estimate helper must return explicit write estimates without mutating markers or counters"
);
const campaignAnalyticsBackfill = section(
  analytics,
  "export const backfillCampaignAnalytics",
  "  },\n});"
);
assert(
  schema.includes('.index("by_campaign_owner_createdAt", ["campaignId", "ownerId", "createdAt"])') &&
    campaignAnalyticsBackfill.includes("const campaignRedemptions = await ctx.db") &&
    campaignAnalyticsBackfill.includes('withIndex("by_campaign_owner_createdAt"') &&
    campaignAnalyticsBackfill.includes('q.eq("campaignId", args.campaignId).eq("ownerId", ownerId)') &&
    campaignAnalyticsBackfill.includes("const legacyOwnerRedemptions = await ctx.db") &&
    campaignAnalyticsBackfill.includes("if (redemption.campaignId)") &&
    campaignAnalyticsBackfill.includes("const dryRun = args.dryRun ?? false") &&
    campaignAnalyticsBackfill.includes("if (dryRun)") &&
    campaignAnalyticsBackfill.includes("if (!dryRun && targetRedemption.campaignId === args.campaignId)") &&
    campaignAnalyticsBackfill.includes("redemptionsWouldPatchCampaign") &&
    campaignAnalyticsBackfill.includes("redemptionAggregatesWouldBackfill") &&
    campaignAnalyticsBackfill.includes("redemptionCountersWouldBackfill") &&
    campaignAnalyticsBackfill.includes("redemptionCounterEventsWouldBackfill") &&
    campaignAnalyticsBackfill.includes("redemptionCounterIncrementsWouldBackfill") &&
    campaignAnalyticsBackfill.includes("sessionCountersWouldBackfill") &&
    campaignAnalyticsBackfill.includes("sessionCounterEventsWouldBackfill") &&
    campaignAnalyticsBackfill.includes("sessionCounterIncrementsWouldBackfill") &&
    campaignAnalyticsBackfill.includes("wouldRecordAnalyticsCounterEvent") &&
    campaignAnalyticsBackfill.includes("counterEstimate.eventWouldBackfill") &&
    campaignAnalyticsBackfill.includes("counterEstimate.counterIncrementsWouldBackfill") &&
    campaignAnalyticsBackfill.includes("campaignRedemptions.length + legacyOwnerRedemptions.length") &&
    !section(
      campaignAnalyticsBackfill,
      "const sessions = await ctx.db",
      "for (const session of sessions)"
    ).includes('withIndex("by_owner_createdAt"'),
  "campaign analytics backfill must use campaign+owner indexes for linked redemptions and sessions while only scanning owner history for legacy unscoped redemptions"
);
const ownerAnalyticsBackfill = section(
  analytics,
  "export const backfillOwnerRedemptionAggregate",
  "export const getCampaignAnalytics"
);
assert(
    ownerAnalyticsBackfill.includes("redemptionsScanned") &&
    ownerAnalyticsBackfill.includes("sessionsScanned") &&
    ownerAnalyticsBackfill.includes("const dryRun = args.dryRun ?? false") &&
    ownerAnalyticsBackfill.includes("if (dryRun)") &&
    ownerAnalyticsBackfill.includes("redemptionAggregatesWouldBackfill") &&
    ownerAnalyticsBackfill.includes("campaignRedemptionAggregatesWouldBackfill") &&
    ownerAnalyticsBackfill.includes("redemptionCountersWouldBackfill") &&
    ownerAnalyticsBackfill.includes("redemptionCounterEventsWouldBackfill") &&
    ownerAnalyticsBackfill.includes("redemptionCounterIncrementsWouldBackfill") &&
    ownerAnalyticsBackfill.includes("sessionCountersWouldBackfill") &&
    ownerAnalyticsBackfill.includes("sessionCounterEventsWouldBackfill") &&
    ownerAnalyticsBackfill.includes("sessionCounterIncrementsWouldBackfill") &&
    ownerAnalyticsBackfill.includes("wouldRecordAnalyticsCounterEvent") &&
    ownerAnalyticsBackfill.includes("counterEstimate.eventWouldBackfill") &&
    ownerAnalyticsBackfill.includes("counterEstimate.counterIncrementsWouldBackfill") &&
    analytics.includes("async function ownedCampaignIdOrUndefined") &&
    analytics.includes("campaign?.ownerId === ownerId ? campaign._id : undefined") &&
    ownerAnalyticsBackfill.includes("const ownedCampaignId = await ownedCampaignIdOrUndefined(") &&
    ownerAnalyticsBackfill.includes("campaignId: ownedCampaignId") &&
    ownerAnalyticsBackfill.includes("redemptionAggregatesBackfilled") &&
    ownerAnalyticsBackfill.includes("campaignRedemptionAggregatesBackfilled") &&
    ownerAnalyticsBackfill.includes("await redemptionsByCampaignAmount.insertIfDoesNotExist(ctx,") &&
    ownerAnalyticsBackfill.includes("campaignId: ownedCampaignId") &&
    ownerAnalyticsBackfill.includes("redemptionCountersBackfilled") &&
    ownerAnalyticsBackfill.includes("sessionCountersBackfilled") &&
    ownerAnalyticsBackfill.includes("recordAnalyticsCounterEvent") &&
    ownerAnalyticsBackfill.includes("redemptionCounterEventKey(redemption._id)") &&
    ownerAnalyticsBackfill.includes("sessionCounterEventKey(session._id)") &&
    ownerAnalyticsBackfill.includes('source: "backfill"'),
  "owner analytics backfill must repair owner and owned-campaign Aggregate totals plus idempotent Sharded Counter events without writing campaign state for foreign campaign references"
);
assert(
  analytics.includes("export async function countOwnerRedemptions") &&
    analytics.includes("redemptionsByOwnerAmount.count(ctx, { namespace: ownerId })"),
  "owner redemption count must be exposed from the Aggregate component for SaaS usage reads"
);
assert(
  read("convex/schema.ts").includes("analyticsCounterEvents") &&
    read("convex/schema.ts").includes('metric: v.union(v.literal("session_created"), v.literal("redemption_created"))') &&
    analytics.includes("recordAnalyticsCounterEvent") &&
    analytics.includes("analyticsCounterEvents") &&
    analytics.includes('withIndex("by_eventKey"') &&
    analyticsPolicy.includes("function assertNonEmptyAnalyticsId") &&
    analyticsPolicy.includes("ownerId analytics không được rỗng") &&
    analyticsPolicy.includes("campaignId analytics không được rỗng") &&
    analyticsPolicy.includes("sessionId analytics không được rỗng") &&
    analyticsPolicy.includes("redemptionId analytics không được rỗng") &&
    analyticsPolicyTest.includes("ownerId analytics không được rỗng") &&
    analyticsPolicyTest.includes("campaignId analytics không được rỗng") &&
    analyticsPolicyTest.includes("sessionId analytics không được rỗng") &&
    analyticsPolicyTest.includes("redemptionId analytics không được rỗng") &&
    analyticsPolicy.includes("trimmedValue !== value") &&
    analyticsPolicy.includes("ownerId analytics không được chứa khoảng trắng ở đầu/cuối") &&
    analyticsPolicy.includes("campaignId analytics không được chứa khoảng trắng ở đầu/cuối") &&
    analyticsPolicyTest.includes("ownerId analytics không được chứa khoảng trắng ở đầu\\/cuối") &&
    analyticsPolicyTest.includes("campaignId analytics không được chứa khoảng trắng ở đầu\\/cuối") &&
    analyticsPolicyTest.includes("sessionId analytics không được chứa khoảng trắng ở đầu\\/cuối") &&
    analyticsPolicyTest.includes("redemptionId analytics không được chứa khoảng trắng ở đầu\\/cuối") &&
    analyticsPolicy.includes("existingEvent.ownerId !== args.ownerId || existingEvent.metric !== args.metric") &&
    analyticsPolicy.includes("Analytics event không khớp owner hoặc metric") &&
    analyticsPolicy.includes("existingEvent.campaignId") &&
    analyticsPolicy.includes("Analytics event đã thuộc chiến dịch khác") &&
    analytics.includes("await ctx.db.patch(existingEvent._id") &&
    analytics.includes("await ownerCounters.inc(ctx, campaignMetricKey(args.campaignId!, args.metric))") &&
    analytics.includes("sessionCounterEventKey") &&
    analytics.includes("redemptionCounterEventKey") &&
    analyticsPolicy.includes("export function sessionCounterEventKey") &&
    analyticsPolicy.includes("export function redemptionCounterEventKey") &&
    analytics.includes('source: "live"') &&
    analytics.includes('source: "backfill"') &&
    analytics.includes("redemptionCountersBackfilled") &&
    analytics.includes("sessionCountersBackfilled"),
  "analytics sharded-counter events must be idempotently marked and backfilled for campaign sessions/redemptions"
);

const migrations = read("convex/migrations.ts");
const crons = read("convex/crons.ts");
assert(
  migrations.includes("isValidMigrationToken(migrationToken)") &&
    migrations.includes("migrationTokenEnvNames.join") &&
    migrations.includes("migrationToken: v.optional(v.string())") &&
    migrations.includes("async function requireMigrationOwner") &&
    migrations.includes("ownerId là bắt buộc khi chạy migration bằng token") &&
    !migrations.includes("allowLegacyBridge") &&
    !migrations.includes("requireResolvedOwner(ctx, args.ownerId"),
  "migration maintenance must accept only authenticated access or a configured migration token alias without depending on the legacy owner bridge"
);
const expiredPublicLinkCleanup = section(
  migrations,
  "export const cleanupExpiredPublicLinks",
  "export const repairHostProfileDefaultCampaign"
);
const expiredPublicLinkCleanupHelpers = section(
  migrations,
  "async function listPendingPublicLinkCleanupCandidates",
  "async function listReservedAssetCleanupCandidates"
);
const expiredPublicLinkCleanupWithoutBooleanPublicCode = expiredPublicLinkCleanup.replaceAll(
  "Boolean(session.publicCode)",
  ""
);
assert(
    expiredPublicLinkCleanup.includes("requireMigrationOwner(ctx, args.ownerId, args.migrationToken") &&
    schema.includes('.index("by_owner_status_delivery_createdAt"') &&
    schema.includes('.index("by_status_delivery_createdAt", ["status", "deliveryMode", "createdAt"])') &&
    expiredPublicLinkCleanupHelpers.includes('withIndex("by_owner_status_delivery_createdAt"') &&
    expiredPublicLinkCleanupHelpers.includes('withIndex("by_status_delivery_createdAt"') &&
    expiredPublicLinkCleanupHelpers.includes('q.eq("ownerId", ownerId).eq("status", "pending").eq("deliveryMode", deliveryMode)') &&
    expiredPublicLinkCleanupHelpers.includes('q.eq("status", "pending").eq("deliveryMode", deliveryMode)') &&
    expiredPublicLinkCleanupHelpers.includes('(["link", undefined] as const)') &&
    expiredPublicLinkCleanupHelpers.includes('.order("asc")') &&
    expiredPublicLinkCleanupHelpers.includes("sortByCreatedAtThenId(pendingLinkBuckets.flat()).slice(0, limit)") &&
    expiredPublicLinkCleanupHelpers.includes("resolvePublicLinkExpiresAt(session)") &&
    expiredPublicLinkCleanupHelpers.includes("isExpiredPendingLinkSession(session, now)") &&
    expiredPublicLinkCleanupHelpers.includes("sessionDecisions") &&
    expiredPublicLinkCleanupHelpers.includes('action: "keep"') &&
    expiredPublicLinkCleanupHelpers.includes('action: "cancel"') &&
    expiredPublicLinkCleanupHelpers.includes("sessionId: session._id") &&
    expiredPublicLinkCleanupHelpers.includes("hasPublicCode: Boolean(session.publicCode)") &&
    expiredPublicLinkCleanupHelpers.includes("campaignId: session.campaignId ?? null") &&
    expiredPublicLinkCleanupHelpers.includes("resolvedPublicCodeExpiresAt") &&
    !/session\.publicCode(?!ExpiresAt)/.test(expiredPublicLinkCleanupWithoutBooleanPublicCode) &&
    !expiredPublicLinkCleanup.includes("publicCode:") &&
    expiredPublicLinkCleanupHelpers.includes("if (!dryRun)") &&
    expiredPublicLinkCleanupHelpers.includes('status: "cancelled"') &&
    expiredPublicLinkCleanupHelpers.includes("cancelledAt: now") &&
    migrations.includes("export const cleanupExpiredPublicLinksCron = internalMutation") &&
    migrations.includes("SCHEDULED_PUBLIC_LINK_CLEANUP_LIMIT") &&
    crons.includes('crons.hourly(') &&
    crons.includes('"cleanup expired public claim links"') &&
    crons.includes("internal.migrations.cleanupExpiredPublicLinksCron"),
  "expired public link cleanup must be owner-authorized, migration-gated, indexed by delivery bucket, globally cap merged candidates, dry-runnable, return redacted session-level audit decisions, and only cancel expired link sessions"
);
const hostDefaultCampaignRepair = tailSection(migrations, "export const repairHostProfileDefaultCampaign");
assert(
  hostDefaultCampaignRepair.includes("requireMigrationOwner(ctx, args.ownerId, args.migrationToken") &&
    hostDefaultCampaignRepair.includes("getHostProfileForOwner(ctx, ownerId)") &&
    hostDefaultCampaignRepair.includes('defaultCampaign.status !== "archived"') &&
    hostDefaultCampaignRepair.includes("getVisibleDefaultReplacementCampaignId(ctx, ownerId)") &&
    hostDefaultCampaignRepair.includes("profileDecision") &&
    hostDefaultCampaignRepair.includes('reason: "missing_profile"') &&
    hostDefaultCampaignRepair.includes('reason: "no_default_campaign"') &&
    hostDefaultCampaignRepair.includes('reason: "valid_default"') &&
    hostDefaultCampaignRepair.includes('"missing_default"') &&
    hostDefaultCampaignRepair.includes('"foreign_default"') &&
    hostDefaultCampaignRepair.includes('"archived_default"') &&
    hostDefaultCampaignRepair.includes('action: replacementCampaignId === null ? "clear" : "replace"') &&
    hostDefaultCampaignRepair.includes("previousDefaultCampaignId: profile.defaultCampaignId") &&
    hostDefaultCampaignRepair.includes("if (!args.dryRun)") &&
    hostDefaultCampaignRepair.includes("defaultCampaignId: replacementCampaignId ?? undefined") &&
    hostDefaultCampaignRepair.includes("clearedInvalidDefaultCampaign: replacementCampaignId === null"),
  "host profile default campaign repair must be owner-authorized, migration-gated, dry-runnable, return profile audit decisions, reject archived/foreign/missing defaults, and clear or replace them"
);
const duplicateHostProfileRepair = tailSection(migrations, "export const repairDuplicateHostProfiles");
assert(
  duplicateHostProfileRepair.includes("requireMigrationOwner(ctx, args.ownerId, args.migrationToken") &&
    duplicateHostProfileRepair.includes('withIndex("by_owner"') &&
    duplicateHostProfileRepair.includes('q.eq("ownerId", ownerId)') &&
    duplicateHostProfileRepair.includes("sortHostProfilesByRecency(profiles)") &&
    duplicateHostProfileRepair.includes("duplicateProfilesDeleted") &&
    duplicateHostProfileRepair.includes("profileDecisions") &&
    duplicateHostProfileRepair.includes('action: "delete"') &&
    duplicateHostProfileRepair.includes("defaultCampaignId: profile.defaultCampaignId ?? null") &&
    duplicateHostProfileRepair.includes("onboardingCompleted: profile.onboardingCompleted") &&
    duplicateHostProfileRepair.includes("if (!args.dryRun)") &&
    duplicateHostProfileRepair.includes("ctx.db.delete(duplicateProfile._id)") &&
    duplicateHostProfileRepair.includes("keptProfileId"),
  "duplicate host profile repair must be owner-authorized, migration-gated, dry-runnable, scan one owner, keep the newest profile, return profile-level audit decisions, and delete duplicates only on apply"
);
const ownerActiveCampaignRepair = tailSection(migrations, "export const repairOwnerActiveCampaigns");
assert(
  ownerActiveCampaignRepair.includes("requireMigrationOwner(ctx, args.ownerId, args.migrationToken") &&
    ownerActiveCampaignRepair.includes('withIndex("by_owner_status"') &&
    ownerActiveCampaignRepair.includes('q.eq("ownerId", ownerId).eq("status", "active")') &&
    ownerActiveCampaignRepair.includes("selectKeptActiveCampaign(") &&
    ownerActiveCampaignRepair.includes("profile?.defaultCampaignId") &&
    ownerActiveCampaignRepair.includes("campaignDecisions") &&
    ownerActiveCampaignRepair.includes('"demote"') &&
    ownerActiveCampaignRepair.includes("defaultSelected: profile?.defaultCampaignId === campaign._id") &&
    ownerActiveCampaignRepair.includes("profileDecision") &&
    ownerActiveCampaignRepair.includes("previousDefaultCampaignId: profile.defaultCampaignId ?? null") &&
    ownerActiveCampaignRepair.includes("nextDefaultCampaignId: keptActiveCampaign._id") &&
    ownerActiveCampaignRepair.includes('"point_to_kept_campaign"') &&
    ownerActiveCampaignRepair.includes('"skip_no_profile"') &&
    ownerActiveCampaignRepair.includes("if (!args.dryRun)") &&
    ownerActiveCampaignRepair.includes('status: "draft"') &&
    ownerActiveCampaignRepair.includes("activeCampaignsDemoted") &&
    ownerActiveCampaignRepair.includes("keptActiveCampaignId"),
  "owner active campaign repair must be owner-authorized, migration-gated, dry-runnable, indexed by active status, return campaign/profile audit decisions, and demote extra active rows deterministically"
);
const duplicateOwnerBudgetRepair = tailSection(migrations, "export const repairDuplicateOwnerBudgets");
assert(
  duplicateOwnerBudgetRepair.includes("requireMigrationOwner(ctx, args.ownerId, args.migrationToken") &&
    duplicateOwnerBudgetRepair.includes('withIndex("by_owner"') &&
    duplicateOwnerBudgetRepair.includes('q.eq("ownerId", ownerId)') &&
    duplicateOwnerBudgetRepair.includes("budgetScopeKey(budget)") &&
    duplicateOwnerBudgetRepair.includes("sortBudgetsByRecency(scopedBudgets)") &&
    duplicateOwnerBudgetRepair.includes("duplicateBudgetScopes") &&
    duplicateOwnerBudgetRepair.includes("duplicateBudgetsDeleted") &&
    duplicateOwnerBudgetRepair.includes("budgetDecisions") &&
    duplicateOwnerBudgetRepair.includes('action: "delete"') &&
    duplicateOwnerBudgetRepair.includes("totalBudget: duplicateBudget.totalBudget") &&
    duplicateOwnerBudgetRepair.includes("remainingBudget: duplicateBudget.remainingBudget") &&
    duplicateOwnerBudgetRepair.includes("campaignId: duplicateBudget.campaignId ?? null") &&
    duplicateOwnerBudgetRepair.includes("if (!args.dryRun)") &&
    duplicateOwnerBudgetRepair.includes("ctx.db.delete(duplicateBudget._id)"),
  "duplicate owner budget repair must be owner-authorized, migration-gated, dry-runnable, scan one owner, keep the newest scoped budget, return budget-level audit decisions, and delete duplicate rows only on apply"
);
const staleReservedAssetCleanup = tailSection(migrations, "export const cleanupStaleReservedAssets");
const staleReservedAssetCleanupHelpers = tailSection(
  migrations,
  "async function listReservedAssetCleanupCandidates"
);
assert(
  staleReservedAssetCleanup.includes("requireMigrationOwner(ctx, args.ownerId, args.migrationToken") &&
    schema.includes('.index("by_owner_status_createdAt", ["ownerId", "status", "createdAt"])') &&
    schema.includes('.index("by_status_createdAt", ["status", "createdAt"])') &&
    staleReservedAssetCleanupHelpers.includes('withIndex("by_owner_status_createdAt"') &&
    staleReservedAssetCleanupHelpers.includes('withIndex("by_status_createdAt"') &&
    staleReservedAssetCleanupHelpers.includes('q.eq("ownerId", ownerId).eq("status", "reserved")') &&
    staleReservedAssetCleanupHelpers.includes('q.eq("status", "reserved")') &&
    staleReservedAssetCleanupHelpers.includes('.order("asc")') &&
    staleReservedAssetCleanupHelpers.includes("DEFAULT_STALE_RESERVED_ASSET_AGE_MS") &&
    staleReservedAssetCleanupHelpers.includes("asset.createdAt > cutoff") &&
    staleReservedAssetCleanupHelpers.includes("assetDecisions") &&
    staleReservedAssetCleanupHelpers.includes('action: "keep"') &&
    staleReservedAssetCleanupHelpers.includes('action: "reject"') &&
    staleReservedAssetCleanupHelpers.includes("assetId: asset._id") &&
    staleReservedAssetCleanupHelpers.includes("bucket: asset.bucket") &&
    staleReservedAssetCleanupHelpers.includes("key: asset.key") &&
    staleReservedAssetCleanupHelpers.includes("campaignId: asset.campaignId ?? null") &&
    staleReservedAssetCleanupHelpers.includes("ageMs") &&
    staleReservedAssetCleanupHelpers.includes("if (!dryRun)") &&
    staleReservedAssetCleanupHelpers.includes("rejectCampaignAssetAndScheduleObjectDelete(") &&
    staleReservedAssetCleanupHelpers.includes("Asset upload reservation expired before R2 upload completed") &&
    migrations.includes("export const cleanupStaleReservedAssetsCron = internalMutation") &&
    migrations.includes("SCHEDULED_STALE_ASSET_CLEANUP_LIMIT") &&
    crons.includes('"cleanup stale campaign asset reservations"') &&
    crons.includes("internal.migrations.cleanupStaleReservedAssetsCron"),
  "stale reserved asset cleanup must be owner-authorized, migration-gated, indexed by reserved status, dry-runnable, return asset-level audit decisions, and reject only old upload reservations"
);
assert(
	    read("README.md").includes("migrations:cleanupExpiredPublicLinks") &&
	    read("README.md").includes("migrations:repairHostProfileDefaultCampaign") &&
	    read("README.md").includes("migrations:repairDuplicateHostProfiles") &&
	    read("README.md").includes("migrations:repairOwnerActiveCampaigns") &&
	    read("README.md").includes("migrations:repairDuplicateOwnerBudgets") &&
	    read("README.md").includes("migrations:cleanupStaleReservedAssets") &&
	    read("docs/saas-standardization.md").includes("migrations:cleanupExpiredPublicLinks") &&
	    read("docs/saas-standardization.md").includes("migrations:repairHostProfileDefaultCampaign") &&
	    read("docs/saas-standardization.md").includes("migrations:repairDuplicateHostProfiles") &&
	    read("docs/saas-standardization.md").includes("migrations:repairOwnerActiveCampaigns") &&
	    read("docs/saas-standardization.md").includes("migrations:repairDuplicateOwnerBudgets") &&
	    read("docs/saas-standardization.md").includes("migrations:cleanupStaleReservedAssets") &&
    read("docs/saas-standardization.md").includes("preserving audit fields") &&
    read("docs/saas-standardization.md").includes("cleanup expired public claim links") &&
    read("docs/saas-standardization.md").includes("cleanup stale campaign asset reservations") &&
    read("README.md").includes("cron `cleanup expired public claim links`") &&
    read("README.md").includes("Cron `cleanup stale campaign asset reservations`"),
  "migration maintenance helpers must be documented for operators"
);
const migrationBudgetScope = section(migrations, "async function backfillBudgetScope", "export const backfillOwnerSaaSModel");
assert(
  migrationBudgetScope.includes("listOwnerBudgetsForScope(ctx, ownerId, undefined)") &&
    migrationBudgetScope.includes("listOwnerBudgetsForScope(ctx, ownerId, campaignId)") &&
    migrationBudgetScope.includes("existingCampaignBudgets.length > 0") &&
    budgetScope.includes('withIndex("by_owner_campaign"') &&
    migrationBudgetScope.includes('withIndex("by_owner_campaign_amount"') &&
    !budgetScope.includes('withIndex("by_owner"') &&
    !migrationBudgetScope.includes("budgets.filter((budget) => !budget.campaignId)") &&
    !migrationBudgetScope.includes("ownerItems.filter((item) => !item.campaignId)"),
  "migration budget backfill must read legacy owner budgets through the shared owner+campaign scope helper and skip when any scoped campaign budget already exists"
);
assert(
  migrations.includes("getOwnedCampaign") &&
    migrations.includes("campaign.ownerId === ownerId"),
  "migration backfill must verify campaign ownership before using campaign references"
);
const migrationSessionBackfill = section(
  migrations,
  "async function backfillDrawSessions",
  "async function backfillRedemptions"
);
assert(
  migrationSessionBackfill.includes("ownedSessionCampaign") &&
    migrationSessionBackfill.includes("session.campaignId && !ownedSessionCampaign") &&
    migrationSessionBackfill.includes("stats.skippedForeignCampaignReferences += 1") &&
    migrationSessionBackfill.includes("pushBackfillAuditDecision(stats.auditDecisions") &&
    migrationSessionBackfill.includes('reason: "foreign_campaign"') &&
    migrationSessionBackfill.includes('reason: "invalid_public_code_expiry"') &&
    migrationSessionBackfill.includes("ownedSessionCampaign?._id ?? (session.campaignId ? null : campaignId)") &&
    migrations.includes("stats.skippedForeignCampaignReferences +") &&
    migrations.includes("redemptionStats.skippedForeignCampaignReferences"),
  "migration session backfill must report foreign campaign references, return bounded audit decisions, and not use foreign references for snapshot targets"
);
assert(
  migrations.includes("const MAX_BACKFILL_AUDIT_DECISIONS = 50") &&
    migrations.includes("type BackfillAuditDecision") &&
    migrations.includes("function pushBackfillAuditDecision") &&
    migrations.includes("auditDecisions.length < MAX_BACKFILL_AUDIT_DECISIONS") &&
    migrations.includes("auditDecisions: BackfillAuditDecision[]") &&
    migrations.includes("for (const decision of sessionStats.auditDecisions)") &&
    migrations.includes("for (const decision of redemptionStats.auditDecisions)"),
  "owner SaaS backfill must return bounded audit decision samples without unbounded row output"
);
assert(
  migrations.includes("const visibleCampaignStatuses = [\"active\", \"draft\"] as const") &&
    migrations.includes("async function listVisibleCampaignsForOwner") &&
    migrations.includes("listVisibleCampaignsForOwner(ctx, ownerId)") &&
    !section(migrations, "async function getTargetCampaignId", "async function buildSnapshotPatch").includes(
      'campaign.status !== "archived"'
    ),
  "migration target campaign resolution must read active/draft status buckets instead of scanning archived campaigns"
);
assert(
  migrations.includes("ownedSession = session?.ownerId === ownerId ? session : null") &&
    migrations.includes("skippedForeignSessionReferences") &&
    migrations.includes('reason: "foreign_session"') &&
    migrations.includes("drawSessionId: redemption.drawSessionId"),
  "migration backfill must ignore and report foreign session references with audit decision samples"
);
assert(
  migrations.includes("ownedAggregateCampaign") &&
    migrations.includes("skippedForeignCampaignReferences"),
  "migration backfill must avoid inserting campaign aggregates for foreign campaign references"
);
const migrationRedemptionBackfill = section(
  migrations,
  "async function backfillRedemptions",
  "async function backfillBudgetScope"
);
const aggregateStatsIncrementIndex = migrationRedemptionBackfill.indexOf(
  "stats.redemptionsBackfilledAggregate += 1"
);
assert(
  aggregateStatsIncrementIndex > migrationRedemptionBackfill.indexOf("if (!dryRun) {") &&
    aggregateStatsIncrementIndex <
      migrationRedemptionBackfill.indexOf("const ownedAggregateCampaign") &&
    aggregateStatsIncrementIndex >
      migrationRedemptionBackfill.indexOf("redemptionsByOwnerAmount.insertIfDoesNotExist"),
  "migration aggregate backfill stats must only increment during non-dry-run aggregate writes"
);
assert(
  migrations.includes("isRenderableCampaignAsset(heroAssetCandidate, ownerId)") &&
    migrations.includes("heroAssetCandidate.campaignId === campaign._id"),
  "migration snapshot backfill must validate hero asset ownership, campaign membership, and renderable lifecycle"
);

const hostProfiles = read("convex/hostProfiles.ts");
assert(
  !section(hostProfiles, "export const getHostProfile", "export const saveHostProfile").includes("allowLegacyBridge") &&
    !section(hostProfiles, "export const getHostProfile", "export const saveHostProfile").includes("ownerId: v.optional") &&
    section(hostProfiles, "export const getHostProfile", "export const saveHostProfile").includes("requireResolvedOwner(ctx, undefined") &&
    !tailSection(hostProfiles, "export const saveHostProfile").includes("allowLegacyBridge") &&
    !tailSection(hostProfiles, "export const saveHostProfile").includes("ownerId: v.optional") &&
    tailSection(hostProfiles, "export const saveHostProfile").includes("requireResolvedOwner(ctx, undefined"),
  "host profile read/write APIs must derive owner from Convex Auth without client ownerId args"
);
assert(
  hostProfiles.includes("validateRequestedHostSlug") &&
    hostProfiles.includes("Slug host phải có ít nhất 3 ký tự hợp lệ") &&
    hostProfiles.includes("Slug host đã tồn tại"),
  "explicit host profile slug saves must reject invalid or duplicate slugs"
);
assert(
  hostProfiles.includes('campaign.status === "archived"') &&
    hostProfiles.includes("Chiến dịch mặc định không thể là chiến dịch đã lưu trữ"),
  "host profile default campaign must reject archived campaigns"
);
assert(
  hostProfiles.includes("resolveHostDefaultCampaignId") &&
    hostProfiles.includes("hasExplicitDefaultCampaign ? input.defaultCampaignId : existing?.defaultCampaignId") &&
    hostProfiles.includes("defaultCampaignId: resolvedDefaultCampaignId") &&
    !hostProfiles.includes("defaultCampaignId: input?.defaultCampaignId ?? existing.defaultCampaignId"),
  "host profile updates must not retain missing, foreign, or archived default campaign links from existing profile rows"
);
assert(
  hostProfiles.includes("createUniqueSlug") &&
    hostProfiles.includes("ownerSlugToken") &&
    hostProfiles.includes("getProfilesBySlug") &&
    hostProfiles.includes("ownerScopedBaseSlug") &&
    hostProfiles.includes("Không thể tạo slug host duy nhất") &&
    !hostProfiles.includes("return `host-${ownerId.slice(-10).toLowerCase()}`"),
  "automatic host profile creation must keep generating globally unique public slugs through checked by_slug lookups"
);
assert(
  hostProfiles.includes('withIndex("by_owner"') &&
    hostProfiles.includes("profiles.length > 1") &&
    hostProfiles.includes("Dữ liệu host profile bị trùng") &&
    !section(hostProfiles, "export async function getHostProfileForOwner", "function sanitizeHostSlug").includes(".first()"),
  "host profile lookup must fail closed on duplicate owner profile rows instead of choosing an arbitrary profile"
);
const sessionSnapshotBuilder = section(draw, "async function buildSessionSnapshot", "function validateEnvelopeIndex");
assert(
  sessionSnapshotBuilder.includes("await ensureHostProfileForOwner(ctx, owner") &&
    sessionSnapshotBuilder.includes("hostSlugSnapshot: hostProfile.slug") &&
    !sessionSnapshotBuilder.includes("host-${ownerId.slice") &&
    campaignsBackend.includes("slug: hostProfile?.slug ?? null") &&
    hostProfiles.includes("slug: profile?.slug ?? null") &&
    migrations.includes("hostSlugSnapshot: profile?.slug") &&
    !migrations.includes("host-${ownerId.slice") &&
    !campaignsBackend.includes("host-${ownerId.slice") &&
    !hostProfiles.includes("host-${owner._id.slice"),
  "public host slugs in views, session snapshots, and migration snapshots must come only from checked hostProfiles rows"
);

assert(
  campaignIdentity.includes("createUniqueDefaultCampaignSlug") &&
    campaignIdentity.includes("campaignOwnerSlugToken") &&
    campaignIdentity.includes("ownerScopedBaseSlug") &&
    campaignIdentity.includes("by_owner_slug") &&
    campaignIdentity.includes("Slug chiến dịch đã tồn tại") &&
    campaignIdentity.includes("Không thể tạo slug chiến dịch duy nhất") &&
    !campaignIdentity.includes("return `campaign-${ownerId.slice(-10).toLowerCase()}`"),
  "campaign identity helpers must enforce owner-scoped slug uniqueness through checked by_owner_slug lookups"
);
assert(
  !/slug:\s*`lunar-\$\{ownerId\.slice/.test(
    [read("convex/campaigns.ts"), draw, read("convex/setup.ts")].join("\n")
  ),
  "default campaign creation must use the unique campaign slug helper"
);

const ops = read("convex/ops.ts");
assert(
  ops.includes("getSaaSReadiness") &&
    ops.includes("getHostSaaSReadiness") &&
    ops.includes("LI_XI_OPS_ADMIN_TOKEN") &&
    ops.includes("allRequiredConfigured") &&
    ops.includes("buildPublicEndpoint") &&
    ops.includes("googleCallbackUrl") &&
    ops.includes("polarWebhookUrl") &&
    ops.includes("polarWebhookPath"),
  "ops readiness query must exist and be admin-gated"
);
const adminOpsReadiness = section(ops, "export const getSaaSReadiness", "export const getHostSaaSReadiness");
const hostOpsReadiness = ops.slice(ops.indexOf("export const getHostSaaSReadiness"));
assert(
  ops.includes("function requireOpsAdminToken") &&
    adminOpsReadiness.includes("requireOpsAdminToken(args.adminToken)") &&
    !adminOpsReadiness.includes("getAuthUserId(ctx)") &&
    ops.includes("function requireHostReadinessAccess") &&
    ops.includes("function redactReadinessForHost") &&
    ops.includes("function hostRuntimeDetail") &&
    hostOpsReadiness.includes("await requireHostReadinessAccess(ctx)") &&
    hostOpsReadiness.includes("redactReadinessForHost(await buildSaaSReadiness(ctx))"),
  "full ops readiness must require LI_XI_OPS_ADMIN_TOKEN, while Campaign Studio must use a redacted Convex Auth host readiness view"
);
assert(
  ops.includes("evaluatePolarProductSync") &&
    ops.includes("evaluatePolarProductConfiguration") &&
    ops.includes("evaluatePolarServerConfiguration") &&
    ops.includes("evaluatePolarCredentialConfiguration") &&
    ops.includes("evaluatePublicEndpointConfiguration") &&
    ops.includes("evaluateGoogleOAuthCredentialConfiguration") &&
    ops.includes("evaluateConvexAuthKeyConfiguration") &&
    ops.includes("evaluateR2Configuration") &&
    ops.includes("evaluateR2CredentialConfiguration") &&
    ops.includes("evaluatePaidFallbackConfiguration") &&
    ops.includes("evaluateLegacyAuthConfiguration") &&
    ops.includes("JWT_PRIVATE_KEY") &&
    ops.includes("JWKS") &&
    ops.includes("hasProductionSecretShape") &&
    ops.includes("placeholderSecretValues") &&
    ops.includes("function configuredOpsAdminToken") &&
    ops.includes("hasProductionSecretShape(expectedToken, 32)") &&
    ops.includes("Cần LI_XI_OPS_ADMIN_TOKEN hoặc LIXI_OPS_ADMIN_TOKEN") &&
    ops.includes("LI_XI_OPS_ADMIN_TOKEN / LIXI_OPS_ADMIN_TOKEN phải là secret production dài") &&
    ops.includes("hasGoogleOAuthClientIdShape") &&
    ops.includes("hasGoogleOAuthClientSecretShape") &&
    ops.includes("googleClientIdShape") &&
    ops.includes("googleClientSecretShape") &&
    ops.includes(".apps.googleusercontent.com") &&
    ops.includes("AUTH_GOOGLE_SECRET không được là placeholder") &&
    ops.includes("hasPkcs8PrivateKeyShape") &&
    ops.includes("hasJwksShape") &&
    ops.includes("jwtPrivateKeyShape") &&
    ops.includes("jwksShape") &&
    ops.includes("uniqueConfiguredProducts") &&
    ops.includes("r2TokenShape") &&
    ops.includes("r2AccessKeyIdShape") &&
    ops.includes("r2SecretAccessKeyShape") &&
    ops.includes("R2_TOKEN không được là placeholder") &&
    ops.includes("r2EndpointHttpsOrigin") &&
    ops.includes("r2BucketNameSafe") &&
    ops.includes("isHttpsOriginUrl") &&
    ops.includes("isCloudflareR2EndpointOrigin") &&
    ops.includes("isConvexHttpActionsOrigin") &&
    ops.includes(".r2.cloudflarestorage.com") &&
    ops.includes(".convex.site") &&
    ops.includes("const endpointReady = isCloudflareR2EndpointOrigin(process.env.R2_ENDPOINT)") &&
    ops.includes('url.port === ""') &&
    ops.includes("const normalizedOrigin = url.origin.toLowerCase()") &&
    ops.includes("normalizedInput === `${normalizedOrigin}/`") &&
    ops.includes("isSafeCampaignAssetBucketName(process.env.R2_BUCKET)") &&
    !ops.includes("function isSafeBucketName") &&
    ops.includes("không được là IPv4 literal") &&
    ops.includes("polarOrganizationTokenShape") &&
    ops.includes("polarWebhookSecretShape") &&
    ops.includes("billingAdminTokenDisabled") &&
    ops.includes("billingAdminTokenShapeSafe") &&
    ops.includes("hasProductionSecretShape(configuredBillingAdminToken, 32)") &&
    ops.includes("LI_XI_BILLING_ADMIN_TOKEN / LIXI_BILLING_ADMIN_TOKEN phải là secret production dài") &&
    ops.includes("POLAR_ORGANIZATION_TOKEN không được là placeholder") &&
    ops.includes("POLAR_WEBHOOK_SECRET không được là placeholder") &&
    ops.includes("Gỡ LI_XI_BILLING_ADMIN_TOKEN / LIXI_BILLING_ADMIN_TOKEN") &&
    ops.includes('key: "billingAdminTokenDisabled"') &&
    ops.includes("process.env.LI_XI_BILLING_ADMIN_TOKEN !== undefined") &&
    ops.includes("process.env.LIXI_BILLING_ADMIN_TOKEN !== undefined") &&
    ops.includes('required: true') &&
    ops.includes('status: billingAdminTokenConfigured ? "invalidConfig" : "ready"') &&
    ops.includes("productionPolarServer") &&
    ops.includes("POLAR_SERVER") &&
    ops.includes("paidPlanFallbackDisabled") &&
    ops.includes("legacyAccountAuthDisabled") &&
    ops.includes("legacyOwnerBridgeDisabled") &&
    ops.includes("evaluateMigrationTokenConfiguration") &&
    ops.includes("migrationTokenDisabled") &&
    ops.includes("migrationTokenShapeSafe") &&
    ops.includes("isConfiguredMigrationTokenProductionSafe()") &&
    ops.includes("phải là secret production dài") &&
    ops.includes("migrationTokenEnvNames") &&
    ops.includes("isMigrationTokenConfigured()") &&
    ops.includes("configuredMigrationTokenName()") &&
    ops.includes("convexSiteUrlHttps") &&
    ops.includes('from "../lib/networkPolicy.ts"') &&
    ops.includes("function buildConvexHttpActionsOrigin") &&
    ops.includes("convexSiteOrigin") &&
    ops.includes("buildConvexHttpActionsOrigin(process.env.CONVEX_SITE_URL)") &&
    ops.includes("googleCallbackUrl: buildPublicEndpoint(convexSiteOrigin") &&
    ops.includes("polarWebhookUrl: buildPublicEndpoint(convexSiteOrigin") &&
    ops.includes("isPublicHttpsOriginUrl") &&
    ops.includes("!isRawIpHostname(hostname)") &&
    ops.includes("isLocalOrPrivateHostname") &&
    !ops.includes("function isRawIpHostname") &&
    !ops.includes("function isLocalOrPrivateHostname") &&
    ops.includes("const convexSiteUrlReady = isConvexHttpActionsOrigin(process.env.CONVEX_SITE_URL)") &&
    ops.includes("siteUrlHttps") &&
    ops.includes("const siteUrlReady = isPublicHttpsOriginUrl(process.env.SITE_URL)") &&
    ops.includes("function buildPublicOrigin") &&
    ops.includes("siteUrlOrigin") &&
    ops.includes("siteUrlOriginDerived") &&
    ops.includes("buildPublicOrigin(process.env.SITE_URL)") &&
    ops.includes("https://<deployment>.convex.site") &&
    ops.includes("không phải localhost/IP riêng/raw IP") &&
    ops.includes("LI_XI_ENABLE_PAID_PLAN_FALLBACK") &&
    ops.includes("LI_XI_ENABLE_LEGACY_AUTH") &&
    ops.includes("LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    ops.includes("googleCallbackUrlDerived") &&
    ops.includes("polarWebhookUrlDerived") &&
    ops.includes("invalidConfig") &&
    ops.includes("polar.listProducts(ctx)") &&
    ops.includes("allRequiredReady") &&
    ops.includes("missingRuntimeRequired") &&
    ops.includes("runtimeChecks") &&
    !ops.includes("const convexSiteUrlReady = isPublicHttpsOriginUrl(process.env.CONVEX_SITE_URL)"),
  "ops readiness must report endpoint validity, Polar sync status, migration-token shutdown, and production safety beyond env presence"
);
const productionReadinessScript = read("scripts/verify-production-readiness.mjs");
assert(
    productionReadinessScript.includes("ops:getSaaSReadiness") &&
    productionReadinessScript.includes("LI_XI_OPS_ADMIN_TOKEN") &&
    productionReadinessImportTest.includes("configuredOpsAdminToken") &&
    productionReadinessImportTest.includes("LIXI_OPS_ADMIN_TOKEN: \" alias_ops_admin_token_0123456789abcd \"") &&
    productionReadinessImportTest.includes("production readiness should prefer LI_XI_OPS_ADMIN_TOKEN") &&
    productionReadinessScript.includes("function configuredOpsAdminToken") &&
    productionReadinessScript.includes("hasProductionSecretShape(adminToken, 32)") &&
    productionReadinessScript.includes("production-safe secret of at least 32 characters") &&
    productionReadinessScript.includes("short, placeholder, or whitespace ops admin tokens should fail production secret shape") &&
    productionReadinessScript.includes('await runCommand("node", ["scripts/verify-saas-contracts.mjs"])') &&
    productionReadinessScript.includes("evaluateFrontendReadiness") &&
    productionReadinessScript.includes("VITE_CONVEX_URL") &&
    productionReadinessScript.includes("VITE_SITE_URL") &&
    productionReadinessScript.includes('from "../lib/networkPolicy.ts"') &&
    productionReadinessScript.includes("isHttpsOriginUrl") &&
    productionReadinessScript.includes("isPublicHttpsOriginUrl") &&
    productionReadinessScript.includes("!isRawIpHostname(hostname)") &&
    !productionReadinessScript.includes("function isRawIpHostname") &&
    !productionReadinessScript.includes("function isLocalOrPrivateHostname") &&
    productionReadinessScript.includes("frontendConvexUrlHttpsOrigin") &&
    productionReadinessScript.includes("frontendSiteUrlPublicOrigin") &&
    productionReadinessScript.includes("frontendLegacyAccountAuthDisabled") &&
    productionReadinessScript.includes("frontendLegacyOwnerBridgeDisabled") &&
    productionReadinessScript.includes("configuredEnabledEnvName") &&
    productionReadinessScript.includes('const googleCallbackPath = "/api/auth/callback/google"') &&
    productionReadinessScript.includes('const polarWebhookPath = "/polar/events"') &&
    productionReadinessScript.includes("deriveExpectedBackendEndpoints") &&
    productionReadinessScript.includes("Google OAuth callback URL should be derived from the clean Convex HTTP Actions origin") &&
    productionReadinessScript.includes("Polar webhook URL should be derived from the clean Convex HTTP Actions origin") &&
    productionReadinessScript.includes("Convex HTTP Actions origins with paths should not derive OAuth callback URLs") &&
    productionReadinessScript.includes("Convex cloud API origins should not derive Polar webhook URLs") &&
    productionReadinessScript.includes("VITE_LI_XI_ENABLE_LEGACY_AUTH") &&
    productionReadinessScript.includes("VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE") &&
    productionReadinessScript.includes("evaluateCrossRuntimeReadiness") &&
    productionReadinessScript.includes("function isProductionReady") &&
    productionReadinessScript.includes("isProductionReady(readiness, frontendReadiness, crossRuntimeReadiness)") &&
    productionReadinessScript.includes("polar.billingAdminTokenDisabled") &&
    productionReadinessScript.includes("backend billing admin token runtime failure should fail overall production readiness") &&
    productionReadinessScript.includes("oauth.siteUrlHttps") &&
    productionReadinessScript.includes("backend private/link-local SITE_URL runtime failure should fail overall production readiness") &&
    productionReadinessScript.includes("frontendBackendSiteOriginMatch") &&
    productionReadinessScript.includes("frontendBackendConvexDeploymentMatch") &&
    productionReadinessScript.includes("convexDeploymentName") &&
    productionReadinessScript.includes("frontendConvexDeploymentName") &&
    productionReadinessScript.includes("backendConvexDeploymentName") &&
    productionReadinessScript.includes("readiness.endpoints?.convexSiteOrigin") &&
    productionReadinessScript.includes("VITE_CONVEX_URL và CONVEX_SITE_URL phải trỏ cùng Convex deployment") &&
    productionReadinessScript.includes("readiness.endpoints?.siteUrlOrigin") &&
    productionReadinessScript.includes("VITE_SITE_URL phải khớp SITE_URL") &&
    productionReadinessScript.includes("không phải localhost/IP riêng") &&
    productionReadinessScript.includes("frontend legacy account auth flag should fail production readiness") &&
    productionReadinessScript.includes("frontend legacy account auth compatibility flag should fail production readiness") &&
    productionReadinessScript.includes("frontend legacy owner bridge flag should fail production readiness") &&
    productionReadinessScript.includes("frontend legacy owner bridge compatibility flag should fail production readiness") &&
    productionReadinessScript.includes("https://100.64.0.1") &&
    productionReadinessScript.includes("https://169.254.1.1") &&
    productionReadinessScript.includes("https://app.localhost") &&
    productionReadinessScript.includes("https://[fd00::1]") &&
    productionReadinessScript.includes("https://[::ffff:10.0.0.1]") &&
    productionReadinessScript.includes("https://8.8.8.8") &&
    productionReadinessScript.includes("https://[2606:4700:4700::1111]") &&
    productionReadinessScript.includes("frontend private/link-local site origin should fail production readiness") &&
    productionReadinessScript.includes("frontend localhost-subdomain site origin should fail production readiness") &&
    productionReadinessScript.includes("frontend raw IP site origin should fail production readiness") &&
    productionReadinessScript.includes("frontend.frontendSiteUrlPublicOrigin") &&
    productionReadinessScript.includes("allRequiredReady") &&
    productionReadinessScript.includes("missingRequired") &&
    productionReadinessScript.includes("missingRuntimeRequired") &&
    productionReadinessScript.includes("--prod") &&
    productionReadinessScript.includes("--deployment"),
  "production readiness verifier must call ops readiness and fail on missing env/runtime checks"
);
assert(
    read("scripts/smoke-routes.mjs").includes("smokeConvexUrl") &&
    read("scripts/smoke-routes.mjs").includes("https://smoke-test.convex.cloud") &&
    read("scripts/smoke-routes.mjs").includes("const smokeConvexUrl = explicitBaseUrl ? (process.env.VITE_CONVEX_URL ?? \"https://smoke-test.convex.cloud\") : \"https://smoke-test.convex.cloud\"") &&
    read("scripts/smoke-routes.mjs").includes("const smokeSiteUrl = explicitBaseUrl ? (process.env.VITE_SITE_URL ?? baseUrl) : baseUrl") &&
    read("scripts/smoke-routes.mjs").includes("VITE_CONVEX_URL: smokeConvexUrl") &&
    read("scripts/smoke-routes.mjs").includes("VITE_SITE_URL: smokeSiteUrl") &&
    !read("scripts/smoke-routes.mjs").includes("VITE_LI_XI_ENABLE_LEGACY_AUTH") &&
    !read("scripts/smoke-routes.mjs").includes("VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE"),
  "route smoke coverage must provide deterministic Vite public env without preserving dead frontend legacy auth flags"
);
assert(
  campaignsRoute.includes("api.ops.getHostSaaSReadiness") &&
    !campaignsRoute.includes("api.ops.getSaaSReadiness") &&
    campaignsRoute.includes("runtimeReadinessRows") &&
    campaignsRoute.includes("readinessEndpointRows") &&
    campaignsRoute.includes("allRequiredReady") &&
    campaignReadinessPanel.includes("missingRuntimeRequired") &&
    campaignsRoute.includes("googleCallbackUrl") &&
    campaignsRoute.includes("polarWebhookUrl") &&
    campaignsRoute.includes("missingRequired.map((requirement) => requirement.label)"),
  "Campaign Studio readiness panel must use the redacted host readiness query with runtime checks and public setup endpoints"
);

const entitlements = read("convex/entitlements.ts");
const entitlementPolicy = read("lib/entitlementPolicy.ts");
const planStateQuery = tailSection(entitlements, "export const getPlanState");
const resolveBillingPlanHelper = section(entitlements, "async function resolveBillingPlan", "function formatLimit");
assert(
  !planStateQuery.includes("allowLegacyBridge") &&
    !planStateQuery.includes("ownerId: v.optional") &&
    planStateQuery.includes("requireResolvedOwner(ctx, undefined"),
  "plan-state entitlement reads must derive owner from Convex Auth without client ownerId args"
);
assert(
  resolveBillingPlanHelper.includes("polar.getCurrentSubscription(ctx, { userId: ownerId })") &&
    (entitlements.match(/polar\.getCurrentSubscription\(ctx, \{ userId: ownerId \}\)/g) ?? []).length === 1 &&
    entitlements.includes("return getEntitlementSnapshot(ctx, ownerId)") &&
    !planStateQuery.includes("polar.getCurrentSubscription"),
  "direct owner-id Polar subscription reads must stay isolated to the trusted entitlement snapshot helper"
);
assert(
  entitlements.includes("polarProducts") &&
    entitlements.includes('from "../lib/entitlementPolicy"') &&
    entitlementPolicy.includes("configuredTierForProduct") &&
    entitlementPolicy.includes("entitlingPolarStatuses") &&
    entitlementPolicy.includes('"active"') &&
    entitlementPolicy.includes('"trialing"') &&
    entitlementPolicy.includes("hasEntitlingPolarStatus(subscription)") &&
    entitlementPolicy.includes("function hasConfiguredPolarProductId") &&
    entitlementPolicy.includes("normalizedProductId === normalizedProProductId") &&
    entitlementPolicy.includes("normalizedProductId === normalizedBusinessProductId") &&
    entitlementPolicy.includes("matchingConfiguredTiers.length === 1") &&
    entitlementPolicy.includes("isBillingPlanMappingConfigured") &&
    entitlementPolicy.includes("env.POLAR_ORGANIZATION_TOKEN") &&
    entitlementPolicy.includes("function hasProductionPolarTokenShape") &&
    entitlementPolicy.includes("token.length >= 32") &&
    entitlementPolicy.includes("placeholderPolarTokenValues") &&
    entitlementPolicy.includes("hasProductionPolarTokenShape(env.POLAR_ORGANIZATION_TOKEN)") &&
    entitlementPolicy.includes("products.pro.trim() !== products.business.trim()") &&
    entitlements.includes("billingConfigured: isBillingPlanMappingConfigured(process.env, polarProducts)") &&
    entitlementPolicy.includes("LI_XI_ENABLE_PAID_PLAN_FALLBACK") &&
    entitlementPolicy.includes('fallbackTier !== "free" && !isPaidPlanFallbackEnabled(env)') &&
    entitlementPolicy.includes('return "free"') &&
    entitlementPolicyTest.includes("Duplicate configured product ids should not grant an ambiguous paid tier") &&
    entitlementPolicyTest.includes("Configured product ids should be matched after trimming") &&
    entitlementPolicyTest.includes("Configured product ids with whitespace should not grant paid entitlements") &&
    entitlementPolicyTest.includes("past_due") &&
    entitlementPolicyTest.includes("Paid fallback should be disabled by default") &&
    entitlementPolicyTest.includes("Billing plan mapping should require Polar organization token") &&
    entitlementPolicyTest.includes("Billing plan mapping should reject placeholder Polar organization token") &&
    entitlementPolicyTest.includes("Billing plan mapping should reject blank product ids after trimming") &&
    entitlementPolicyTest.includes("Billing plan mapping should reject product ids with whitespace") &&
    entitlementPolicyTest.includes("entitlement policy regression tests passed") &&
    !entitlements.includes("readMetadataString") &&
    !entitlements.includes('productName.includes("pro")'),
  "paid entitlements must only map active/trialing configured Polar product IDs through tested pure policy, not product metadata, names, inactive subscriptions, or unguarded fallback env"
);
assert(
  entitlements.includes("projectedBudgetItems") &&
    entitlements.includes("existingScopeItemCount") &&
    entitlements.includes("toàn tài khoản"),
  "budget item entitlements must enforce projected account-wide usage"
);
const entitlementUsage = section(entitlements, "async function getUsage", "async function getEntitlementSnapshot");
const campaignAssetsSchema = section(schema, "campaignAssets: defineTable", "analyticsCounterEvents: defineTable");
assert(
  entitlements.includes("ASSET_QUOTA_COUNTED_STATUSES") &&
    campaignAssetsSchema.includes('.index("by_owner_status", ["ownerId", "status"])') &&
    entitlements.includes('"reserved", "uploaded", "attached"') &&
    entitlements.includes("CAMPAIGN_QUOTA_COUNTED_STATUSES") &&
    entitlements.includes('"draft", "active"') &&
    entitlements.includes("isQuotaCountedCampaignAsset") &&
    entitlements.includes("countCampaignsForQuota(ctx, ownerId)") &&
    entitlements.includes("countAssetsForQuota(ctx, ownerId)") &&
    entitlements.includes('withIndex("by_owner_status"') &&
    entitlements.includes('q.eq("ownerId", ownerId).eq("status", status)') &&
    entitlements.includes("assets.filter(isQuotaCountedCampaignAsset).length") &&
    !entitlementUsage.includes('.query("campaignAssets")') &&
    !entitlementUsage.includes('.query("campaigns")'),
  "campaign and asset entitlement usage must count only indexed quota states, not archived/rejected/malformed full history"
);
assert(
  entitlements.includes('from "./drawSessionPolicy"') &&
    drawSessionPolicy.includes("PENDING_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes('"station"') &&
    drawSessionPolicy.includes('"link"') &&
    drawSessionPolicy.includes("undefined") &&
    entitlements.includes("async function countOpenSessionsForQuota") &&
    entitlements.includes("countOpenPendingOwnerSessions(ctx, ownerId)") &&
    drawSessionPolicy.includes('withIndex("by_owner_status_delivery"') &&
    drawSessionPolicy.includes('q.eq("ownerId", ownerId).eq("status", "pending").eq("deliveryMode", deliveryMode)') &&
    drawSessionPolicy.includes("isOpenPendingSession(session, now)") &&
    entitlementUsage.includes("countOpenSessionsForQuota(ctx, ownerId)") &&
    !entitlementUsage.includes('.query("drawSessions")'),
  "open-session entitlement usage must use indexed delivery-mode buckets and exclude expired public links"
);
assert(
  entitlements.includes('import { countOwnerRedemptions } from "./analytics"') &&
    entitlementUsage.includes("countOwnerRedemptions(ctx, ownerId)") &&
    entitlementUsage.includes("redemptions,") &&
    !entitlementUsage.includes('.query("redemptions")'),
  "redemption entitlement usage must use the Aggregate count instead of collecting all redemption rows"
);

const setup = read("convex/setup.ts");
assert(
  !section(setup, "export const getSetupState", "export const configureBudget").includes("allowLegacyBridge") &&
    !section(setup, "export const getSetupState", "export const configureBudget").includes("ownerId: v.optional") &&
    section(setup, "export const getSetupState", "export const configureBudget").includes("requireResolvedOwner(ctx, undefined") &&
    !section(setup, "export const configureBudget", "export const syncBudgetFromItems").includes("allowLegacyBridge") &&
    !section(setup, "export const configureBudget", "export const syncBudgetFromItems").includes("ownerId: v.optional") &&
    section(setup, "export const configureBudget", "export const syncBudgetFromItems").includes("requireResolvedOwner(ctx, undefined") &&
    !tailSection(setup, "export const syncBudgetFromItems").includes("allowLegacyBridge") &&
    !tailSection(setup, "export const syncBudgetFromItems").includes("ownerId: v.optional") &&
    tailSection(setup, "export const syncBudgetFromItems").includes("requireResolvedOwner(ctx, undefined"),
  "host setup and budget APIs must derive owner from Convex Auth without client ownerId args"
);
assert(
  setup.includes("Không tìm thấy tài khoản host") &&
    setup.includes("Cần thiết lập PIN host trước khi lưu ngân sách") &&
    budgetScope.includes("Host chưa hoàn tất cấu hình ngân sách") &&
    !setup.includes("Không tìm thấy tài khoản chủ ví") &&
    !setup.includes("Cần thiết lập PIN chủ ví trước khi lưu ngân sách") &&
    !budgetScope.includes("Chủ ví chưa hoàn tất cấu hình ngân sách"),
  "backend setup and budget-scope host errors must not leak wallet-era wording"
);
assert(
  setup.includes("assertBudgetItemCount(ctx, ownerId, normalized.length, existingItems.length)"),
  "budget setup must subtract current campaign items before enforcing account-wide item limits"
);
const setupBudgetLookup = section(setup, "async function getBudgetForScope", "async function listBudgetItems");
assert(
  setupBudgetLookup.includes("getUniqueOwnerBudgetForScope(ctx, ownerId, scope.campaignId)") &&
    budgetScope.includes('withIndex("by_owner_campaign"') &&
    budgetScope.includes('q.eq("ownerId", ownerId).eq("campaignId", campaignId)') &&
    budgetScope.includes("budgets.length > 1") &&
    !budgetScope.includes('withIndex("by_owner"') &&
    !setupBudgetLookup.includes(".find((budget) => !budget.campaignId)"),
  "setup budget lookup must use the shared owner+campaign scope helper and fail closed on duplicate scoped budget rows"
);
const setupBudgetItems = section(setup, "async function listBudgetItems", "export const getSetupState");
assert(
  setupBudgetItems.includes('withIndex("by_campaign_owner_amount"') &&
    setupBudgetItems.includes('q.eq("campaignId", scope.campaignId).eq("ownerId", ownerId)') &&
    setupBudgetItems.includes('withIndex("by_owner_campaign_amount"') &&
    setupBudgetItems.includes('q.eq("ownerId", ownerId).eq("campaignId", undefined)') &&
    !setupBudgetItems.includes(".filter((item) => !item.campaignId)") &&
    !setupBudgetItems.includes("item.ownerId === ownerId"),
  "setup budget item reads must use campaign+owner indexes and exact legacy owner+missing-campaign fallback"
);
assert(
  setup.includes("hasOpenPendingSessionForOwner(ctx, ownerId)") &&
    drawSessionPolicy.includes("PENDING_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes('withIndex("by_owner_status_delivery"') &&
    drawSessionPolicy.includes('q.eq("ownerId", ownerId).eq("status", "pending").eq("deliveryMode", deliveryMode)') &&
    drawSessionPolicy.includes("listPendingOwnerSessionsByDelivery(ctx, ownerId)") &&
    !drawSessionPolicy.includes('withIndex("by_owner_status"'),
  "setup legacy owner-wide pending-session lock must use owner+status+delivery buckets before expiry filtering"
);
assert(
  campaignIdentity.includes("export const visibleCampaignStatuses = [\"active\", \"draft\"] as const") &&
    campaignIdentity.includes("export async function listVisibleCampaignsForOwner") &&
    campaignIdentity.includes("export function sortCampaignsByRecency") &&
    campaignIdentity.includes("export async function getPreferredActiveCampaignForOwner") &&
    setup.includes("getPreferredActiveCampaignForOwner(ctx, ownerId)") &&
    setup.includes("listVisibleCampaignsForOwner(ctx, ownerId)") &&
    setup.includes("sortCampaignsByRecency(visibleCampaigns)") &&
    !section(setup, "async function getActiveCampaignForOwner", "async function ensureDefaultCampaignForOwner").includes(
      'campaign.status !== "archived"'
    ) &&
    setup.includes('status: "active"') &&
    setup.includes("Không thể kích hoạt chiến dịch mặc định"),
  "budget setup must read visible active/draft campaign buckets and activate an existing draft before using it as the mutable budget scope"
);
assert(
  setup.lastIndexOf("const redemptionsExist = await hasAnyRedemptionForScope(ctx, ownerId, scope);") >
    setup.indexOf("export const syncBudgetFromItems") &&
    setup.lastIndexOf("const pendingSessionExists = await hasPendingSessionForScope(ctx, ownerId, scope);") >
      setup.indexOf("export const syncBudgetFromItems"),
  "budget sync must respect the same redemption and pending-session locks as budget configuration"
);
assert(
  setup.includes('withIndex("by_campaign_owner_createdAt"') &&
    setup.includes('q.eq("campaignId", scope.campaignId).eq("ownerId", ownerId)') &&
    !section(setup, "async function hasAnyRedemptionForScope", "async function hasPendingSessionForScope").includes('.filter((q) => q.eq(q.field("ownerId"), ownerId))'),
  "campaign-scoped budget history checks must use campaign+owner index before checking for history"
);
assert(
  setup.includes("hasOpenPendingSessionForCampaign(ctx, ownerId, scope.campaignId)") &&
    drawSessionPolicy.includes("PENDING_SESSION_DELIVERY_MODES") &&
    drawSessionPolicy.includes("listPendingCampaignSessionsByDelivery(ctx, ownerId, campaignId)") &&
    drawSessionPolicy.includes('withIndex("by_campaign_owner_status_delivery"') &&
    drawSessionPolicy.includes('.eq("campaignId", campaignId)') &&
    drawSessionPolicy.includes('.eq("deliveryMode", deliveryMode)') &&
    !section(setup, "async function hasPendingSessionForScope", "async function getActiveCampaignForOwner").includes('q.eq(q.field("campaignId"), scope.campaignId)'),
  "campaign-scoped budget pending-session locks must use campaign+owner+delivery index before checking open sessions"
);

for (const docsFile of [
  "AGENTS.md",
  "design_system.md",
  "docs/saas-standardization.md",
  "docs/production-evidence-template.md",
]) {
  assertFileExists(docsFile);
}
assertFileExists("docs/production-verification-runbook.md");

const agentsDoc = read("AGENTS.md");
assert(
  agentsDoc.includes("SaaS prize-draw platform") &&
    agentsDoc.includes("Google OAuth") &&
    agentsDoc.includes("Campaign Studio") &&
    agentsDoc.includes("station draw session") &&
    agentsDoc.includes("public claim link") &&
    agentsDoc.includes("VITE_") &&
    agentsDoc.includes("NEXT_PUBLIC_"),
  "AGENTS.md must describe the SaaS application flow, Google OAuth path, public claim links, and Vite env boundary"
);

const readme = read("README.md");
const saasStandardization = read("docs/saas-standardization.md");
const productionVerificationRunbook = read("docs/production-verification-runbook.md");
const productionEvidenceTemplate = read("docs/production-evidence-template.md");
assert(
  readme.includes("SaaS prize-draw platform cho branded lucky campaigns") &&
    readme.includes("default campaign skin") &&
    readme.includes("Host đăng nhập bằng Google OAuth") &&
    readme.includes("Campaign Studio") &&
    readme.includes("public claim link") &&
    readme.includes("PIN host vẫn là lớp xác nhận") &&
    !readme.includes("Ứng dụng rút lì xì theo flow thực tế") &&
    !readme.includes("Chủ ví đăng ký/đăng nhập") &&
    !readme.includes("leaderboard theo từng chủ ví"),
  "README intro must position the product as a SaaS prize-draw platform with Tet as the default campaign skin"
);
assert(
  readme.includes("docs/production-verification-runbook.md") &&
    readme.includes("docs/production-evidence-template.md") &&
    saasStandardization.includes("production-verification-runbook.md") &&
    saasStandardization.includes("production-evidence-template.md") &&
    productionVerificationRunbook.includes("production-evidence-template.md"),
  "README, runbook, and SaaS standardization docs must link the live/staging production verification runbook and evidence template"
);
assert(
  saasStandardization.includes("official Next.js App Router migration guide") &&
    saasStandardization.includes('routesDirectory: "app"') &&
    saasStandardization.includes("app/__root.tsx") &&
    saasStandardization.includes("HeadContent") &&
    saasStandardization.includes("routeTree") &&
    saasStandardization.includes("$publicCode") &&
    saasStandardization.includes("Runtime TypeScript modules under `convex/` and `lib/` avoid `.ts` import specifiers"),
  "SaaS standardization docs must record the TanStack Start migration shape checked against the official Next.js App Router migration guide"
);
assert(
    saasStandardization.includes("`requireResolvedOwner` has no legacy bridge opt-in") &&
    readme.includes("`requireResolvedOwner` no") &&
    readme.includes("longer exposes any legacy bridge opt-in for host APIs") &&
    saasStandardization.includes("station redemption/cancel must resolve the owner through Convex Auth") &&
    saasStandardization.includes("Host-facing draw APIs do not accept the temporary legacy bridge") &&
    !saasStandardization.includes("station redemption/cancel must resolve the owner through Convex Auth or the temporary legacy bridge") &&
    !readme.includes("only helper that may honor the temporary legacy bridge") &&
    saasStandardization.includes("migration-token resolver") &&
    saasStandardization.includes("CLI owner-ID backfills require `LI_XI_MIGRATION_TOKEN` / `LIXI_MIGRATION_TOKEN`") &&
    saasStandardization.includes("Campaign Studio is the host control surface after setup") &&
    saasStandardization.includes("explicit `Trạm rút` CTA from Campaign Studio into `/draw`") &&
    saasStandardization.includes("no larger than the 8 MB upload cap") &&
    saasStandardization.includes("R2 upload and metadata callbacks canonicalize the object key") &&
    saasStandardization.includes("no IPv4-literal bucket names") &&
    saasStandardization.includes("Public claim lookup and redemption also fail closed") &&
    saasStandardization.includes("no longer active") &&
    saasStandardization.includes("The live station session is only exposed when its campaign still exists") &&
    saasStandardization.includes("malformed legacy station sessions with missing, foreign, or inactive campaigns") &&
    saasStandardization.includes("host display identity") &&
    saasStandardization.includes("Guest-facing branding comes from campaign snapshots") &&
    saasStandardization.includes("Public claim previews, station pending-session reward pools, and redemption selection all use the same capacity-preserving prize filter") &&
    saasStandardization.includes("repairs owned-campaign Aggregate/counter state") &&
    saasStandardization.includes("campaign Aggregate/counter state for redemption rows whose `campaignId` belongs to the owner") &&
    readme.includes("không ghi campaign counter hoặc campaign Aggregate cho campaign lạ") &&
    readme.includes("owner Aggregate/counter và Aggregate/counter của campaign thuộc owner") &&
    saasStandardization.includes("raw IPv4/IPv6 literals"),
  "SaaS standardization docs must record OAuth-only host auth, R2 render cap, inactive-campaign public claim guards, and capacity-preserving prize previews"
);
assert(
  productionVerificationRunbook.includes("# Production Verification Runbook") &&
    productionVerificationRunbook.includes("allRequiredReady: true") &&
    productionVerificationRunbook.includes("Google OAuth Host Flow") &&
    productionVerificationRunbook.includes("Campaign And Public Claim Flow") &&
    productionVerificationRunbook.includes("Cloudflare R2 Campaign Assets") &&
    productionVerificationRunbook.includes("Polar Billing Flow") &&
    productionVerificationRunbook.includes("checkout return origin") &&
    productionVerificationRunbook.includes("full return URL") &&
    productionVerificationRunbook.includes("customer portal return origin") &&
    productionVerificationRunbook.includes("returns to `/campaigns`") &&
    productionVerificationRunbook.includes("Analytics And Backfill") &&
    productionVerificationRunbook.includes("npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json") &&
    productionVerificationRunbook.includes("npm run verify:evidence -- /tmp/li-xi-production-readiness.json") &&
    productionVerificationRunbook.includes("npm run verify:evidence-report -- <filled-evidence-report.md>") &&
    productionVerificationRunbook.includes('Redacted JSON artifact from `--evidence-out`') &&
    readme.includes("npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json") &&
    readme.includes("npm run verify:evidence -- /tmp/li-xi-production-readiness.json") &&
    readme.includes("npm run verify:evidence-report -- <filled-evidence-report.md>") &&
    saasStandardization.includes("npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json") &&
    saasStandardization.includes("npm run verify:evidence -- /tmp/li-xi-production-readiness.json") &&
    saasStandardization.includes("npm run verify:evidence-report -- <filled-evidence-report.md>") &&
	    productionVerificationRunbook.includes("LI_XI_BILLING_ADMIN_TOKEN") &&
	    productionVerificationRunbook.includes("LIXI_BILLING_ADMIN_TOKEN") &&
	    productionVerificationRunbook.includes("LI_XI_MIGRATION_TOKEN") &&
	    productionVerificationRunbook.includes("LIXI_MIGRATION_TOKEN") &&
	    productionVerificationRunbook.includes("Billing admin token and migration token shape/shutdown checks") &&
	    productionVerificationRunbook.includes("The production readiness goal is complete only when every section above has") &&
    productionVerificationRunbook.includes("fresh evidence for the target deployment") &&
    productionVerificationRunbook.includes("hero start CTA and the result modal collect CTA render as two") &&
    productionVerificationRunbook.includes("Exact start CTA and collect CTA text observed in the browser") &&
    productionVerificationRunbook.includes("bounded") &&
    productionVerificationRunbook.includes("auditDecisions") &&
    productionVerificationRunbook.includes("Owner backfill audit decision summary") &&
    productionVerificationRunbook.includes("public-link `sessionDecisions`") &&
    productionVerificationRunbook.includes("stale asset") &&
    productionVerificationRunbook.includes("duplicate budget `budgetDecisions`") &&
    productionVerificationRunbook.includes("If any section is skipped, blocked, verified only locally, or cannot be marked") &&
    productionVerificationRunbook.includes("`Result: PASS`"),
  "production verification runbook must keep live evidence gates for OAuth, public claims, R2, Polar, analytics, and temporary-token shutdown"
);
assert(
  productionEvidenceTemplate.includes("# Production Evidence Template") &&
    productionEvidenceTemplate.includes("npm run verify:evidence-report -- <filled-evidence-report.md>") &&
    productionEvidenceTemplate.includes("Use `Result: PASS` for every verification section") &&
    productionEvidenceTemplate.includes("Production readiness accepted: YES") &&
    productionEvidenceTemplate.includes("Remaining risks: None") &&
    productionEvidenceTemplate.includes("`Final Decision.Approver` must be a concrete release approver") &&
    productionEvidenceTemplate.includes("`Final Decision.Follow-up tasks` must be filled") &&
    productionEvidenceTemplate.includes("must not contain unresolved") &&
    productionEvidenceTemplate.includes("the report validator rejects those values") &&
    productionEvidenceTemplate.includes("Behavior fields must record successful live outcomes") &&
    productionEvidenceTemplate.includes("Campaign copy evidence is different") &&
    productionEvidenceTemplate.includes("must record the exact observed button copy") &&
    productionEvidenceTemplate.includes("the two values must be distinct") &&
    productionEvidenceTemplate.includes("status must be `active`") &&
    productionEvidenceTemplate.includes("Convex billing state must be `active` or") &&
    productionEvidenceTemplate.includes("`Campaign And Public Claim.Campaign id or slug` must be a concrete observed") &&
    productionEvidenceTemplate.includes("`trialing`, and temporary billing/migration tokens") &&
    productionEvidenceTemplate.includes("temporary billing/migration tokens plus legacy flags must be") &&
    productionEvidenceTemplate.includes("removed or disabled before final acceptance") &&
    productionEvidenceTemplate.includes("Cleanup token/flag evidence must") &&
    productionEvidenceTemplate.includes("`Secrets rotated if exposed` must record reviewed exposure evidence") &&
    productionEvidenceTemplate.includes("a bare `not needed` is insufficient") &&
    productionEvidenceTemplate.includes("`LIXI_OPS_ADMIN_TOKEN`") &&
    productionEvidenceTemplate.includes("`LI_XI_BILLING_ADMIN_TOKEN`") &&
    productionEvidenceTemplate.includes("`LI_XI_ENABLE_LEGACY_AUTH`") &&
    productionEvidenceTemplate.includes("`LEGACY_AUTH_ENABLED`") &&
    productionEvidenceTemplate.includes("`LI_XI_ENABLE_LEGACY_OWNER_BRIDGE`") &&
    productionEvidenceTemplate.includes("`LEGACY_OWNER_BRIDGE_ENABLED`") &&
    productionEvidenceTemplate.includes("`VITE_LI_XI_ENABLE_LEGACY_AUTH`") &&
    productionEvidenceTemplate.includes("`VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE`") &&
    productionEvidenceTemplate.includes("`LI_XI_ENABLE_PAID_PLAN_FALLBACK`") &&
    productionEvidenceTemplate.includes("`LIXI_ENABLE_PAID_PLAN_FALLBACK`") &&
    productionEvidenceTemplate.includes("R2 hero evidence must separately prove") &&
    productionEvidenceTemplate.includes("- Public claim hero rendered:") &&
    productionEvidenceTemplate.includes("- Station hero rendered:") &&
    !productionEvidenceTemplate.includes("Public/station hero rendered") &&
    productionEvidenceTemplate.includes("operator reviewed") &&
    productionEvidenceTemplate.includes("`auditDecisions`") &&
    productionEvidenceTemplate.includes("`sessionDecisions`, `assetDecisions`,") &&
    productionEvidenceReportValidator.includes("function assertReviewedEvidence") &&
    productionEvidenceReportValidator.includes("must record reviewed audit decisions") &&
    productionEvidenceReportValidator.includes("Owner backfill audit decisions") &&
    productionEvidenceReportValidator.includes("Maintenance dry-run audit decisions") &&
    productionEvidenceTemplate.includes("standard local") &&
    productionEvidenceTemplate.includes("`Deployment.Environment` must be `staging` or `production`") &&
    productionEvidenceTemplate.includes("`Evidence date` must") &&
    productionEvidenceTemplate.includes("`Verifier` and `Release/ref` must be concrete observed values") &&
    productionEvidenceTemplate.includes("gate, production readiness artifact generation with `--evidence-out`") &&
    productionEvidenceTemplate.includes("Use concrete HTTPS public origins") &&
    productionEvidenceTemplate.includes("not localhost, private/link-local/CGNAT hosts") &&
    productionEvidenceTemplate.includes("IPv4/IPv6 addresses") &&
    productionEvidenceTemplate.includes("must not include custom or explicit default ports") &&
	    productionEvidenceTemplate.includes("keep `LI_XI_OPS_ADMIN_TOKEN` or `LIXI_OPS_ADMIN_TOKEN`") &&
	    productionVerificationRunbook.includes("whether using `LI_XI_OPS_ADMIN_TOKEN`") &&
	    productionEvidenceTemplate.includes("Ops token shape checked") &&
	    productionEvidenceTemplate.includes("Billing admin token shape checked") &&
	    productionEvidenceTemplate.includes("Migration token shape checked") &&
	    productionEvidenceTemplate.includes("`VITE_SITE_URL` must match `Deployment.App origin`") &&
    productionEvidenceTemplate.includes("`VITE_CONVEX_URL` must match `Deployment.Convex cloud origin`") &&
    productionEvidenceTemplate.includes("must use the same Convex deployment label") &&
	    productionEvidenceTemplate.includes("The Google callback URL must use `Deployment.Convex HTTP Actions origin`") &&
	    productionEvidenceTemplate.includes("exact `/api/auth/callback/google` path") &&
	    productionEvidenceTemplate.includes("`Host profile row id` must be a concrete observed host profile row id or alias") &&
	    productionEvidenceTemplate.includes("`Redirect target after sign-in` must be a root-relative host app route") &&
	    productionEvidenceTemplate.includes("`/setup` or `/campaigns`") &&
	    productionEvidenceTemplate.includes("query string") &&
	    productionVerificationRunbook.includes("Confirm redirect to setup or Campaign Studio") &&
	    productionVerificationRunbook.includes("draw route") &&
	    productionVerificationRunbook.includes("Record the final redirect target as a root-relative route only") &&
	    productionEvidenceReportValidator.includes('const allowedGoogleOAuthRedirectPaths = new Set(["/setup", "/campaigns"])') &&
	    productionEvidenceReportValidator.includes("function assertAllowedRootRelativeRoute") &&
	    productionEvidenceReportValidator.includes("must not include a query string") &&
	    productionEvidenceReportValidator.includes("Google OAuth.Redirect target after sign-in") &&
	    productionEvidenceReportValidator.includes("draw OAuth redirect target") &&
	    productionEvidenceReportValidator.includes("OAuth redirect target with query") &&
	    productionEvidenceReportValidatorImportTest.includes("external OAuth redirect target") &&
	    productionEvidenceReportValidatorImportTest.includes("wrong OAuth redirect target") &&
	    productionEvidenceReportValidatorImportTest.includes("OAuth redirect target with query") &&
	    productionEvidenceTemplate.includes("`Public claim code` must be the exact 24-character lowercase hex token") &&
	    productionEvidenceReportValidator.includes('import { PUBLIC_CODE_HEX_LENGTH, normalizePublicCode } from "../convex/publicLinks.ts"') &&
	    productionEvidenceReportValidator.includes("normalizePublicCode(publicClaimCode) === publicClaimCode") &&
	    productionEvidenceReportValidator.includes("Campaign And Public Claim.Public claim code must be a ${PUBLIC_CODE_HEX_LENGTH}-character lowercase hex code") &&
	    productionEvidenceTemplate.includes("Malformed public code closed") &&
	    productionEvidenceTemplate.includes("Expired public code closed") &&
	    productionEvidenceTemplate.includes("Inactive campaign public claim closed") &&
	    productionEvidenceTemplate.includes("Guest API internal ids absent") &&
	    productionEvidenceTemplate.includes("guest-facing claim APIs did not expose") &&
	    productionEvidenceTemplate.includes("do not reuse one generic") &&
	    productionVerificationRunbook.includes("Verify an expired public-code row fails closed") &&
	    productionVerificationRunbook.includes("Verify a public claim link for an inactive campaign fails closed") &&
	    productionVerificationRunbook.includes("inactive-campaign closed state") &&
	    productionEvidenceTemplate.includes("The Polar webhook URL must use `Deployment.Convex HTTP Actions origin`") &&
    productionEvidenceTemplate.includes("exact `/polar/events` path") &&
    productionEvidenceTemplate.includes("JSON artifact endpoint validator also rejects explicit default ports") &&
    productionEvidenceTemplate.includes("endpoints.googleCallbackUrl") &&
    productionEvidenceTemplate.includes("endpoints.polarWebhookUrl") &&
    productionEvidenceTemplate.includes("The Polar checkout and customer portal return origins must match") &&
    productionEvidenceTemplate.includes("Polar customer id, subscription id, and product alias/id evidence must be the") &&
    productionEvidenceTemplate.includes("concrete observed values") &&
    productionEvidenceReportValidator.includes("const billingReturnPath = \"/campaigns\"") &&
    productionEvidenceReportValidator.includes("function assertPublicAppUrl") &&
    productionEvidenceReportValidator.includes("Polar.Checkout return URL") &&
    productionEvidenceReportValidator.includes("Polar.Customer portal return URL") &&
    productionEvidenceReportValidator.includes("must use ${expectedPath}") &&
    productionEvidenceReportValidatorImportTest.includes("wrong Polar checkout return path") &&
    productionEvidenceReportValidatorImportTest.includes("wrong Polar portal return path") &&
    productionEvidenceTemplate.includes("clean HTTPS public origins") &&
    productionEvidenceTemplate.includes("custom or explicit default ports") &&
    productionEvidenceTemplate.includes("`--evidence-out` path") &&
    productionEvidenceTemplate.includes("must all refer to the same `li-xi-production-readiness*.json` artifact") &&
    productionEvidenceTemplate.includes("Cloudflare R2 evidence must prove a supported campaign image upload") &&
    productionEvidenceTemplate.includes("`Asset row id` must be the concrete Convex asset row id") &&
    productionEvidenceTemplate.includes("`Asset owner id` must match `Analytics And Backfill.Owner id`") &&
    productionEvidenceTemplate.includes("`Asset campaign id or slug` must match the tested") &&
    productionEvidenceTemplate.includes("`R2 key` must be the relative") &&
    productionEvidenceTemplate.includes("object key, not a signed URL") &&
    productionEvidenceTemplate.includes("not a signed URL, public") &&
    productionEvidenceReportValidator.includes("function assertR2ObjectKeyEvidence") &&
    productionEvidenceReportValidator.includes("Cloudflare R2.R2 key must be an object key, not a URL") &&
    productionEvidenceReportValidator.includes("Cloudflare R2.R2 key must not include query or hash data") &&
    productionEvidenceReportValidator.includes("Cloudflare R2.R2 key must use slash path separators, not backslashes") &&
    productionEvidenceReportValidator.includes("R2 key recorded as URL") &&
    productionEvidenceReportValidator.includes("R2 key with traversal") &&
    productionEvidenceReportValidator.includes("R2 key with backslash") &&
    productionEvidenceReportValidatorImportTest.includes("R2 key recorded as signed URL") &&
    productionEvidenceReportValidatorImportTest.includes("R2 key with backslashes") &&
    productionEvidenceTemplate.includes("`Content type` must be one of `image/jpeg`,") &&
    productionEvidenceTemplate.includes("`image/png`, `image/webp`, `image/gif`, or `image/avif`") &&
    productionEvidenceTemplate.includes("through 8 MB") &&
    productionEvidenceTemplate.includes("public URL, query string, hash, absolute path,") &&
    productionEvidenceTemplate.includes("`Metadata source` must be") &&
    productionEvidenceTemplate.includes("`r2`") &&
    productionEvidenceTemplate.includes("`Lifecycle status` must be") &&
    productionEvidenceTemplate.includes("`attached`; validation timestamp, Campaign Studio preview") &&
    productionEvidenceTemplate.includes("checks` must be `pass`") &&
    productionEvidenceTemplate.includes("use staging") &&
    productionEvidenceTemplate.includes("evidence or local contract-test evidence") &&
    productionEvidenceTemplate.includes("`productionReady` and") &&
    productionEvidenceTemplate.includes("must be `true` or `yes`") &&
    productionEvidenceTemplate.includes("## Readiness Artifact") &&
    productionEvidenceTemplate.includes("npm run verify:evidence -- /tmp/li-xi-production-readiness.json") &&
    productionEvidenceTemplate.includes("## Google OAuth") &&
    productionEvidenceTemplate.includes("## Campaign And Public Claim") &&
    productionEvidenceTemplate.includes("Start CTA rendered") &&
    productionEvidenceTemplate.includes("Collect CTA rendered") &&
    productionEvidenceTemplate.includes("## Cloudflare R2") &&
    productionEvidenceTemplate.includes("Asset owner id") &&
    productionEvidenceTemplate.includes("Asset campaign id or slug") &&
    productionEvidenceTemplate.includes("Bucket matches configured R2 bucket") &&
    productionEvidenceTemplate.includes("Metadata source") &&
    productionEvidenceTemplate.includes("## Polar") &&
    productionEvidenceTemplate.includes("Checkout return origin") &&
    productionEvidenceTemplate.includes("Checkout return URL") &&
    productionEvidenceTemplate.includes("Customer portal return origin") &&
    productionEvidenceTemplate.includes("Customer portal return URL") &&
    productionVerificationRunbook.includes("full return URL") &&
    productionVerificationRunbook.includes("returns to `/campaigns`") &&
    productionEvidenceTemplate.includes("Polar webhook URL") &&
	    productionEvidenceTemplate.includes("## Analytics And Backfill") &&
	    productionEvidenceTemplate.includes("Analytics `Owner id` and `Campaign id` must be concrete observed ids or aliases") &&
	    productionEvidenceTemplate.includes("`Analytics And Backfill.Campaign id` must match") &&
	    productionEvidenceTemplate.includes("Owner backfill audit decisions") &&
	    productionEvidenceTemplate.includes("Campaign backfill rerun idempotent") &&
	    productionVerificationRunbook.includes("no campaign counter or Aggregate") &&
	    productionVerificationRunbook.includes("Owner and campaign rerun summaries showing no double-count") &&
	    productionEvidenceTemplate.includes("## Cleanup") &&
    productionEvidenceTemplate.includes("Maintenance dry-run audit decisions") &&
    productionEvidenceTemplate.includes("Do not") &&
    productionEvidenceTemplate.includes("commit filled evidence"),
  "production evidence template must capture readiness artifact, OAuth, public claims, R2, Polar, analytics, cleanup, and no-secret guidance"
);

if (failures.length > 0) {
  console.error("SaaS contract checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("SaaS contract checks passed");
