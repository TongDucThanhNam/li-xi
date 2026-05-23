#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { PUBLIC_CODE_HEX_LENGTH, normalizePublicCode } from "../convex/publicLinks.ts";

const campaignAssetMaxBytes = 8 * 1024 * 1024;
const campaignAssetAllowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const convexDeploymentLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const billingReturnPath = "/campaigns";
const allowedGoogleOAuthRedirectPaths = new Set(["/setup", "/campaigns"]);

const requiredSections = [
  "Deployment",
  "Local Gate",
  "Readiness Artifact",
  "Google OAuth",
  "Campaign And Public Claim",
  "Cloudflare R2",
  "Polar",
  "Analytics And Backfill",
  "Cleanup",
  "Final Decision",
];

const requiredFilledFields = {
  Deployment: [
    "Environment",
    "App origin",
    "Convex cloud origin",
    "Convex HTTP Actions origin",
    "Evidence date",
    "Verifier",
    "Release/ref",
  ],
  "Local Gate": ["Command", "Result"],
  "Readiness Artifact": [
    "Command",
    "Artifact validation",
    "Result",
    "Artifact location",
	    "`productionReady`",
	    "Redaction metadata present",
	    "Ops token shape checked",
	    "Billing admin token shape checked",
	    "Migration token shape checked",
	  ],
  "Google OAuth": [
    "Google callback URL",
    "Browser sign-in result",
    "Redirect target after sign-in",
    "Host profile row id",
    "Legacy owner session absent or ignored",
    "Reload/token-refresh check",
    "Result",
  ],
  "Campaign And Public Claim": [
    "Campaign id or slug",
    "Campaign status",
    "Start CTA rendered",
    "Collect CTA rendered",
    "Station session created",
    "Public claim code",
    "Public claim hero rendered",
    "Redeem result",
    "Reopen same code closed",
    "Malformed public code closed",
    "Expired public code closed",
    "Inactive campaign public claim closed",
    "Guest API internal ids absent",
    "Result",
  ],
  "Cloudflare R2": [
    "Asset row id",
    "Asset owner id",
    "Asset campaign id or slug",
    "R2 key",
    "Content type",
    "Size",
    "Bucket matches configured R2 bucket",
    "Metadata source",
    "Lifecycle status",
    "Validation timestamp present",
    "Campaign Studio preview rendered",
    "Public claim hero rendered",
    "Station hero rendered",
    "Negative checks",
    "Result",
  ],
  Polar: [
    "Polar customer id",
    "Polar subscription id",
    "Product alias/id",
    "Checkout result",
    "Plan change result",
    "Customer portal result",
    "Checkout return origin",
    "Checkout return URL",
    "Customer portal return origin",
    "Customer portal return URL",
    "Polar webhook URL",
    "Webhook receipt time",
    "Convex billing state",
    "Billing sync token removed",
    "Result",
  ],
  "Analytics And Backfill": [
    "Owner id",
    "Campaign id",
    "New station session counter result",
    "New public claim redemption counter result",
    "Owner backfill dry-run",
    "Owner backfill audit decisions",
	    "Owner backfill apply",
	    "Owner backfill rerun idempotent",
	    "Campaign backfill dry-run/apply/rerun",
	    "Campaign backfill rerun idempotent",
	    "Migration token removed",
    "Result",
  ],
  Cleanup: [
    "Temporary tokens removed",
    "Legacy flags disabled",
    "Maintenance dry-run audit decisions",
    "Test public links cancelled",
    "Test campaigns/assets cleaned up",
    "Test Polar subscriptions cleaned up",
    "Secrets rotated if exposed",
    "Result",
  ],
  "Final Decision": ["Production readiness accepted", "Remaining risks", "Follow-up tasks", "Approver"],
};

