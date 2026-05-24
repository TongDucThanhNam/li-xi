#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isLocalOrPrivateHostname, isRawIpHostname } from "../lib/networkPolicy.ts";

const googleCallbackPath = "/api/auth/callback/google";
const polarWebhookPath = "/polar/events";
const frontendRequirements = [
  {
    key: "viteConvexUrl",
    label: "Frontend Convex deployment URL",
    names: ["VITE_CONVEX_URL"],
    required: true,
  },
  {
    key: "viteSiteUrl",
    label: "Frontend public site URL",
    names: ["VITE_SITE_URL"],
    required: true,
  },
];

function usage() {
  console.log(`Usage: node scripts/verify-production-readiness.mjs [--prod] [--deployment <ref>] [--evidence-out <path>]
       node scripts/verify-production-readiness.mjs --self-test

    Requires LI_XI_OPS_ADMIN_TOKEN or LIXI_OPS_ADMIN_TOKEN plus VITE_CONVEX_URL
    and VITE_SITE_URL in the local environment. The token is passed to
    ops:getSaaSReadiness and is never printed. --evidence-out writes a redacted
    JSON readiness artifact with public endpoints, statuses, and missing checks.`);
}

function parseProductionArgs(args) {
  const targetArgs = [];
  let evidenceOut = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--prod") {
      targetArgs.push("--prod");
      continue;
    }
    if (arg === "--deployment") {
      const deployment = args[index + 1];
      if (!deployment) {
        throw new Error("--deployment requires a deployment reference");
      }
      targetArgs.push("--deployment", deployment);
      index += 1;
      continue;
    }
    if (arg === "--evidence-out") {
      const outputPath = args[index + 1];
      if (!outputPath) {
        throw new Error("--evidence-out requires a file path");
      }
      evidenceOut = outputPath;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { targetArgs, evidenceOut };
}

function stripAnsi(text) {
  return text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}