function usage() {
  console.log(`Usage: node scripts/validate-production-evidence-report.mjs <evidence-report.md>
       node scripts/validate-production-evidence-report.mjs --self-test`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sectionBody(markdown, heading) {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
  const match = markdown.match(pattern);
  assert(match?.index !== undefined, `Missing section: ${heading}`);

  const start = match.index + match[0].length;
  const nextHeading = markdown.slice(start).search(/^## /m);
  return nextHeading < 0 ? markdown.slice(start) : markdown.slice(start, start + nextHeading);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldValue(body, field) {
  const pattern = new RegExp(`^- ${escapeRegExp(field)}:[^\\S\\r\\n]*(.*)$`);
  const lines = body.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  assert(index >= 0, `Missing field: ${field}`);

  const match = lines[index].match(pattern);
  const valueLines = [match?.[1] ?? ""];
  for (const line of lines.slice(index + 1)) {
    if (line.startsWith("- ") || line.startsWith("## ")) {
      break;
    }
    if (/^\s+\S/.test(line)) {
      valueLines.push(line.trim());
    }
  }
  return stripInlineCode(valueLines.join(" ").trim());
}

function stripInlineCode(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isFilled(value) {
  const normalized = normalize(value);
  return Boolean(
    value &&
      value !== "-" &&
      normalized !== "todo" &&
      normalized !== "tbd" &&
      normalized !== "n/a" &&
      normalized !== "na" &&
      normalized !== "skipped" &&
      normalized !== "blocked" &&
      normalized !== "not tested" &&
      normalized !== "not verified" &&
      normalized !== "unverified" &&
      normalized !== "local only" &&
      normalized !== "local-only" &&
      normalized !== "verified locally only" &&
      !/^<[^>]+>$/.test(value)
  );
}

function assertFilledReportField(section, body, field) {
  const value = fieldValue(body, field);
  assert(isFilled(value), `${section}.${field} must be filled`);
  return value;
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function assertFieldOneOf(section, body, field, allowedValues) {
  const value = normalize(fieldValue(body, field));
  assert(
    allowedValues.includes(value),
    `${section}.${field} must be one of: ${allowedValues.join(", ")}`
  );
}

function assertPassEvidence(section, body, field) {
  assertFieldOneOf(section, body, field, ["pass", "yes", "true"]);
}

function assertYesEvidence(section, body, field) {
  assertFieldOneOf(section, body, field, ["yes", "true", "pass"]);
}

function assertReviewedEvidence(section, body, field, requiredTerms) {
  const value = normalize(fieldValue(body, field));
  assert(value.includes("review"), `${section}.${field} must record reviewed audit decisions`);
  for (const term of requiredTerms) {
    assert(
      value.includes(term.toLowerCase()),
      `${section}.${field} must mention ${term}`
    );
  }
}

function assertReviewedCleanupEvidence(section, body, field, requiredTerms) {
  const value = normalize(fieldValue(body, field));
  assert(
    value.includes("review") || value.includes("checked") || value.includes("confirmed"),
    `${section}.${field} must record reviewed cleanup evidence`
  );
  assert(
    value.includes("removed") || value.includes("absent") || value.includes("disabled"),
    `${section}.${field} must record the cleaned-up state`
  );
  for (const term of requiredTerms) {
    assert(value.includes(term.toLowerCase()), `${section}.${field} must mention ${term}`);
  }
}

function assertSecretExposureCleanupEvidence(section, body, field) {
  const value = normalize(fieldValue(body, field));
  assert(
    value.includes("review") || value.includes("checked") || value.includes("confirmed"),
    `${section}.${field} must record reviewed secret-exposure evidence`
  );
  assert(
    value.includes("not exposed") ||
      value.includes("not needed") ||
      value.includes("none exposed") ||
      value.includes("rotated"),
    `${section}.${field} must record whether exposed secrets were rotated or rotation was not needed`
  );
}

function assertNonBlockingFollowUpEvidence(section, body, field) {
  const value = normalize(fieldValue(body, field));
  const blockerTerms = [
    "blocker",
    "blocked",
    "failed",
    "not tested",
    "not verified",
    "unverified",
    "launch risk",
    "remaining risk",
  ];
  for (const term of blockerTerms) {
    assert(!value.includes(term), `${section}.${field} must not record unresolved launch blockers`);
  }
}

function assertRenderedCopyEvidence(section, body, field) {
  const value = fieldValue(body, field).trim();
  const normalized = normalize(value);
  assert(value.length >= 2 && value.length <= 120, `${section}.${field} must record the rendered copy text`);
  assert(
    !["pass", "yes", "true", "ok", "rendered", "shown", "visible"].includes(normalized),
    `${section}.${field} must record the observed copy text, not a boolean result`
  );
  return value;
}

function assertConcreteEvidenceValue(section, body, field) {
  const value = fieldValue(body, field).trim();
  const normalized = normalize(value);
  assert(value.length >= 2 && value.length <= 160, `${section}.${field} must be a concrete evidence value`);
  assert(
    !/[<>]/.test(value) &&
      !normalized.includes("placeholder") &&
      !normalized.includes("todo") &&
      !normalized.includes("example"),
    `${section}.${field} must not be a placeholder`
  );
  assert(!/^https?:\/\//i.test(value), `${section}.${field} must not be a URL`);
  assert(
    !["pass", "yes", "true", "ok", "done", "present", "created", "active", "trialing"].includes(normalized),
    `${section}.${field} must record the concrete id or alias, not a boolean/status result`
  );
}

function assertR2ObjectKeyEvidence(body) {
  const value = fieldValue(body, "R2 key").trim();
  assert(value.length >= 3 && value.length <= 1024, "Cloudflare R2.R2 key must be a bounded object key");
  assert(
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return !/\s/.test(character) && code > 31 && code !== 127;
    }),
    "Cloudflare R2.R2 key must not contain whitespace or control characters"
  );
  assert(!value.startsWith("/") && !value.startsWith("\\"), "Cloudflare R2.R2 key must be relative, not absolute");
  assert(!value.startsWith("//"), "Cloudflare R2.R2 key must not be a scheme-relative URL");
  assert(!value.includes("\\"), "Cloudflare R2.R2 key must use slash path separators, not backslashes");
  assert(!/^[a-z][a-z0-9+.-]*:\/\//i.test(value), "Cloudflare R2.R2 key must be an object key, not a URL");
  assert(!value.includes("?") && !value.includes("#"), "Cloudflare R2.R2 key must not include query or hash data");
  assert(
    value
      .split(/[\\/]/)
      .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "Cloudflare R2.R2 key must not contain empty or traversal path segments"
  );
}

function assertIsoDateTimeField(section, body, field) {
  const value = fieldValue(body, field);
  const time = Date.parse(value);
  assert(
    Number.isFinite(time) && new Date(time).toISOString() === value,
    `${section}.${field} must be an ISO-8601 UTC timestamp`
  );
}

function assertIsoDateField(section, body, field) {
  const value = fieldValue(body, field);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value), `${section}.${field} must be an ISO date`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  assert(
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(`${value}T`),
    `${section}.${field} must be a valid ISO date`
  );
}

function assertCommandIncludes(section, body, field, requiredParts) {
  const value = fieldValue(body, field);
  for (const requiredPart of requiredParts) {
    assert(
      value.includes(requiredPart),
      `${section}.${field} must include ${requiredPart}`
    );
  }
}

function assertCommandIncludesAny(section, body, field, requiredParts) {
  const value = fieldValue(body, field);
  assert(
    requiredParts.some((requiredPart) => value.includes(requiredPart)),
    `${section}.${field} must include one of: ${requiredParts.join(", ")}`
  );
}

function commandEnvValue(command, name) {
  return command.match(new RegExp(`(?:^|\\s)${escapeRegExp(name)}=(\\S+)`))?.[1] ?? "";
}

function cleanOrigin(value, label) {
  try {
    const normalizedInput = value.trim();
    const url = new URL(value);
    assert(url.protocol === "https:", `${label} must be HTTPS`);
    assert(url.username === "" && url.password === "", `${label} must not include credentials`);
    assert(url.pathname === "/" && url.search === "" && url.hash === "", `${label} must be an origin`);
    assert(url.port === "", `${label} must not include a port`);
    assert(
      normalizedInput === url.origin || normalizedInput === `${url.origin}/`,
      `${label} must be a clean origin`
    );
    return url.origin;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} must be a valid HTTPS origin`);
  }
}

function isRawIpv4Hostname(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isRawIpv6Hostname(hostname) {
  return hostname.includes(":");
}

function isLocalOrPrivateHostname(hostname) {
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

function publicAppOrigin(value, label) {
  const origin = cleanOrigin(value, label);
  const hostname = new URL(origin).hostname;
  assert(!isRawIpv4Hostname(hostname), `${label} must not be a raw IPv4 address`);
  assert(!isRawIpv6Hostname(hostname), `${label} must not be a raw IPv6 address`);
  assert(!isLocalOrPrivateHostname(hostname), `${label} must be a public app origin`);
  return origin;
}

function assertPublicAppUrl(value, label, expectedOrigin, expectedPath, allowedSearches = [""]) {
  try {
    const url = new URL(value.trim());
    assert(url.protocol === "https:", `${label} must be HTTPS`);
    assert(url.username === "" && url.password === "", `${label} must not include credentials`);
    assert(url.port === "", `${label} must not include a port`);
    assert(url.origin === expectedOrigin, `${label} must use ${expectedOrigin}`);
    assert(url.pathname === expectedPath, `${label} must use ${expectedPath}`);
    assert(
      allowedSearches.includes(url.search),
      `${label} must use one of these query strings: ${allowedSearches.map((search) => search || "(none)").join(", ")}`
    );
    assert(url.hash === "", `${label} must not include a hash`);
    assert(!isRawIpv4Hostname(url.hostname), `${label} must not be a raw IPv4 address`);
    assert(!isRawIpv6Hostname(url.hostname), `${label} must not be a raw IPv6 address`);
    assert(!isLocalOrPrivateHostname(url.hostname), `${label} must be a public app URL`);
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
}

function convexDeploymentLabel(origin, suffix, label) {
  const hostname = new URL(origin).hostname;
  assert(hostname.endsWith(suffix), `${label} must end with ${suffix}`);
  const deployment = hostname.slice(0, -suffix.length);
  assert(Boolean(deployment), `${label} must include a deployment label`);
  assert(convexDeploymentLabelPattern.test(deployment), `${label} must include a clean deployment label`);
  return deployment;
}

function assertEndpointUrl(value, label, expectedOrigin, expectedPath) {
  try {
    const url = new URL(value);
    const expectedUrl = `${expectedOrigin}${expectedPath}`;
    assert(url.protocol === "https:", `${label} must be HTTPS`);
    assert(url.username === "" && url.password === "", `${label} must not include credentials`);
    assert(url.origin === expectedOrigin, `${label} must use ${expectedOrigin}`);
    assert(url.pathname === expectedPath, `${label} must use ${expectedPath}`);
    assert(url.search === "" && url.hash === "", `${label} must not include query or hash`);
    assert(value.trim() === expectedUrl, `${label} must be a clean endpoint URL`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
}

function assertAllowedRootRelativeRoute(value, label, allowedPaths) {
  const trimmed = value.trim();
  assert(trimmed.startsWith("/") && !trimmed.startsWith("//"), `${label} must be a root-relative app route`);

  try {
    const baseOrigin = "https://app.example.invalid";
    const url = new URL(trimmed, baseOrigin);
    assert(url.origin === baseOrigin, `${label} must stay on the app origin`);
    assert(allowedPaths.has(url.pathname), `${label} must be one of: ${[...allowedPaths].join(", ")}`);
    assert(url.search === "", `${label} must not include a query string`);
    assert(url.hash === "", `${label} must not include a hash`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} must be a valid root-relative app route`);
  }
}

function assertProductionReadinessCommandShape(body) {
  const command = fieldValue(body, "Command");
  const artifactLocation = fieldValue(body, "Artifact location");
  const artifactValidation = fieldValue(body, "Artifact validation");
  const evidenceOutPath = command.match(/--evidence-out(?:=|\s+)(\S+)/)?.[1];

  assert(evidenceOutPath, "Readiness Artifact.Command must include an evidence output path");
  assert(
    !/[<>\s]/.test(evidenceOutPath),
    "Readiness Artifact.Command evidence output path must not be a placeholder or contain whitespace"
  );
  assert(
    /(?:^|\/)li-xi-production-readiness[^/\s]*\.json$/.test(evidenceOutPath),
    "Readiness Artifact.Command evidence output path must be a li-xi production readiness JSON artifact"
  );
  assert(
    artifactLocation === evidenceOutPath,
    "Readiness Artifact.Artifact location must match --evidence-out path"
  );
  assert(
    artifactValidation.includes(evidenceOutPath),
    "Readiness Artifact.Artifact validation must validate the generated artifact path"
  );
  assert(
    /\bVITE_CONVEX_URL=https:\/\/[^<>\s]+\.convex\.cloud\b/.test(command),
    "Readiness Artifact.Command must include a concrete HTTPS VITE_CONVEX_URL"
  );
  assert(
    /\bVITE_SITE_URL=https:\/\/[^<>\s]+\b/.test(command),
    "Readiness Artifact.Command must include a concrete HTTPS VITE_SITE_URL"
  );
  assert(
    !command.includes("VITE_CONVEX_URL=<") && !command.includes("VITE_SITE_URL=<"),
    "Readiness Artifact.Command must not use placeholder public deployment origins"
  );
  assert(
    /\b(?:LI_XI_OPS_ADMIN_TOKEN|LIXI_OPS_ADMIN_TOKEN)=<[^>\s]+>(?=\s|$)/.test(command) ||
      /\b(?:LI_XI_OPS_ADMIN_TOKEN|LIXI_OPS_ADMIN_TOKEN)=\$[A-Z0-9_]+\b/.test(command),
    "Readiness Artifact.Command must keep the ops token redacted"
  );
}

function assertDeploymentOriginsMatchReadinessCommand(deploymentBody, readinessBody) {
  const command = fieldValue(readinessBody, "Command");
  const appOrigin = publicAppOrigin(fieldValue(deploymentBody, "App origin"), "Deployment.App origin");
  const convexCloudOrigin = cleanOrigin(
    fieldValue(deploymentBody, "Convex cloud origin"),
    "Deployment.Convex cloud origin"
  );
  const convexSiteOrigin = cleanOrigin(
    fieldValue(deploymentBody, "Convex HTTP Actions origin"),
    "Deployment.Convex HTTP Actions origin"
  );
  const viteSiteUrl = publicAppOrigin(
    commandEnvValue(command, "VITE_SITE_URL"),
    "Readiness Artifact.Command VITE_SITE_URL"
  );
  const viteConvexUrl = cleanOrigin(
    commandEnvValue(command, "VITE_CONVEX_URL"),
    "Readiness Artifact.Command VITE_CONVEX_URL"
  );

  assert(
    viteSiteUrl === appOrigin,
    "Readiness Artifact.Command VITE_SITE_URL must match Deployment.App origin"
  );
  assert(
    viteConvexUrl === convexCloudOrigin,
    "Readiness Artifact.Command VITE_CONVEX_URL must match Deployment.Convex cloud origin"
  );

  const convexCloudDeployment = convexDeploymentLabel(
    convexCloudOrigin,
    ".convex.cloud",
    "Deployment.Convex cloud origin"
  );
  const convexSiteDeployment = convexDeploymentLabel(
    convexSiteOrigin,
    ".convex.site",
    "Deployment.Convex HTTP Actions origin"
  );
  assert(
    convexCloudDeployment === convexSiteDeployment,
    "Deployment Convex cloud and HTTP Actions origins must use the same deployment label"
  );
}

function assertDeploymentMetadataEvidence(deploymentBody) {
  assertFieldOneOf("Deployment", deploymentBody, "Environment", ["staging", "production"]);
  assertIsoDateField("Deployment", deploymentBody, "Evidence date");
  assertConcreteEvidenceValue("Deployment", deploymentBody, "Verifier");
  assertConcreteEvidenceValue("Deployment", deploymentBody, "Release/ref");
}

function assertGoogleOAuthEvidence(deploymentBody, googleOAuthBody) {
  const convexSiteOrigin = cleanOrigin(
    fieldValue(deploymentBody, "Convex HTTP Actions origin"),
    "Deployment.Convex HTTP Actions origin"
  );
  assertPassEvidence("Google OAuth", googleOAuthBody, "Browser sign-in result");
  assertConcreteEvidenceValue("Google OAuth", googleOAuthBody, "Host profile row id");
  assertYesEvidence("Google OAuth", googleOAuthBody, "Legacy owner session absent or ignored");
  assertPassEvidence("Google OAuth", googleOAuthBody, "Reload/token-refresh check");
  assertEndpointUrl(
    fieldValue(googleOAuthBody, "Google callback URL"),
    "Google OAuth.Google callback URL",
    convexSiteOrigin,
    "/api/auth/callback/google"
  );
  assertAllowedRootRelativeRoute(
    fieldValue(googleOAuthBody, "Redirect target after sign-in"),
    "Google OAuth.Redirect target after sign-in",
    allowedGoogleOAuthRedirectPaths
  );
}

function assertCampaignAndPublicClaimEvidence(campaignBody) {
  assertConcreteEvidenceValue("Campaign And Public Claim", campaignBody, "Campaign id or slug");
  assertFieldOneOf("Campaign And Public Claim", campaignBody, "Campaign status", ["active"]);
  const startCta = assertRenderedCopyEvidence("Campaign And Public Claim", campaignBody, "Start CTA rendered");
  const collectCta = assertRenderedCopyEvidence("Campaign And Public Claim", campaignBody, "Collect CTA rendered");
  assert(
    normalize(startCta) !== normalize(collectCta),
    "Campaign And Public Claim start and collect CTA evidence must be distinct copy values"
  );
  const publicClaimCode = fieldValue(campaignBody, "Public claim code");
  assert(
    normalizePublicCode(publicClaimCode) === publicClaimCode,
    `Campaign And Public Claim.Public claim code must be a ${PUBLIC_CODE_HEX_LENGTH}-character lowercase hex code`
  );
  assertYesEvidence("Campaign And Public Claim", campaignBody, "Station session created");
  assertPassEvidence("Campaign And Public Claim", campaignBody, "Public claim hero rendered");
  assertPassEvidence("Campaign And Public Claim", campaignBody, "Redeem result");
  assertYesEvidence("Campaign And Public Claim", campaignBody, "Reopen same code closed");
  assertYesEvidence("Campaign And Public Claim", campaignBody, "Malformed public code closed");
  assertYesEvidence("Campaign And Public Claim", campaignBody, "Expired public code closed");
  assertYesEvidence("Campaign And Public Claim", campaignBody, "Inactive campaign public claim closed");
  assertYesEvidence("Campaign And Public Claim", campaignBody, "Guest API internal ids absent");
}

function assertR2Evidence(r2Body, campaignBody, analyticsBody) {
  assertConcreteEvidenceValue("Cloudflare R2", r2Body, "Asset row id");
  const ownerId = fieldValue(analyticsBody, "Owner id").trim();
  const assetOwnerId = fieldValue(r2Body, "Asset owner id").trim();
  assertConcreteEvidenceValue("Cloudflare R2", r2Body, "Asset owner id");
  assert(
    assetOwnerId === ownerId,
    "Cloudflare R2.Asset owner id must match Analytics And Backfill.Owner id"
  );
  const campaignIdOrSlug = fieldValue(campaignBody, "Campaign id or slug").trim();
  const assetCampaignIdOrSlug = fieldValue(r2Body, "Asset campaign id or slug").trim();
  assertConcreteEvidenceValue("Cloudflare R2", r2Body, "Asset campaign id or slug");
  assert(
    assetCampaignIdOrSlug === campaignIdOrSlug,
    "Cloudflare R2.Asset campaign id or slug must match Campaign And Public Claim.Campaign id or slug"
  );
  assertR2ObjectKeyEvidence(r2Body);

  const contentType = fieldValue(r2Body, "Content type").split(";")[0].trim().toLowerCase();
  assert(
    campaignAssetAllowedContentTypes.has(contentType),
    "Cloudflare R2.Content type must be a supported campaign image type"
  );

  const sizeValue = fieldValue(r2Body, "Size");
  assert(/^\d+$/.test(sizeValue), "Cloudflare R2.Size must be an integer byte count");
  const size = Number(sizeValue);
  assert(
    Number.isSafeInteger(size) && size > 0 && size <= campaignAssetMaxBytes,
    "Cloudflare R2.Size must be between 1 byte and 8 MB"
  );

  assertFieldOneOf("Cloudflare R2", r2Body, "Bucket matches configured R2 bucket", ["true", "yes", "pass"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Metadata source", ["r2"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Lifecycle status", ["attached"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Validation timestamp present", ["true", "yes"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Campaign Studio preview rendered", ["true", "yes", "pass"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Public claim hero rendered", ["true", "yes", "pass"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Station hero rendered", ["true", "yes", "pass"]);
  assertFieldOneOf("Cloudflare R2", r2Body, "Negative checks", ["pass"]);
}

function assertPolarEvidence(deploymentBody, polarBody) {
  assertConcreteEvidenceValue("Polar", polarBody, "Polar customer id");
  assertConcreteEvidenceValue("Polar", polarBody, "Polar subscription id");
  assertConcreteEvidenceValue("Polar", polarBody, "Product alias/id");
  const appOrigin = publicAppOrigin(fieldValue(deploymentBody, "App origin"), "Deployment.App origin");
  const checkoutReturnOrigin = publicAppOrigin(
    fieldValue(polarBody, "Checkout return origin"),
    "Polar.Checkout return origin"
  );
  const customerPortalReturnOrigin = publicAppOrigin(
    fieldValue(polarBody, "Customer portal return origin"),
    "Polar.Customer portal return origin"
  );
  const convexSiteOrigin = cleanOrigin(
    fieldValue(deploymentBody, "Convex HTTP Actions origin"),
    "Deployment.Convex HTTP Actions origin"
  );
  assert(checkoutReturnOrigin === appOrigin, "Polar.Checkout return origin must match Deployment.App origin");
  assert(
    customerPortalReturnOrigin === appOrigin,
    "Polar.Customer portal return origin must match Deployment.App origin"
  );
  assertPublicAppUrl(
    fieldValue(polarBody, "Checkout return URL"),
    "Polar.Checkout return URL",
    appOrigin,
    billingReturnPath,
    ["", "?checkout=success"]
  );
  assertPublicAppUrl(
    fieldValue(polarBody, "Customer portal return URL"),
    "Polar.Customer portal return URL",
    appOrigin,
    billingReturnPath
  );
  assertPassEvidence("Polar", polarBody, "Checkout result");
  assertPassEvidence("Polar", polarBody, "Plan change result");
  assertPassEvidence("Polar", polarBody, "Customer portal result");
  assertFieldOneOf("Polar", polarBody, "Convex billing state", ["active", "trialing"]);
  assertYesEvidence("Polar", polarBody, "Billing sync token removed");
  assertIsoDateTimeField("Polar", polarBody, "Webhook receipt time");
  assertEndpointUrl(
    fieldValue(polarBody, "Polar webhook URL"),
    "Polar.Polar webhook URL",
    convexSiteOrigin,
    "/polar/events"
  );
}

function assertAnalyticsAndBackfillEvidence(analyticsBody, campaignBody) {
  assertConcreteEvidenceValue("Analytics And Backfill", analyticsBody, "Owner id");
  const campaignIdOrSlug = fieldValue(campaignBody, "Campaign id or slug").trim();
  const analyticsCampaignId = fieldValue(analyticsBody, "Campaign id").trim();
  assertConcreteEvidenceValue("Analytics And Backfill", analyticsBody, "Campaign id");
  assert(
    analyticsCampaignId === campaignIdOrSlug,
    "Analytics And Backfill.Campaign id must match Campaign And Public Claim.Campaign id or slug"
  );
  assertPassEvidence("Analytics And Backfill", analyticsBody, "New station session counter result");
  assertPassEvidence("Analytics And Backfill", analyticsBody, "New public claim redemption counter result");
  assertPassEvidence("Analytics And Backfill", analyticsBody, "Owner backfill dry-run");
  assertReviewedEvidence("Analytics And Backfill", analyticsBody, "Owner backfill audit decisions", [
    "auditDecisions",
  ]);
	  assertPassEvidence("Analytics And Backfill", analyticsBody, "Owner backfill apply");
	  assertPassEvidence("Analytics And Backfill", analyticsBody, "Owner backfill rerun idempotent");
	  assertPassEvidence("Analytics And Backfill", analyticsBody, "Campaign backfill dry-run/apply/rerun");
	  assertPassEvidence("Analytics And Backfill", analyticsBody, "Campaign backfill rerun idempotent");
	  assertYesEvidence("Analytics And Backfill", analyticsBody, "Migration token removed");
}

function assertCleanupEvidence(cleanupBody) {
  assertReviewedCleanupEvidence("Cleanup", cleanupBody, "Temporary tokens removed", [
    "LI_XI_OPS_ADMIN_TOKEN",
    "LIXI_OPS_ADMIN_TOKEN",
    "LI_XI_BILLING_ADMIN_TOKEN",
    "LIXI_BILLING_ADMIN_TOKEN",
    "LI_XI_MIGRATION_TOKEN",
    "LIXI_MIGRATION_TOKEN",
  ]);
  assertReviewedCleanupEvidence("Cleanup", cleanupBody, "Legacy flags disabled", [
    "LI_XI_ENABLE_LEGACY_AUTH",
    "LEGACY_AUTH_ENABLED",
    "LI_XI_ENABLE_LEGACY_OWNER_BRIDGE",
    "LEGACY_OWNER_BRIDGE_ENABLED",
    "VITE_LI_XI_ENABLE_LEGACY_AUTH",
    "VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE",
    "LI_XI_ENABLE_PAID_PLAN_FALLBACK",
    "LIXI_ENABLE_PAID_PLAN_FALLBACK",
  ]);
  assertReviewedEvidence("Cleanup", cleanupBody, "Maintenance dry-run audit decisions", [
    "sessionDecisions",
    "assetDecisions",
    "profileDecision",
    "campaignDecisions",
    "budgetDecisions",
    "profileDecisions",
  ]);
  assertYesEvidence("Cleanup", cleanupBody, "Test public links cancelled");
  assertYesEvidence("Cleanup", cleanupBody, "Test campaigns/assets cleaned up");
  assertYesEvidence("Cleanup", cleanupBody, "Test Polar subscriptions cleaned up");
  assertSecretExposureCleanupEvidence("Cleanup", cleanupBody, "Secrets rotated if exposed");
}

export function validateProductionEvidenceReport(markdown) {
  assert(typeof markdown === "string" && markdown.trim().length > 0, "Report must be markdown");
  for (const section of requiredSections) {
    const body = sectionBody(markdown, section);
    for (const field of requiredFilledFields[section]) {
      assertFilledReportField(section, body, field);
    }
    if (requiredFilledFields[section].includes("Result")) {
      const result = normalize(fieldValue(body, "Result"));
      assert(result === "pass", `${section}.Result must be PASS`);
    }
  }

  const readinessBody = sectionBody(markdown, "Readiness Artifact");
  const deploymentBody = sectionBody(markdown, "Deployment");
  const googleOAuthBody = sectionBody(markdown, "Google OAuth");
  const r2Body = sectionBody(markdown, "Cloudflare R2");
  const polarBody = sectionBody(markdown, "Polar");
  const campaignBody = sectionBody(markdown, "Campaign And Public Claim");
  const analyticsBody = sectionBody(markdown, "Analytics And Backfill");
  const cleanupBody = sectionBody(markdown, "Cleanup");
  const localGateBody = sectionBody(markdown, "Local Gate");
  assertCommandIncludes("Local Gate", localGateBody, "Command", ["npm run verify:local"]);
  assertCommandIncludes("Readiness Artifact", readinessBody, "Command", [
    "VITE_CONVEX_URL=",
    "VITE_SITE_URL=",
    "npm run verify:production",
    "--evidence-out",
  ]);
  assertCommandIncludesAny("Readiness Artifact", readinessBody, "Command", [
    "LI_XI_OPS_ADMIN_TOKEN=",
    "LIXI_OPS_ADMIN_TOKEN=",
  ]);
  assertCommandIncludes("Readiness Artifact", readinessBody, "Artifact validation", [
    "npm run verify:evidence",
  ]);
  assertProductionReadinessCommandShape(readinessBody);
  assertDeploymentMetadataEvidence(deploymentBody);
  assertDeploymentOriginsMatchReadinessCommand(deploymentBody, readinessBody);
  assertGoogleOAuthEvidence(deploymentBody, googleOAuthBody);
  assertCampaignAndPublicClaimEvidence(campaignBody);
  assertAnalyticsAndBackfillEvidence(analyticsBody, campaignBody);
  assertR2Evidence(r2Body, campaignBody, analyticsBody);
  assertPolarEvidence(deploymentBody, polarBody);
  assertCleanupEvidence(cleanupBody);
  assertFieldOneOf("Readiness Artifact", readinessBody, "`productionReady`", ["true", "yes"]);
  assertFieldOneOf("Readiness Artifact", readinessBody, "Redaction metadata present", ["true", "yes"]);
  assertYesEvidence("Readiness Artifact", readinessBody, "Ops token shape checked");
  assertYesEvidence("Readiness Artifact", readinessBody, "Billing admin token shape checked");
  assertYesEvidence("Readiness Artifact", readinessBody, "Migration token shape checked");

  const finalBody = sectionBody(markdown, "Final Decision");
  const accepted = normalize(fieldValue(finalBody, "Production readiness accepted"));
  const remainingRisks = normalize(fieldValue(finalBody, "Remaining risks"));
  assert(accepted === "yes", "Final Decision.Production readiness accepted must be YES");
  assert(
    remainingRisks === "none" || remainingRisks === "no remaining risks",
    "Final Decision.Remaining risks must be None"
  );
  assertNonBlockingFollowUpEvidence("Final Decision", finalBody, "Follow-up tasks");
  assertConcreteEvidenceValue("Final Decision", finalBody, "Approver");
  return true;
}

function validFixture() {
  return `# Production Evidence

## Deployment

- Environment: staging
- App origin: https://app.example.com
- Convex cloud origin: https://prod-a.convex.cloud
- Convex HTTP Actions origin: https://prod-a.convex.site
- Evidence date: 2026-05-22
- Verifier: release owner
- Release/ref: abc123

## Local Gate

- Command: npm run verify:local
- Result: PASS
- Notes: clean

## Readiness Artifact

- Command:
  VITE_CONVEX_URL=https://prod-a.convex.cloud VITE_SITE_URL=https://app.example.com LI_XI_OPS_ADMIN_TOKEN=<token> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json
- Artifact validation: npm run verify:evidence -- /tmp/li-xi-production-readiness.json
- Result: PASS
- Artifact location: /tmp/li-xi-production-readiness.json
- \`productionReady\`: true
- Redaction metadata present: yes
- Ops token shape checked: yes
- Billing admin token shape checked: yes
- Migration token shape checked: yes
- Notes: clean

## Google OAuth

- Google callback URL: https://prod-a.convex.site/api/auth/callback/google
- Browser sign-in result: pass
- Redirect target after sign-in: /campaigns
- Host profile row id: users:abc
- Legacy owner session absent or ignored: yes
- Reload/token-refresh check: pass
- Result: PASS
- Notes: clean

## Campaign And Public Claim

- Campaign id or slug: campaign-1
- Campaign status: active
- Start CTA rendered: Thử vận may
- Collect CTA rendered: Nhận thưởng
- Station session created: yes
- Public claim code: abc123abc123abc123abc123
- Public claim hero rendered: yes
- Redeem result: pass
- Reopen same code closed: yes
- Malformed public code closed: yes
- Expired public code closed: yes
- Inactive campaign public claim closed: yes
- Guest API internal ids absent: yes
- Result: PASS
- Notes: clean

## Cloudflare R2

- Asset row id: asset-1
- Asset owner id: user-1
- Asset campaign id or slug: campaign-1
- R2 key: key-1
- Content type: image/png
- Size: 12345
- Bucket matches configured R2 bucket: yes
- Metadata source: r2
- Lifecycle status: attached
- Validation timestamp present: yes
- Campaign Studio preview rendered: yes
- Public claim hero rendered: yes
- Station hero rendered: yes
- Negative checks: pass
- Result: PASS
- Notes: clean

## Polar

- Polar customer id: customer-1
- Polar subscription id: sub-1
- Product alias/id: pro
- Checkout result: pass
- Plan change result: pass
- Customer portal result: pass
- Checkout return origin: https://app.example.com
- Checkout return URL: https://app.example.com/campaigns?checkout=success
- Customer portal return origin: https://app.example.com
- Customer portal return URL: https://app.example.com/campaigns
- Polar webhook URL: https://prod-a.convex.site/polar/events
- Webhook receipt time: 2026-05-22T00:00:00.000Z
- Convex billing state: active
- Billing sync token removed: yes
- Result: PASS
- Notes: clean

## Analytics And Backfill

- Owner id: user-1
- Campaign id: campaign-1
- New station session counter result: pass
- New public claim redemption counter result: pass
- Owner backfill dry-run: pass
- Owner backfill audit decisions: reviewed skipped counts and auditDecisions sample
- Owner backfill apply: pass
- Owner backfill rerun idempotent: pass
- Campaign backfill dry-run/apply/rerun: pass
- Campaign backfill rerun idempotent: pass
- Migration token removed: yes
- Result: PASS
- Notes: clean

## Cleanup

- Temporary tokens removed: reviewed LI_XI_OPS_ADMIN_TOKEN, LIXI_OPS_ADMIN_TOKEN, LI_XI_BILLING_ADMIN_TOKEN, LIXI_BILLING_ADMIN_TOKEN, LI_XI_MIGRATION_TOKEN, and LIXI_MIGRATION_TOKEN are removed or absent
- Legacy flags disabled: reviewed LI_XI_ENABLE_LEGACY_AUTH, LEGACY_AUTH_ENABLED, LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LEGACY_OWNER_BRIDGE_ENABLED, VITE_LI_XI_ENABLE_LEGACY_AUTH, VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LI_XI_ENABLE_PAID_PLAN_FALLBACK, and LIXI_ENABLE_PAID_PLAN_FALLBACK are disabled or absent
- Maintenance dry-run audit decisions: reviewed public-link sessionDecisions, stale asset assetDecisions, default profileDecision, active campaignDecisions, duplicate budgetDecisions, and duplicate profileDecisions before apply
- Test public links cancelled: yes
- Test campaigns/assets cleaned up: yes
- Test Polar subscriptions cleaned up: yes
- Secrets rotated if exposed: reviewed deployment logs and evidence artifacts; none exposed, rotation not needed
- Result: PASS
- Notes: clean

## Final Decision

- Production readiness accepted: YES
- Remaining risks: None
- Follow-up tasks: routine monitoring
- Approver: release owner
`;
}

function runSelfTests() {
  validateProductionEvidenceReport(validFixture());
  validateProductionEvidenceReport(
    validFixture()
      .replace(
        "  VITE_CONVEX_URL=https://prod-a.convex.cloud VITE_SITE_URL=https://app.example.com LI_XI_OPS_ADMIN_TOKEN=<token> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json",
        "  `VITE_CONVEX_URL=https://prod-a.convex.cloud VITE_SITE_URL=https://app.example.com LI_XI_OPS_ADMIN_TOKEN=<token> npm run verify:production -- --evidence-out /tmp/li-xi-production-readiness.json`"
      )
      .replace(
        "- Artifact validation: npm run verify:evidence -- /tmp/li-xi-production-readiness.json",
        "- Artifact validation: `npm run verify:evidence -- /tmp/li-xi-production-readiness.json`"
      )
  );

  for (const [name, report] of [
    ["missing OAuth result", validFixture().replace("- Result: PASS\n- Notes: clean", "- Result:\n- Notes: clean")],
    ["failed OAuth sign-in result", validFixture().replace("- Browser sign-in result: pass", "- Browser sign-in result: fail")],
    ["legacy owner session present", validFixture().replace("- Legacy owner session absent or ignored: yes", "- Legacy owner session absent or ignored: no")],
    ["local-only OAuth reload check", validFixture().replace("- Reload/token-refresh check: pass", "- Reload/token-refresh check: local only")],
    ["inactive campaign status", validFixture().replace("- Campaign status: active", "- Campaign status: draft")],
    ["failed station session creation", validFixture().replace("- Station session created: yes", "- Station session created: no")],
    ["malformed public claim code", validFixture().replace("- Public claim code: abc123abc123abc123abc123", "- Public claim code: claim-123")],
	    ["failed redeem result", validFixture().replace("- Redeem result: pass", "- Redeem result: fail")],
	    ["missing malformed public code check", validFixture().replace("- Malformed public code closed: yes", "- Malformed public code closed:")],
	    ["failed malformed public code check", validFixture().replace("- Malformed public code closed: yes", "- Malformed public code closed: no")],
    ["failed R2 result", validFixture().replace("## Cloudflare R2", "## Cloudflare R2").replace("- Result: PASS\n- Notes: clean\n\n## Polar", "- Result: FAIL\n- Notes: clean\n\n## Polar")],
    ["missing collect CTA evidence", validFixture().replace("- Collect CTA rendered: Nhận thưởng", "- Collect CTA rendered:")],
    ["boolean start CTA evidence", validFixture().replace("- Start CTA rendered: Thử vận may", "- Start CTA rendered: yes")],
    ["boolean collect CTA evidence", validFixture().replace("- Collect CTA rendered: Nhận thưởng", "- Collect CTA rendered: rendered")],
    ["duplicate CTA evidence", validFixture().replace("- Collect CTA rendered: Nhận thưởng", "- Collect CTA rendered: Thử vận may")],
    ["missing expired public-code check", validFixture().replace("- Expired public code closed: yes", "- Expired public code closed:")],
    ["failed expired public-code check", validFixture().replace("- Expired public code closed: yes", "- Expired public code closed: no")],
    [
      "missing inactive campaign public-claim check",
      validFixture().replace("- Inactive campaign public claim closed: yes", "- Inactive campaign public claim closed:")
    ],
    [
      "failed inactive campaign public-claim check",
      validFixture().replace("- Inactive campaign public claim closed: yes", "- Inactive campaign public claim closed: no")
    ],
    ["missing guest API internal id privacy check", validFixture().replace("- Guest API internal ids absent: yes", "- Guest API internal ids absent:")],
    ["failed guest API internal id privacy check", validFixture().replace("- Guest API internal ids absent: yes", "- Guest API internal ids absent: no")],
    ["missing R2 negative checks", validFixture().replace("- Negative checks: pass", "- Negative checks:")],
    ["mismatched R2 asset owner", validFixture().replace("- Asset owner id: user-1", "- Asset owner id: user-2")],
    ["mismatched R2 asset campaign", validFixture().replace("- Asset campaign id or slug: campaign-1", "- Asset campaign id or slug: campaign-2")],
    ["skipped R2 negative checks", validFixture().replace("- Negative checks: pass", "- Negative checks: skipped")],
    ["unsupported R2 content type", validFixture().replace("- Content type: image/png", "- Content type: image/svg+xml")],
    ["oversized R2 asset", validFixture().replace("- Size: 12345", "- Size: 8388609")],
    ["mismatched R2 bucket evidence", validFixture().replace("- Bucket matches configured R2 bucket: yes", "- Bucket matches configured R2 bucket: no")],
    ["client-sourced R2 metadata", validFixture().replace("- Metadata source: r2", "- Metadata source: client")],
    ["raw R2 lifecycle", validFixture().replace("- Lifecycle status: attached", "- Lifecycle status: uploaded")],
    ["missing R2 validation timestamp", validFixture().replace("- Validation timestamp present: yes", "- Validation timestamp present: no")],
    ["missing R2 preview render", validFixture().replace("- Campaign Studio preview rendered: yes", "- Campaign Studio preview rendered: no")],
    ["missing public hero render", validFixture().replace("- Public claim hero rendered: yes", "- Public claim hero rendered: no")],
    ["missing station hero render", validFixture().replace("- Station hero rendered: yes", "- Station hero rendered: no")],
    ["R2 key recorded as URL", validFixture().replace("- R2 key: key-1", "- R2 key: https://assets.example.com/key-1?signature=secret")],
    ["R2 key with query", validFixture().replace("- R2 key: key-1", "- R2 key: campaign-assets/key-1?signature=secret")],
    ["R2 key with traversal", validFixture().replace("- R2 key: key-1", "- R2 key: campaign-assets/../key-1")],
    ["R2 key with backslash", validFixture().replace("- R2 key: key-1", "- R2 key: campaign-assets\\key-1")],
    ["R2 key with whitespace", validFixture().replace("- R2 key: key-1", "- R2 key: campaign assets/key-1")],
    ["missing owner backfill audit decisions", validFixture().replace("- Owner backfill audit decisions: reviewed skipped counts and auditDecisions sample", "- Owner backfill audit decisions:")],
    ["missing maintenance audit decisions", validFixture().replace("- Maintenance dry-run audit decisions: reviewed public-link sessionDecisions, stale asset assetDecisions, default profileDecision, active campaignDecisions, duplicate budgetDecisions, and duplicate profileDecisions before apply", "- Maintenance dry-run audit decisions:")],
    ["unreviewed owner audit decisions", validFixture().replace("- Owner backfill audit decisions: reviewed skipped counts and auditDecisions sample", "- Owner backfill audit decisions: completed auditDecisions sample")],
    ["incomplete maintenance audit decisions", validFixture().replace("- Maintenance dry-run audit decisions: reviewed public-link sessionDecisions, stale asset assetDecisions, default profileDecision, active campaignDecisions, duplicate budgetDecisions, and duplicate profileDecisions before apply", "- Maintenance dry-run audit decisions: reviewed cleanup decisions before apply")],
    ["wrong local gate command", validFixture().replace("- Command: npm run verify:local", "- Command: npm test")],
    ["missing production evidence command", validFixture().replace("npm run verify:production -- --evidence-out", "npm run verify:production")],
    ["missing production evidence env", validFixture().replace("LI_XI_OPS_ADMIN_TOKEN=<token> ", "")],
    ["artifact location mismatch", validFixture().replace("- Artifact location: /tmp/li-xi-production-readiness.json", "- Artifact location: /tmp/other-readiness.json")],
    ["artifact validation mismatch", validFixture().replace("npm run verify:evidence -- /tmp/li-xi-production-readiness.json", "npm run verify:evidence -- /tmp/other-readiness.json")],
    ["non-json artifact path", validFixture().replaceAll("/tmp/li-xi-production-readiness.json", "/tmp/li-xi-production-readiness.txt")],
    ["generic artifact path", validFixture().replaceAll("/tmp/li-xi-production-readiness.json", "/tmp/readiness.json")],
    ["placeholder artifact path", validFixture().replaceAll("/tmp/li-xi-production-readiness.json", "<artifact.json>")],
    ["placeholder convex url", validFixture().replace("VITE_CONVEX_URL=https://prod-a.convex.cloud", "VITE_CONVEX_URL=<convex-url>")],
    ["placeholder site url", validFixture().replace("VITE_SITE_URL=https://app.example.com", "VITE_SITE_URL=<app-origin>")],
    ["app origin with port", validFixture().replaceAll("https://app.example.com", "https://app.example.com:8443")],
    ["app origin with default port", validFixture().replaceAll("https://app.example.com", "https://app.example.com:443")],
    ["convex cloud origin with port", validFixture().replace("- Convex cloud origin: https://prod-a.convex.cloud", "- Convex cloud origin: https://prod-a.convex.cloud:8443")],
    ["convex site origin with port", validFixture().replace("- Convex HTTP Actions origin: https://prod-a.convex.site", "- Convex HTTP Actions origin: https://prod-a.convex.site:8443")],
    ["localhost app origin", validFixture().replaceAll("https://app.example.com", "https://localhost")],
    ["private app origin", validFixture().replaceAll("https://app.example.com", "https://10.0.0.1")],
    ["raw public ipv4 app origin", validFixture().replaceAll("https://app.example.com", "https://8.8.8.8")],
    ["raw ipv6 app origin", validFixture().replaceAll("https://app.example.com", "https://[2606:4700:4700::1111]")],
    ["mismatched deployment app origin", validFixture().replace("- App origin: https://app.example.com", "- App origin: https://other.example.com")],
    ["mismatched deployment convex origin", validFixture().replace("- Convex cloud origin: https://prod-a.convex.cloud", "- Convex cloud origin: https://prod-b.convex.cloud")],
    ["mismatched convex site deployment", validFixture().replace("- Convex HTTP Actions origin: https://prod-a.convex.site", "- Convex HTTP Actions origin: https://prod-b.convex.site")],
    ["convex cloud origin leading hyphen", validFixture().replace("- Convex cloud origin: https://prod-a.convex.cloud", "- Convex cloud origin: https://-prod.convex.cloud")],
    ["convex site origin trailing hyphen", validFixture().replace("- Convex HTTP Actions origin: https://prod-a.convex.site", "- Convex HTTP Actions origin: https://prod-.convex.site")],
    ["mismatched google callback origin", validFixture().replace("- Google callback URL: https://prod-a.convex.site/api/auth/callback/google", "- Google callback URL: https://prod-b.convex.site/api/auth/callback/google")],
    ["wrong google callback path", validFixture().replace("- Google callback URL: https://prod-a.convex.site/api/auth/callback/google", "- Google callback URL: https://prod-a.convex.site/api/auth/callback/github")],
    ["google callback with default port", validFixture().replace("- Google callback URL: https://prod-a.convex.site/api/auth/callback/google", "- Google callback URL: https://prod-a.convex.site:443/api/auth/callback/google")],
    ["external OAuth redirect target", validFixture().replace("- Redirect target after sign-in: /campaigns", "- Redirect target after sign-in: https://evil.example.com/campaigns")],
    ["scheme-relative OAuth redirect target", validFixture().replace("- Redirect target after sign-in: /campaigns", "- Redirect target after sign-in: //evil.example.com/campaigns")],
    ["draw OAuth redirect target", validFixture().replace("- Redirect target after sign-in: /campaigns", "- Redirect target after sign-in: /draw")],
    ["wrong OAuth redirect target", validFixture().replace("- Redirect target after sign-in: /campaigns", "- Redirect target after sign-in: /claim/abc123abc123abc123abc123")],
    ["OAuth redirect target with query", validFixture().replace("- Redirect target after sign-in: /campaigns", "- Redirect target after sign-in: /campaigns?next=/claim/abc123abc123abc123abc123")],
    ["OAuth redirect target with hash", validFixture().replace("- Redirect target after sign-in: /campaigns", "- Redirect target after sign-in: /campaigns#done")],
    ["missing checkout return origin", validFixture().replace("- Checkout return origin: https://app.example.com", "- Checkout return origin:")],
    ["mismatched checkout return origin", validFixture().replace("- Checkout return origin: https://app.example.com", "- Checkout return origin: https://billing.example.com")],
    ["raw checkout return origin", validFixture().replace("- Checkout return origin: https://app.example.com", "- Checkout return origin: https://8.8.8.8")],
    ["checkout return origin with default port", validFixture().replace("- Checkout return origin: https://app.example.com", "- Checkout return origin: https://app.example.com:443")],
    ["missing checkout return url", validFixture().replace("- Checkout return URL: https://app.example.com/campaigns?checkout=success", "- Checkout return URL:")],
    ["wrong checkout return path", validFixture().replace("- Checkout return URL: https://app.example.com/campaigns?checkout=success", "- Checkout return URL: https://app.example.com/draw?checkout=success")],
    ["unexpected checkout return query", validFixture().replace("- Checkout return URL: https://app.example.com/campaigns?checkout=success", "- Checkout return URL: https://app.example.com/campaigns?next=/draw")],
    ["checkout return url with hash", validFixture().replace("- Checkout return URL: https://app.example.com/campaigns?checkout=success", "- Checkout return URL: https://app.example.com/campaigns?checkout=success#done")],
    ["mismatched customer portal return origin", validFixture().replace("- Customer portal return origin: https://app.example.com", "- Customer portal return origin: https://portal.example.com")],
    ["raw customer portal return origin", validFixture().replace("- Customer portal return origin: https://app.example.com", "- Customer portal return origin: https://[2606:4700:4700::1111]")],
    ["wrong customer portal return path", validFixture().replace("- Customer portal return URL: https://app.example.com/campaigns", "- Customer portal return URL: https://app.example.com/leaderboard")],
    ["unexpected customer portal return query", validFixture().replace("- Customer portal return URL: https://app.example.com/campaigns", "- Customer portal return URL: https://app.example.com/campaigns?checkout=success")],
    ["failed polar checkout result", validFixture().replace("- Checkout result: pass", "- Checkout result: fail")],
    ["failed polar plan change result", validFixture().replace("- Plan change result: pass", "- Plan change result: fail")],
    ["failed polar customer portal result", validFixture().replace("- Customer portal result: pass", "- Customer portal result: fail")],
    ["inactive convex billing state", validFixture().replace("- Convex billing state: active", "- Convex billing state: canceled")],
    ["billing sync token still present", validFixture().replace("- Billing sync token removed: yes", "- Billing sync token removed: no")],
    ["missing polar webhook url", validFixture().replace("- Polar webhook URL: https://prod-a.convex.site/polar/events", "- Polar webhook URL:")],
    ["mismatched polar webhook origin", validFixture().replace("- Polar webhook URL: https://prod-a.convex.site/polar/events", "- Polar webhook URL: https://prod-b.convex.site/polar/events")],
    ["wrong polar webhook path", validFixture().replace("- Polar webhook URL: https://prod-a.convex.site/polar/events", "- Polar webhook URL: https://prod-a.convex.site/polar/webhook")],
    ["polar webhook with default port", validFixture().replace("- Polar webhook URL: https://prod-a.convex.site/polar/events", "- Polar webhook URL: https://prod-a.convex.site:443/polar/events")],
    ["raw ops token", validFixture().replace("LI_XI_OPS_ADMIN_TOKEN=<token>", "LI_XI_OPS_ADMIN_TOKEN=super-secret-token")],
    ["raw ops alias token", validFixture().replace("LI_XI_OPS_ADMIN_TOKEN=<token>", "LIXI_OPS_ADMIN_TOKEN=super-secret-token")],
    ["missing evidence validator command", validFixture().replace("npm run verify:evidence -- /tmp/li-xi-production-readiness.json", "manual review")],
    ["skipped expired public-code check", validFixture().replace("- Expired public code closed: yes", "- Expired public code closed: skipped")],
	    ["failed owner backfill apply", validFixture().replace("- Owner backfill apply: pass", "- Owner backfill apply: fail")],
	    ["failed campaign backfill", validFixture().replace("- Campaign backfill dry-run/apply/rerun: pass", "- Campaign backfill dry-run/apply/rerun: fail")],
	    ["failed campaign rerun idempotency", validFixture().replace("- Campaign backfill rerun idempotent: pass", "- Campaign backfill rerun idempotent: fail")],
	    ["migration token still present", validFixture().replace("- Migration token removed: yes", "- Migration token removed: no")],
    [
      "temporary tokens still present",
      validFixture().replace(
        "- Temporary tokens removed: reviewed LI_XI_OPS_ADMIN_TOKEN, LIXI_OPS_ADMIN_TOKEN, LI_XI_BILLING_ADMIN_TOKEN, LIXI_BILLING_ADMIN_TOKEN, LI_XI_MIGRATION_TOKEN, and LIXI_MIGRATION_TOKEN are removed or absent",
        "- Temporary tokens removed: reviewed temporary tokens are removed"
      ),
    ],
    [
      "missing ops admin token cleanup evidence",
      validFixture().replace("LI_XI_OPS_ADMIN_TOKEN, ", ""),
    ],
    [
      "missing billing admin alias token cleanup evidence",
      validFixture().replace("LIXI_BILLING_ADMIN_TOKEN, ", ""),
    ],
    [
      "missing migration token cleanup evidence",
      validFixture().replace("LI_XI_MIGRATION_TOKEN, and ", ""),
    ],
    [
      "missing migration token alias cleanup evidence",
      validFixture().replace(", and LIXI_MIGRATION_TOKEN", ""),
    ],
    [
      "legacy flags still enabled",
      validFixture().replace(
        "- Legacy flags disabled: reviewed LI_XI_ENABLE_LEGACY_AUTH, LEGACY_AUTH_ENABLED, LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LEGACY_OWNER_BRIDGE_ENABLED, VITE_LI_XI_ENABLE_LEGACY_AUTH, VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE, LI_XI_ENABLE_PAID_PLAN_FALLBACK, and LIXI_ENABLE_PAID_PLAN_FALLBACK are disabled or absent",
        "- Legacy flags disabled: reviewed legacy flags are disabled"
      ),
    ],
    ["test polar subscriptions not cleaned", validFixture().replace("- Test Polar subscriptions cleaned up: yes", "- Test Polar subscriptions cleaned up: no")],
    ["secrets rotation unverified", validFixture().replace("- Secrets rotated if exposed: reviewed deployment logs and evidence artifacts; none exposed, rotation not needed", "- Secrets rotated if exposed: unverified")],
    ["productionReady not true", validFixture().replace("- `productionReady`: true", "- `productionReady`: false")],
	    ["redaction metadata not present", validFixture().replace("- Redaction metadata present: yes", "- Redaction metadata present: no")],
	    ["ops token shape unchecked", validFixture().replace("- Ops token shape checked: yes", "- Ops token shape checked: no")],
	    ["billing admin token shape unchecked", validFixture().replace("- Billing admin token shape checked: yes", "- Billing admin token shape checked: no")],
	    ["migration token shape unchecked", validFixture().replace("- Migration token shape checked: yes", "- Migration token shape checked: no")],
	    ["not accepted", validFixture().replace("- Production readiness accepted: YES", "- Production readiness accepted: NO")],
    ["remaining risk", validFixture().replace("- Remaining risks: None", "- Remaining risks: Polar webhook unverified")],
  ]) {
    try {
      validateProductionEvidenceReport(report);
      throw new Error(`Expected invalid report to fail: ${name}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Expected invalid report")) {
        throw error;
      }
    }
  }

  console.log("production evidence report validator self-tests passed");
}

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.length === 1 && args[0] === "--self-test") {
      runSelfTests();
    } else if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      usage();
    } else if (args.length === 1) {
      validateProductionEvidenceReport(await readFile(args[0], "utf8"));
      console.log("production evidence report is complete");
    } else {
      usage();
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