function hasEnv(name) {
  return Boolean(process.env[name]?.trim());
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

function hasProductionSecretShape(value, minLength = 16) {
  const secret = value?.trim();
  return Boolean(
    secret &&
      secret.length >= minLength &&
      !/\s/.test(secret) &&
      !/[<>]/.test(secret) &&
      !placeholderSecretValues.has(secret.toLowerCase())
  );
}

function configuredOpsAdminToken() {
  return process.env.LI_XI_OPS_ADMIN_TOKEN?.trim() || process.env.LIXI_OPS_ADMIN_TOKEN?.trim() || "";
}

function isEnabledEnv(name) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function configuredEnabledEnvName(names) {
  return names.find(isEnabledEnv) ?? null;
}

function evaluateRequirement(requirement) {
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

function isHttpsOriginUrl(value) {
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

function isPublicHttpsOriginUrl(value) {
  if (!isHttpsOriginUrl(value)) {
    return false;
  }

  const hostname = new URL(value).hostname;
  return !isRawIpHostname(hostname) && !isLocalOrPrivateHostname(hostname);
}

const convexCloudDeploymentHostPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.convex\.cloud$/;

function isConvexCloudDeploymentOrigin(value) {
  if (!isHttpsOriginUrl(value)) {
    return false;
  }

  const hostname = new URL(value).hostname;
  return convexCloudDeploymentHostPattern.test(hostname);
}

const convexSiteDeploymentHostPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.convex\.site$/;

function isConvexSiteDeploymentOrigin(value) {
  if (!isHttpsOriginUrl(value)) {
    return false;
  }

  const hostname = new URL(value).hostname;
  return convexSiteDeploymentHostPattern.test(hostname);
}

function convexDeploymentName(value, expectedSuffix, originReady) {
  if (!originReady(value)) {
    return null;
  }

  const hostname = new URL(value).hostname.toLowerCase();
  const suffix = `.${expectedSuffix}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  return hostname.slice(0, -suffix.length);
}

function frontendConvexDeploymentName() {
  return convexDeploymentName(
    process.env.VITE_CONVEX_URL,
    "convex.cloud",
    isConvexCloudDeploymentOrigin
  );
}

function backendConvexDeploymentName(readiness) {
  return convexDeploymentName(
    readiness.endpoints?.convexSiteOrigin,
    "convex.site",
    isConvexSiteDeploymentOrigin
  );
}

function normalizePublicOrigin(value) {
  if (!isPublicHttpsOriginUrl(value)) {
    return null;
  }

  return new URL(value).origin;
}

function buildReadinessEndpoint(baseUrl, path) {
  if (!isConvexSiteDeploymentOrigin(baseUrl)) {
    return null;
  }

  return new URL(path, new URL(baseUrl).origin).toString();
}

function deriveExpectedBackendEndpoints(convexSiteOrigin) {
  return {
    googleCallbackUrl: buildReadinessEndpoint(convexSiteOrigin, googleCallbackPath),
    polarWebhookUrl: buildReadinessEndpoint(convexSiteOrigin, polarWebhookPath),
  };
}

function evaluateFrontendReadiness() {
  const integrations = {
    frontend: frontendRequirements.map(evaluateRequirement),
  };
  const missingRequired = Object.entries(integrations).flatMap(([group, requirements]) =>
    requirements
      .filter((requirement) => requirement.required && !requirement.configured)
      .map((requirement) => `${group}.${requirement.key}`)
  );
  const convexUrlReady = isConvexCloudDeploymentOrigin(process.env.VITE_CONVEX_URL);
  const siteUrlReady = isPublicHttpsOriginUrl(process.env.VITE_SITE_URL);
  const legacyAccountAuthEnabledName = configuredEnabledEnvName([
    "VITE_LI_XI_ENABLE_LEGACY_AUTH",
    "VITE_ENABLE_LEGACY_AUTH",
  ]);
  const legacyOwnerBridgeEnabledName = configuredEnabledEnvName([
    "VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE",
    "VITE_LEGACY_OWNER_BRIDGE_ENABLED",
  ]);
  const legacyAccountAuthDisabled = legacyAccountAuthEnabledName === null;
  const legacyOwnerBridgeDisabled = legacyOwnerBridgeEnabledName === null;
  const runtimeChecks = {
    frontend: [
      {
        key: "frontendConvexUrlHttpsOrigin",
        label: "Frontend Convex URL HTTPS origin",
        required: true,
        ready: convexUrlReady,
        status: convexUrlReady
          ? "ready"
          : hasEnv("VITE_CONVEX_URL")
            ? "invalidConfig"
            : "missingEnv",
        detail: convexUrlReady
          ? "VITE_CONVEX_URL là Convex deployment HTTPS origin"
          : "VITE_CONVEX_URL production phải là HTTPS origin dạng https://<deployment>.convex.cloud không kèm path/query/hash/port/credentials",
      },
      {
        key: "frontendSiteUrlPublicOrigin",
        label: "Frontend public site URL HTTPS origin",
        required: true,
        ready: siteUrlReady,
        status: siteUrlReady
          ? "ready"
          : hasEnv("VITE_SITE_URL")
            ? "invalidConfig"
            : "missingEnv",
        detail: siteUrlReady
          ? "VITE_SITE_URL là public HTTPS origin"
          : "VITE_SITE_URL production phải là HTTPS public origin theo domain, không phải localhost/IP riêng/raw IP, và không kèm path/query/hash/port/credentials",
      },
      {
        key: "frontendLegacyAccountAuthDisabled",
        label: "Frontend legacy username/PIN auth disabled",
        required: true,
        ready: legacyAccountAuthDisabled,
        status: legacyAccountAuthDisabled ? "ready" : "invalidConfig",
        detail: legacyAccountAuthDisabled
          ? "Frontend không bật form legacy username/PIN"
          : `${legacyAccountAuthEnabledName} phải tắt trong production để Google OAuth là account path duy nhất`,
      },
      {
        key: "frontendLegacyOwnerBridgeDisabled",
        label: "Frontend legacy owner bridge disabled",
        required: true,
        ready: legacyOwnerBridgeDisabled,
        status: legacyOwnerBridgeDisabled ? "ready" : "invalidConfig",
        detail: legacyOwnerBridgeDisabled
          ? "Frontend không bật local ownerId bridge"
          : `${legacyOwnerBridgeEnabledName} phải tắt trong production để frontend không gửi ownerId từ localStorage`,
      },
    ],
  };
  const missingRuntimeRequired = Object.entries(runtimeChecks).flatMap(([group, requirements]) =>
    requirements
      .filter((requirement) => requirement.required && !requirement.ready)
      .map((requirement) => `${group}.${requirement.key}`)
  );

  return {
    allRequiredConfigured: missingRequired.length === 0,
    allRequiredReady: missingRequired.length === 0 && missingRuntimeRequired.length === 0,
    missingRequired,
    missingRuntimeRequired,
    integrations,
    runtimeChecks,
  };
}

function extractJsonObject(output) {
  const text = stripAnsi(output);
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start < 0) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, index + 1));
      }
    }
  }

  throw new Error("Could not parse JSON readiness output from Convex CLI");
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `code ${code}`
          }\n${stderr || stdout}`
        )
      );
    });
  });
}

function formatMissingRequirement(readiness, key) {
  const [group, requirementKey] = key.split(".");
  const requirement = readiness.integrations?.[group]?.find(
    (candidate) => candidate.key === requirementKey,
  );
  if (!requirement) {
    return key;
  }

  return `${requirement.label} (${requirement.acceptedNames.join(" / ")})`;
}

function formatMissingRuntime(readiness, key) {
  const [group, requirementKey] = key.split(".");
  const requirement = readiness.runtimeChecks?.[group]?.find(
    (candidate) => candidate.key === requirementKey,
  );
  if (!requirement) {
    return key;
  }

  return `${requirement.label}: ${requirement.detail}`;
}

function printEndpoint(label, value) {
  console.log(`${label}: ${value ?? "unavailable"}`);
}

function withEnv(overrides, callback) {
  const previousValues = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function evaluateCrossRuntimeReadiness(readiness) {
  const frontendSiteOrigin = normalizePublicOrigin(process.env.VITE_SITE_URL);
  const backendSiteOrigin = readiness.endpoints?.siteUrlOrigin ?? null;
  const siteOriginsMatch =
    frontendSiteOrigin !== null &&
    backendSiteOrigin !== null &&
    frontendSiteOrigin === backendSiteOrigin;
  const frontendConvexDeployment = frontendConvexDeploymentName();
  const backendConvexDeployment = backendConvexDeploymentName(readiness);
  const convexDeploymentsMatch =
    frontendConvexDeployment !== null &&
    backendConvexDeployment !== null &&
    frontendConvexDeployment === backendConvexDeployment;

  return {
    runtimeChecks: {
      deployment: [
        {
          key: "frontendBackendSiteOriginMatch",
          label: "Frontend/backend site origin match",
          required: true,
          ready: siteOriginsMatch,
          status: siteOriginsMatch ? "ready" : "invalidConfig",
          detail: siteOriginsMatch
            ? "VITE_SITE_URL khớp SITE_URL từ backend readiness"
            : "VITE_SITE_URL phải khớp SITE_URL để share links và Polar return URLs dùng cùng public origin",
        },
        {
          key: "frontendBackendConvexDeploymentMatch",
          label: "Frontend/backend Convex deployment match",
          required: true,
          ready: convexDeploymentsMatch,
          status: convexDeploymentsMatch ? "ready" : "invalidConfig",
          detail: convexDeploymentsMatch
            ? "VITE_CONVEX_URL khớp deployment của CONVEX_SITE_URL"
            : "VITE_CONVEX_URL và CONVEX_SITE_URL phải trỏ cùng Convex deployment để OAuth callback và Polar webhook vào đúng backend",
        },
      ],
    },
    missingRuntimeRequired: [
      ...(siteOriginsMatch ? [] : ["deployment.frontendBackendSiteOriginMatch"]),
      ...(convexDeploymentsMatch ? [] : ["deployment.frontendBackendConvexDeploymentMatch"]),
    ],
    allRequiredReady: siteOriginsMatch && convexDeploymentsMatch,
  };
}

function isProductionReady(readiness, frontendReadiness, crossRuntimeReadiness) {
  return Boolean(
    readiness.allRequiredReady &&
      frontendReadiness.allRequiredReady &&
      crossRuntimeReadiness.allRequiredReady
  );
}

function summarizeReadiness(readiness, frontendReadiness) {
  const crossRuntimeReadiness = evaluateCrossRuntimeReadiness(readiness);
  console.log(`Checked at: ${new Date(readiness.checkedAt).toISOString()}`);
  console.log(`Access source: ${readiness.accessSource}`);
  console.log(`Frontend Convex URL: ${process.env.VITE_CONVEX_URL ? "configured" : "unavailable"}`);
  console.log(`Frontend site URL: ${process.env.VITE_SITE_URL ? "configured" : "unavailable"}`);
  printEndpoint("Google callback", readiness.endpoints?.googleCallbackUrl);
  printEndpoint("Polar webhook", readiness.endpoints?.polarWebhookUrl);
  printEndpoint("Backend Convex site origin", readiness.endpoints?.convexSiteOrigin);
  printEndpoint("Backend site origin", readiness.endpoints?.siteUrlOrigin);

  if (isProductionReady(readiness, frontendReadiness, crossRuntimeReadiness)) {
    console.log("SaaS production readiness passed");
    return true;
  }

  console.error("SaaS production readiness failed");
  for (const missing of frontendReadiness.missingRequired ?? []) {
    console.error(`Missing env: ${formatMissingRequirement(frontendReadiness, missing)}`);
  }
  for (const missing of readiness.missingRequired ?? []) {
    console.error(`Missing env: ${formatMissingRequirement(readiness, missing)}`);
  }
  for (const missing of frontendReadiness.missingRuntimeRequired ?? []) {
    console.error(`Missing runtime: ${formatMissingRuntime(frontendReadiness, missing)}`);
  }
  for (const missing of readiness.missingRuntimeRequired ?? []) {
    console.error(`Missing runtime: ${formatMissingRuntime(readiness, missing)}`);
  }
  for (const missing of crossRuntimeReadiness.missingRuntimeRequired ?? []) {
    console.error(`Missing runtime: ${formatMissingRuntime(crossRuntimeReadiness, missing)}`);
  }
  return false;
}

function summarizeRuntimeChecks(runtimeChecks) {
  return Object.fromEntries(
    Object.entries(runtimeChecks ?? {}).map(([group, checks]) => [
      group,
      checks.map((check) => ({
        key: check.key,
        label: check.label,
        required: Boolean(check.required),
        ready: Boolean(check.ready),
        status: check.status,
      })),
    ])
  );
}

function buildEvidence(readiness, frontendReadiness) {
  const crossRuntimeReadiness = evaluateCrossRuntimeReadiness(readiness);

  return {
    schema: "li-xi.production-readiness-evidence.v1",
    generatedAt: new Date().toISOString(),
    redaction: {
      mode: "audit-safe",
      omittedFields: [
        "opsAdminToken",
        "secretValues",
        "configuredName",
        "acceptedNames",
        "runtimeCheck.detail",
      ],
    },
    checkedAt: readiness.checkedAt,
    accessSource: readiness.accessSource,
    productionReady: isProductionReady(readiness, frontendReadiness, crossRuntimeReadiness),
    endpoints: {
      googleCallbackUrl: readiness.endpoints?.googleCallbackUrl ?? null,
      polarWebhookUrl: readiness.endpoints?.polarWebhookUrl ?? null,
      convexSiteOrigin: readiness.endpoints?.convexSiteOrigin ?? null,
      siteUrlOrigin: readiness.endpoints?.siteUrlOrigin ?? null,
    },
    frontend: {
      allRequiredConfigured: frontendReadiness.allRequiredConfigured,
      allRequiredReady: frontendReadiness.allRequiredReady,
      missingRequired: frontendReadiness.missingRequired ?? [],
      missingRuntimeRequired: frontendReadiness.missingRuntimeRequired ?? [],
      runtimeChecks: summarizeRuntimeChecks(frontendReadiness.runtimeChecks),
    },
    backend: {
      allRequiredConfigured: readiness.allRequiredConfigured,
      allRequiredReady: readiness.allRequiredReady,
      missingRequired: readiness.missingRequired ?? [],
      missingRuntimeRequired: readiness.missingRuntimeRequired ?? [],
      runtimeChecks: summarizeRuntimeChecks(readiness.runtimeChecks),
    },
    crossRuntime: {
      allRequiredReady: crossRuntimeReadiness.allRequiredReady,
      missingRuntimeRequired: crossRuntimeReadiness.missingRuntimeRequired ?? [],
      runtimeChecks: summarizeRuntimeChecks(crossRuntimeReadiness.runtimeChecks),
    },
  };
}

async function writeEvidence(outputPath, evidence) {
  const absolutePath = path.resolve(outputPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`Wrote redacted readiness evidence: ${absolutePath}`);
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`Self-test failed: ${message}`);
  }
}

function selfTestReadiness(overrides, readiness) {
  return withEnv(overrides, () => evaluateCrossRuntimeReadiness(readiness));
}

function runSelfTests() {
  const acceptedConvexSiteOrigins = [
    "https://prod-a.convex.site",
    "https://prod-a.convex.site/",
    "https://a1-b2.convex.site",
  ];
  for (const origin of acceptedConvexSiteOrigins) {
    assertSelfTest(
      isConvexSiteDeploymentOrigin(origin),
      `${origin} should be accepted as a Convex HTTP Actions origin`
    );
  }

  const rejectedConvexSiteOrigins = [
    undefined,
    "",
    "https://prod-a.convex.cloud",
    "https://example.com",
    "http://prod-a.convex.site",
    "https://prod-a.convex.site/api/auth/callback/google",
    "https://prod-a.convex.site:443",
    "https://user:pass@prod-a.convex.site",
    "https://localhost.convex.site.example.com",
  ];
  for (const origin of rejectedConvexSiteOrigins) {
    assertSelfTest(
      !isConvexSiteDeploymentOrigin(origin),
      `${String(origin)} should be rejected as a Convex HTTP Actions origin`
    );
  }

  assertSelfTest(
    isConvexCloudDeploymentOrigin("https://prod-a.convex.cloud"),
    "frontend Convex deployment origin should accept .convex.cloud"
  );
  assertSelfTest(
    !isConvexCloudDeploymentOrigin("https://prod-a.convex.site"),
    "frontend Convex deployment origin should reject .convex.site"
  );
  assertSelfTest(
    !isConvexCloudDeploymentOrigin("https://prod-a.convex.cloud/path"),
    "frontend Convex deployment origin should reject paths"
  );
  assertSelfTest(
    hasProductionSecretShape("prod_ops_admin_token_0123456789abcd", 32),
    "long ops admin token should pass production secret shape"
  );
  assertSelfTest(
    !hasProductionSecretShape("raw-secret", 32) &&
      !hasProductionSecretShape("placeholder", 32) &&
      !hasProductionSecretShape("prod ops admin token 0123456789", 32),
    "short, placeholder, or whitespace ops admin tokens should fail production secret shape"
  );

  const expectedEndpoints = deriveExpectedBackendEndpoints("https://prod-a.convex.site");
  assertSelfTest(
    expectedEndpoints.googleCallbackUrl === "https://prod-a.convex.site/api/auth/callback/google",
    "Google OAuth callback URL should be derived from the clean Convex HTTP Actions origin"
  );
  assertSelfTest(
    expectedEndpoints.polarWebhookUrl === "https://prod-a.convex.site/polar/events",
    "Polar webhook URL should be derived from the clean Convex HTTP Actions origin"
  );
  assertSelfTest(
    deriveExpectedBackendEndpoints("https://prod-a.convex.site/path").googleCallbackUrl === null,
    "Convex HTTP Actions origins with paths should not derive OAuth callback URLs"
  );
  assertSelfTest(
    deriveExpectedBackendEndpoints("https://prod-a.convex.cloud").polarWebhookUrl === null,
    "Convex cloud API origins should not derive Polar webhook URLs"
  );

  const rejectedPublicSiteOrigins = [
    "https://localhost",
    "https://app.localhost",
    "https://app.local",
    "https://0.0.0.0",
    "https://10.0.0.1",
    "https://100.64.0.1",
    "https://127.0.0.1",
    "https://169.254.1.1",
    "https://172.16.0.1",
    "https://192.0.2.1",
    "https://192.168.1.1",
    "https://198.18.0.1",
    "https://198.51.100.1",
    "https://203.0.113.1",
    "https://224.0.0.1",
    "https://8.8.8.8",
    "https://[::]",
    "https://[::1]",
    "https://[fd00::1]",
    "https://[fe80::1]",
    "https://[::ffff:10.0.0.1]",
    "https://[2606:4700:4700::1111]",
  ];
  for (const origin of rejectedPublicSiteOrigins) {
    assertSelfTest(
      !isPublicHttpsOriginUrl(origin),
      `${origin} should be rejected as a public app origin`
    );
  }

  assertSelfTest(
    isPublicHttpsOriginUrl("https://app.example.com"),
    "normal HTTPS app origin should be accepted as public"
  );

  const frontendPrivateSiteOrigin = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://100.64.0.1",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendPrivateSiteOrigin.missingRuntimeRequired.includes(
      "frontend.frontendSiteUrlPublicOrigin"
    ),
    "frontend private/link-local site origin should fail production readiness"
  );
  const frontendLocalhostSubdomainSiteOrigin = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.localhost",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendLocalhostSubdomainSiteOrigin.missingRuntimeRequired.includes(
      "frontend.frontendSiteUrlPublicOrigin"
    ),
    "frontend localhost-subdomain site origin should fail production readiness"
  );
  const frontendRawIpSiteOrigin = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://8.8.8.8",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendRawIpSiteOrigin.missingRuntimeRequired.includes(
      "frontend.frontendSiteUrlPublicOrigin"
    ),
    "frontend raw IP site origin should fail production readiness"
  );

  const matchingReadiness = {
    endpoints: {
      convexSiteOrigin: "https://prod-a.convex.site",
      siteUrlOrigin: "https://app.example.com",
    },
  };
  const matching = selfTestReadiness(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    matchingReadiness
  );
  assertSelfTest(matching.allRequiredReady, "matching frontend/backend origins should pass");

  const matchingFrontendReadiness = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  const readyBackendReadiness = {
    allRequiredReady: true,
    missingRequired: [],
    missingRuntimeRequired: [],
    endpoints: matchingReadiness.endpoints,
  };
  assertSelfTest(
    isProductionReady(readyBackendReadiness, matchingFrontendReadiness, matching),
    "overall readiness should pass only when backend, frontend, and cross-runtime checks all pass"
  );

  const billingAdminTokenBackendFailure = {
    ...readyBackendReadiness,
    allRequiredReady: false,
    missingRuntimeRequired: ["polar.billingAdminTokenDisabled"],
    runtimeChecks: {
      polar: [
        {
          key: "billingAdminTokenDisabled",
          label: "Billing admin token disabled",
          required: true,
          ready: false,
          status: "invalidConfig",
          detail: "Billing product sync admin token must be removed after sync",
        },
      ],
    },
  };
  assertSelfTest(
    !isProductionReady(billingAdminTokenBackendFailure, matchingFrontendReadiness, matching),
    "backend billing admin token runtime failure should fail overall production readiness"
  );

  const backendPrivateSiteOriginFailure = {
    ...readyBackendReadiness,
    allRequiredReady: false,
    missingRuntimeRequired: ["oauth.siteUrlHttps"],
    runtimeChecks: {
      oauth: [
        {
          key: "siteUrlHttps",
          label: "Frontend site URL HTTPS origin",
          required: true,
          ready: false,
          status: "invalidConfig",
          detail: "SITE_URL production phải là HTTPS public origin theo domain, không phải localhost/IP riêng/raw IP, và không kèm path/query/hash/port/credentials",
        },
      ],
    },
  };
  assertSelfTest(
    !isProductionReady(backendPrivateSiteOriginFailure, matchingFrontendReadiness, matching),
    "backend private/link-local SITE_URL runtime failure should fail overall production readiness"
  );
  const readyEvidence = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    () => buildEvidence(readyBackendReadiness, matchingFrontendReadiness)
  );
  assertSelfTest(
    readyEvidence.schema === "li-xi.production-readiness-evidence.v1" &&
      readyEvidence.redaction.mode === "audit-safe" &&
      readyEvidence.redaction.omittedFields.includes("runtimeCheck.detail") &&
      readyEvidence.productionReady &&
      readyEvidence.endpoints.googleCallbackUrl === null &&
      Array.isArray(readyEvidence.frontend.missingRuntimeRequired) &&
      Array.isArray(readyEvidence.backend.missingRuntimeRequired) &&
      Array.isArray(readyEvidence.crossRuntime.missingRuntimeRequired) &&
      JSON.stringify(readyEvidence).includes('"configuredName":') === false &&
      JSON.stringify(readyEvidence).includes('"acceptedNames":') === false &&
      JSON.stringify(readyEvidence).includes('"detail":') === false &&
      JSON.stringify(readyEvidence).includes("ops-token") === false,
    "redacted evidence should summarize readiness without secrets, env metadata, or verbose details"
  );

  const frontendLegacyAuthEnabled = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: "true",
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendLegacyAuthEnabled.missingRuntimeRequired.includes(
      "frontend.frontendLegacyAccountAuthDisabled"
    ),
    "frontend legacy account auth flag should fail production readiness"
  );
  const frontendLegacyAuthAliasEnabled = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: "true",
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendLegacyAuthAliasEnabled.missingRuntimeRequired.includes(
      "frontend.frontendLegacyAccountAuthDisabled"
    ),
    "frontend legacy account auth compatibility flag should fail production readiness"
  );

  const frontendLegacyBridgeEnabled = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: "true",
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendLegacyBridgeEnabled.missingRuntimeRequired.includes(
      "frontend.frontendLegacyOwnerBridgeDisabled"
    ),
    "frontend legacy owner bridge flag should fail production readiness"
  );
  const frontendLegacyBridgeAliasEnabled = withEnv(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: "true",
    },
    evaluateFrontendReadiness
  );
  assertSelfTest(
    frontendLegacyBridgeAliasEnabled.missingRuntimeRequired.includes(
      "frontend.frontendLegacyOwnerBridgeDisabled"
    ),
    "frontend legacy owner bridge compatibility flag should fail production readiness"
  );

  const mismatchedConvexDeployment = selfTestReadiness(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    {
      endpoints: {
        convexSiteOrigin: "https://prod-b.convex.site",
        siteUrlOrigin: "https://app.example.com",
      },
    }
  );
  assertSelfTest(
    mismatchedConvexDeployment.missingRuntimeRequired.includes(
      "deployment.frontendBackendConvexDeploymentMatch"
    ),
    "mismatched .convex.cloud/.convex.site deployment labels should fail"
  );

  const invalidBackendConvexOrigin = selfTestReadiness(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    {
      endpoints: {
        convexSiteOrigin: "https://example.com",
        siteUrlOrigin: "https://app.example.com",
      },
    }
  );
  assertSelfTest(
    invalidBackendConvexOrigin.missingRuntimeRequired.includes(
      "deployment.frontendBackendConvexDeploymentMatch"
    ),
    "invalid backend Convex site origin should fail deployment parity"
  );

  const mismatchedSiteOrigin = selfTestReadiness(
    {
      VITE_CONVEX_URL: "https://prod-a.convex.cloud",
      VITE_SITE_URL: "https://app-a.example.com",
      VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
      VITE_ENABLE_LEGACY_AUTH: undefined,
      VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
      VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
    },
    {
      endpoints: {
        convexSiteOrigin: "https://prod-a.convex.site",
        siteUrlOrigin: "https://app-b.example.com",
      },
    }
  );
  assertSelfTest(
    mismatchedSiteOrigin.missingRuntimeRequired.includes(
      "deployment.frontendBackendSiteOriginMatch"
    ),
    "mismatched frontend/backend site origins should fail"
  );

  console.log("production readiness self-tests passed");
}

export {
  buildEvidence,
  deriveExpectedBackendEndpoints,
  evaluateCrossRuntimeReadiness,
  evaluateFrontendReadiness,
  configuredOpsAdminToken,
  isConvexCloudDeploymentOrigin,
  isConvexSiteDeploymentOrigin,
  isProductionReady,
  isPublicHttpsOriginUrl,
  hasProductionSecretShape,
};

async function main() {
  const cliArgs = process.argv.slice(2);
  if (cliArgs.includes("--self-test")) {
    if (cliArgs.length !== 1) {
      console.error("--self-test cannot be combined with production readiness target args");
      process.exit(1);
    }
    try {
      runSelfTests();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    process.exit(0);
  }

  try {
    const { targetArgs, evidenceOut } = parseProductionArgs(cliArgs);
    await runCommand("node", ["scripts/verify-saas-contracts.mjs"]);
    const frontendReadiness = evaluateFrontendReadiness();
    const adminToken = configuredOpsAdminToken();
    if (!adminToken) {
      throw new Error("Missing LI_XI_OPS_ADMIN_TOKEN or LIXI_OPS_ADMIN_TOKEN");
    }
    if (!hasProductionSecretShape(adminToken, 32)) {
      throw new Error("LI_XI_OPS_ADMIN_TOKEN must be a production-safe secret of at least 32 characters");
    }

    const output = await runCommand("npx", [
      "convex",
      "run",
      ...targetArgs,
      "ops:getSaaSReadiness",
      JSON.stringify({ adminToken }),
    ]);
    const readiness = extractJsonObject(output);
    const passed = summarizeReadiness(readiness, frontendReadiness);
    if (evidenceOut) {
      await writeEvidence(evidenceOut, buildEvidence(readiness, frontendReadiness));
    }
    if (!passed) {
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
