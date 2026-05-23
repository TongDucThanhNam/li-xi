#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const expectedSchema = "li-xi.production-readiness-evidence.v1";
const requiredOmittedFields = [
  "opsAdminToken",
  "secretValues",
  "configuredName",
  "acceptedNames",
  "runtimeCheck.detail",
];
const forbiddenFieldNames = new Set(["configuredName", "acceptedNames", "detail"]);
const maxGeneratedAfterCheckedAtMs = 60 * 60 * 1000;
const allowedClockSkewMs = 5 * 60 * 1000;
const convexSiteDeploymentHostPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.convex\.site$/i;

function usage() {
  console.log(`Usage: node scripts/validate-production-evidence.mjs <evidence.json>
       node scripts/validate-production-evidence.mjs --self-test`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visitor);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    visitor(key, child);
    walk(child, visitor);
  }
}

function assertNoForbiddenEvidenceFields(evidence) {
  walk(evidence, (key) => {
    assert(!forbiddenFieldNames.has(key), `Evidence contains forbidden field: ${key}`);
  });
}

function assertIsoDateString(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be an ISO timestamp string`);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `${label} must be a valid ISO timestamp`);
  return timestamp;
}

function assertUnixMs(value, label) {
  assert(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be a positive Unix millisecond timestamp`
  );
}

function assertEvidenceTimestampConsistency(generatedAt, checkedAt) {
  assert(
    generatedAt + allowedClockSkewMs >= checkedAt,
    "generatedAt must not be before checkedAt beyond allowed clock skew"
  );
  assert(
    generatedAt - checkedAt <= maxGeneratedAfterCheckedAtMs,
    "generatedAt must be close to checkedAt"
  );
}

function parseUrl(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a URL string`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
}

function assertCleanHttpsOrigin(value, label) {
  const normalizedInput = typeof value === "string" ? value.trim() : value;
  const url = parseUrl(value, label);
  assert(url.protocol === "https:", `${label} must use https`);
  assert(url.username === "" && url.password === "", `${label} must not include credentials`);
  assert(url.pathname === "/" && url.search === "" && url.hash === "", `${label} must be an origin only`);
  assert(url.port === "", `${label} must not include a port`);
  assert(
    normalizedInput === url.origin || normalizedInput === `${url.origin}/`,
    `${label} must be a clean origin`
  );
  return url;
}

function assertConvexSiteOrigin(value) {
  const url = assertCleanHttpsOrigin(value, "endpoints.convexSiteOrigin");
  assert(
    convexSiteDeploymentHostPattern.test(url.hostname),
    "endpoints.convexSiteOrigin must be a clean Convex HTTP Actions origin"
  );
  return url.origin;
}

function assertPublicSiteOrigin(value) {
  const url = assertCleanHttpsOrigin(value, "endpoints.siteUrlOrigin");
  const hostname = url.hostname.toLowerCase();
  assert(
    hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "[::1]" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local"),
    "endpoints.siteUrlOrigin must be a public app origin, not localhost/private/link-local/CGNAT/local network"
  );
  assert(
    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname),
    "endpoints.siteUrlOrigin must not be a raw IPv4 address, including private/link-local/CGNAT literals"
  );
  assert(!hostname.includes(":"), "endpoints.siteUrlOrigin must not be a raw IPv6 address");
  return url.origin;
}

function assertEndpointUrl(value, label, expectedOrigin, expectedPathname) {
  const url = parseUrl(value, label);
  const expectedUrl = `${expectedOrigin}${expectedPathname}`;
  assert(url.protocol === "https:", `${label} must use https`);
  assert(url.username === "" && url.password === "", `${label} must not include credentials`);
  assert(url.origin === expectedOrigin, `${label} must use endpoints.convexSiteOrigin`);
  assert(url.pathname === expectedPathname, `${label} must use ${expectedPathname}`);
  assert(url.search === "" && url.hash === "", `${label} must not include query or hash`);
  assert(value.trim() === expectedUrl, `${label} must be a clean endpoint URL`);
}

function assertRuntimeChecksShape(groupName, runtimeChecks) {
  assert(isRecord(runtimeChecks), `${groupName}.runtimeChecks must be an object`);
  for (const [runtimeGroup, checks] of Object.entries(runtimeChecks)) {
    assert(Array.isArray(checks), `${groupName}.runtimeChecks.${runtimeGroup} must be an array`);
    for (const check of checks) {
      assert(isRecord(check), `${groupName}.runtimeChecks.${runtimeGroup} check must be an object`);
      assert(typeof check.key === "string" && check.key.length > 0, "runtime check key required");
      assert(typeof check.label === "string" && check.label.length > 0, "runtime check label required");
      assert(typeof check.required === "boolean", "runtime check required flag must be boolean");
      assert(typeof check.ready === "boolean", "runtime check ready flag must be boolean");
      assert(typeof check.status === "string" && check.status.length > 0, "runtime check status required");
    }
  }
}

function assertReadinessSection(name, section) {
  assert(isRecord(section), `${name} section must be an object`);
  assert(typeof section.allRequiredReady === "boolean", `${name}.allRequiredReady must be boolean`);
  assert(Array.isArray(section.missingRuntimeRequired), `${name}.missingRuntimeRequired must be an array`);
  if ("allRequiredConfigured" in section) {
    assert(
      typeof section.allRequiredConfigured === "boolean",
      `${name}.allRequiredConfigured must be boolean`
    );
  }
  if ("missingRequired" in section) {
    assert(Array.isArray(section.missingRequired), `${name}.missingRequired must be an array`);
  }
  assertRuntimeChecksShape(name, section.runtimeChecks);
}

function assertRequiredRuntimeCheckKeys(sectionName, section, keys) {
  const checksByKey = new Map(
    Object.values(section.runtimeChecks ?? {})
      .flatMap((checks) => checks)
      .map((check) => [check.key, check])
  );
  for (const key of keys) {
    const check = checksByKey.get(key);
    assert(check, `${sectionName}.runtimeChecks must include ${key}`);
    assert(check.required === true, `${sectionName}.runtimeChecks.${key} must be required`);
  }
}

function assertRuntimeCheckKeysPresent(sectionName, section, keys) {
  const checksByKey = new Map(
    Object.values(section.runtimeChecks ?? {})
      .flatMap((checks) => checks)
      .map((check) => [check.key, check])
  );
  for (const key of keys) {
    assert(checksByKey.has(key), `${sectionName}.runtimeChecks must include ${key}`);
  }
}

function assertRequiredRuntimeCheckGroups(sectionName, section, groups) {
  for (const [groupName, keys] of Object.entries(groups)) {
    const checks = section.runtimeChecks?.[groupName];
    assert(Array.isArray(checks), `${sectionName}.runtimeChecks must include ${groupName}`);
    const checksByKey = new Map(checks.map((check) => [check.key, check]));
    for (const key of keys) {
      const check = checksByKey.get(key);
      assert(check, `${sectionName}.runtimeChecks.${groupName} must include ${key}`);
      assert(
        check.required === true,
        `${sectionName}.runtimeChecks.${groupName}.${key} must be required`
      );
    }
  }
}

function assertRequiredRuntimeChecksReady(sectionName, section) {
  for (const [runtimeGroup, checks] of Object.entries(section.runtimeChecks ?? {})) {
    for (const check of checks) {
      if (!check.required) {
        continue;
      }
      assert(
        check.ready === true,
        `${sectionName}.runtimeChecks.${runtimeGroup}.${check.key} must be ready`
      );
      assert(
        check.status === "ready",
        `${sectionName}.runtimeChecks.${runtimeGroup}.${check.key} status must be ready`
      );
    }
  }
}

export function validateProductionEvidence(evidence) {
  assert(isRecord(evidence), "Evidence must be a JSON object");
  assert(evidence.schema === expectedSchema, `Evidence schema must be ${expectedSchema}`);
  const generatedAt = assertIsoDateString(evidence.generatedAt, "generatedAt");
  assertUnixMs(evidence.checkedAt, "checkedAt");
  assertEvidenceTimestampConsistency(generatedAt, evidence.checkedAt);
  assert(evidence.accessSource === "adminToken", "accessSource must be adminToken");
  assert(evidence.productionReady === true, "productionReady must be true");

  assert(isRecord(evidence.redaction), "redaction metadata required");
  assert(evidence.redaction.mode === "audit-safe", "redaction.mode must be audit-safe");
  assert(Array.isArray(evidence.redaction.omittedFields), "redaction.omittedFields must be an array");
  for (const field of requiredOmittedFields) {
    assert(
      evidence.redaction.omittedFields.includes(field),
      `redaction.omittedFields must include ${field}`
    );
  }

  assert(isRecord(evidence.endpoints), "endpoints must be an object");
  const convexSiteOrigin = assertConvexSiteOrigin(evidence.endpoints.convexSiteOrigin);
  assertPublicSiteOrigin(evidence.endpoints.siteUrlOrigin);
  assertEndpointUrl(
    evidence.endpoints.googleCallbackUrl,
    "endpoints.googleCallbackUrl",
    convexSiteOrigin,
    "/api/auth/callback/google"
  );
  assertEndpointUrl(
    evidence.endpoints.polarWebhookUrl,
    "endpoints.polarWebhookUrl",
    convexSiteOrigin,
    "/polar/events"
  );

  assertReadinessSection("frontend", evidence.frontend);
  assertReadinessSection("backend", evidence.backend);
  assertReadinessSection("crossRuntime", evidence.crossRuntime);
  assertRequiredRuntimeCheckKeys("frontend", evidence.frontend, [
    "frontendConvexUrlHttpsOrigin",
    "frontendSiteUrlPublicOrigin",
    "frontendLegacyAccountAuthDisabled",
    "frontendLegacyOwnerBridgeDisabled",
  ]);
  assertRequiredRuntimeCheckGroups("backend", evidence.backend, {
    oauth: [
      "convexSiteUrlHttps",
      "siteUrlHttps",
      "siteUrlOriginDerived",
      "googleCallbackUrlDerived",
      "polarWebhookUrlDerived",
      "googleClientIdShape",
      "googleClientSecretShape",
      "jwtPrivateKeyShape",
      "jwksShape",
    ],
    r2: [
      "r2TokenShape",
      "r2AccessKeyIdShape",
      "r2SecretAccessKeyShape",
      "r2EndpointHttpsOrigin",
      "r2BucketNameSafe",
    ],
    polar: [
      "polarOrganizationTokenShape",
      "polarWebhookSecretShape",
      "productionPolarServer",
      "uniqueConfiguredProducts",
      "proProductSynced",
      "businessProductSynced",
      "billingAdminTokenDisabled",
    ],
    operations: [
      "migrationTokenDisabled",
      "paidPlanFallbackDisabled",
      "legacyAccountAuthDisabled",
      "legacyOwnerBridgeDisabled",
    ],
  });
  assertRuntimeCheckKeysPresent("backend", evidence.backend, [
    "billingAdminTokenShapeSafe",
    "migrationTokenShapeSafe",
  ]);
  assertRequiredRuntimeCheckKeys("crossRuntime", evidence.crossRuntime, [
    "frontendBackendSiteOriginMatch",
    "frontendBackendConvexDeploymentMatch",
  ]);

  for (const [name, section] of Object.entries({
    frontend: evidence.frontend,
    backend: evidence.backend,
    crossRuntime: evidence.crossRuntime,
  })) {
    assert(section.allRequiredReady === true, `${name}.allRequiredReady must be true`);
    assert(
      section.missingRuntimeRequired.length === 0,
      `${name}.missingRuntimeRequired must be empty`
    );
    if ("allRequiredConfigured" in section) {
      assert(section.allRequiredConfigured === true, `${name}.allRequiredConfigured must be true`);
    }
    if ("missingRequired" in section) {
      assert(section.missingRequired.length === 0, `${name}.missingRequired must be empty`);
    }
    assertRequiredRuntimeChecksReady(name, section);
  }

  assertNoForbiddenEvidenceFields(evidence);
  return true;
}

function fixture(overrides = {}) {
  return {
    schema: expectedSchema,
    generatedAt: "2026-05-22T00:00:00.000Z",
    checkedAt: 1779408000000,
    accessSource: "adminToken",
    productionReady: true,
    redaction: {
      mode: "audit-safe",
      omittedFields: requiredOmittedFields,
    },
    endpoints: {
      googleCallbackUrl: "https://prod-a.convex.site/api/auth/callback/google",
      polarWebhookUrl: "https://prod-a.convex.site/polar/events",
      convexSiteOrigin: "https://prod-a.convex.site",
      siteUrlOrigin: "https://app.example.com",
    },
    frontend: {
      allRequiredConfigured: true,
      allRequiredReady: true,
      missingRequired: [],
      missingRuntimeRequired: [],
      runtimeChecks: {
        frontend: [
          {
            key: "frontendConvexUrlHttpsOrigin",
            label: "Frontend Convex URL HTTPS origin",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "frontendSiteUrlPublicOrigin",
            label: "Frontend public site URL HTTPS origin",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "frontendLegacyAccountAuthDisabled",
            label: "Frontend legacy username/PIN auth disabled",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "frontendLegacyOwnerBridgeDisabled",
            label: "Frontend legacy owner bridge disabled",
            required: true,
            ready: true,
            status: "ready",
          },
        ],
      },
    },
    backend: {
      allRequiredConfigured: true,
      allRequiredReady: true,
      missingRequired: [],
      missingRuntimeRequired: [],
      runtimeChecks: {
        oauth: [
          {
            key: "convexSiteUrlHttps",
            label: "Convex site URL HTTPS origin",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "siteUrlHttps",
            label: "Frontend site URL HTTPS origin",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "siteUrlOriginDerived",
            label: "Frontend site URL origin derived",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "googleCallbackUrlDerived",
            label: "Google callback URL derived",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "polarWebhookUrlDerived",
            label: "Polar webhook URL derived",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "googleClientIdShape",
            label: "Google OAuth client id shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "googleClientSecretShape",
            label: "Google OAuth client secret shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "jwtPrivateKeyShape",
            label: "Convex Auth JWT private key shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "jwksShape",
            label: "Convex Auth JWKS shape",
            required: true,
            ready: true,
            status: "ready",
          },
        ],
        r2: [
          {
            key: "r2TokenShape",
            label: "R2 token shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "r2AccessKeyIdShape",
            label: "R2 access key id shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "r2SecretAccessKeyShape",
            label: "R2 secret access key shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "r2EndpointHttpsOrigin",
            label: "R2 endpoint HTTPS origin",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "r2BucketNameSafe",
            label: "R2 bucket name safe",
            required: true,
            ready: true,
            status: "ready",
          },
        ],
        polar: [
          {
            key: "polarOrganizationTokenShape",
            label: "Polar organization token shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "polarWebhookSecretShape",
            label: "Polar webhook secret shape",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "productionPolarServer",
            label: "Polar production server",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "uniqueConfiguredProducts",
            label: "Polar product IDs unique",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "proProductSynced",
            label: "Polar Pro product synced",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "businessProductSynced",
            label: "Polar Business product synced",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "billingAdminTokenDisabled",
            label: "Billing admin token disabled",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "billingAdminTokenShapeSafe",
            label: "Billing admin token shape safe",
            required: true,
            ready: true,
            status: "ready",
          },
        ],
        operations: [
          {
            key: "migrationTokenDisabled",
            label: "Migration token disabled",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "migrationTokenShapeSafe",
            label: "Migration token shape safe",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "paidPlanFallbackDisabled",
            label: "Paid fallback plan disabled",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "legacyAccountAuthDisabled",
            label: "Legacy username/PIN account auth disabled",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "legacyOwnerBridgeDisabled",
            label: "Legacy owner bridge disabled",
            required: true,
            ready: true,
            status: "ready",
          },
        ],
      },
    },
    crossRuntime: {
      allRequiredReady: true,
      missingRuntimeRequired: [],
      runtimeChecks: {
        deployment: [
          {
            key: "frontendBackendSiteOriginMatch",
            label: "Frontend/backend site origin match",
            required: true,
            ready: true,
            status: "ready",
          },
          {
            key: "frontendBackendConvexDeploymentMatch",
            label: "Frontend/backend Convex deployment match",
            required: true,
            ready: true,
            status: "ready",
          },
        ],
      },
    },
    ...overrides,
  };
}

function runSelfTests() {
  validateProductionEvidence(fixture());

  for (const [name, evidence] of [
    ["invalid generatedAt", fixture({ generatedAt: "not-a-date" })],
    ["invalid checkedAt", fixture({ checkedAt: "2026-05-22T00:00:00.000Z" })],
    ["generated before checkedAt", fixture({ generatedAt: "2026-05-21T23:00:00.000Z" })],
    ["generated too long after checkedAt", fixture({ generatedAt: "2026-05-22T02:00:00.000Z" })],
    ["host readiness access source", fixture({ accessSource: "convexAuth" })],
    ["not ready", fixture({ productionReady: false })],
    [
      "missing runtime",
      fixture({
        frontend: {
          ...fixture().frontend,
          allRequiredReady: false,
          missingRuntimeRequired: ["frontend.frontendSiteUrlPublicOrigin"],
        },
      }),
    ],
    [
      "missing frontend legacy shutdown check",
      fixture({
        frontend: {
          ...fixture().frontend,
          runtimeChecks: {
            frontend: fixture().frontend.runtimeChecks.frontend.filter(
              (check) => check.key !== "frontendLegacyOwnerBridgeDisabled"
            ),
          },
        },
      }),
    ],
    [
      "missing backend migration token shutdown check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            operations: fixture().backend.runtimeChecks.operations.filter(
              (check) => check.key !== "migrationTokenDisabled"
            ),
          },
        },
      }),
    ],
    [
      "missing backend google callback derived check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            oauth: fixture().backend.runtimeChecks.oauth.filter(
              (check) => check.key !== "googleCallbackUrlDerived"
            ),
          },
        },
      }),
    ],
    [
      "missing backend r2 endpoint readiness check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            r2: fixture().backend.runtimeChecks.r2.filter(
              (check) => check.key !== "r2EndpointHttpsOrigin"
            ),
          },
        },
      }),
    ],
    [
      "misplaced backend r2 endpoint readiness check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            oauth: [
              ...fixture().backend.runtimeChecks.oauth,
              fixture().backend.runtimeChecks.r2.find(
                (check) => check.key === "r2EndpointHttpsOrigin"
              ),
            ],
            r2: fixture().backend.runtimeChecks.r2.filter(
              (check) => check.key !== "r2EndpointHttpsOrigin"
            ),
          },
        },
      }),
    ],
    [
      "missing backend configured products check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            polar: fixture().backend.runtimeChecks.polar.filter(
              (check) => check.key !== "uniqueConfiguredProducts"
            ),
          },
        },
      }),
    ],
    [
      "missing cross-runtime site origin match check",
      fixture({
        crossRuntime: {
          ...fixture().crossRuntime,
          runtimeChecks: {
            deployment: fixture().crossRuntime.runtimeChecks.deployment.filter(
              (check) => check.key !== "frontendBackendSiteOriginMatch"
            ),
          },
        },
      }),
    ],
    [
      "missing backend billing token shape check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            polar: fixture().backend.runtimeChecks.polar.filter(
              (check) => check.key !== "billingAdminTokenShapeSafe"
            ),
          },
        },
      }),
    ],
    [
      "missing backend migration token shape check",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            ...fixture().backend.runtimeChecks,
            operations: fixture().backend.runtimeChecks.operations.filter(
              (check) => check.key !== "migrationTokenShapeSafe"
            ),
          },
        },
      }),
    ],
    [
      "required runtime check not ready",
      fixture({
        frontend: {
          ...fixture().frontend,
          runtimeChecks: {
            frontend: fixture().frontend.runtimeChecks.frontend.map((check) =>
              check.key === "frontendLegacyAccountAuthDisabled"
                ? { ...check, ready: false, status: "invalidConfig" }
                : check
            ),
          },
        },
      }),
    ],
    [
      "forbidden detail",
      fixture({
        backend: {
          ...fixture().backend,
          runtimeChecks: {
            polar: [
              {
                key: "billingAdminTokenDisabled",
                label: "Billing admin token disabled",
                required: true,
                ready: true,
                status: "ready",
                detail: "secret-adjacent explanation",
              },
            ],
          },
        },
      }),
    ],
    [
      "missing redaction field",
      fixture({
        redaction: {
          mode: "audit-safe",
          omittedFields: requiredOmittedFields.filter((field) => field !== "secretValues"),
        },
      }),
    ],
    [
      "convex site origin with path",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          convexSiteOrigin: "https://prod-a.convex.site/api",
        },
      }),
    ],
    [
      "convex site origin with leading hyphen",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          convexSiteOrigin: "https://-prod.convex.site",
        },
      }),
    ],
    [
      "convex site origin with trailing hyphen",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          convexSiteOrigin: "https://prod-.convex.site",
        },
      }),
    ],
    [
      "convex site origin with explicit default port",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          convexSiteOrigin: "https://prod-a.convex.site:443",
        },
      }),
    ],
    [
      "private public site origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          siteUrlOrigin: "https://127.0.0.1",
        },
      }),
    ],
    [
      "cgnat public site origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          siteUrlOrigin: "https://100.64.0.1",
        },
      }),
    ],
    [
      "raw public ipv4 site origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          siteUrlOrigin: "https://8.8.8.8",
        },
      }),
    ],
    [
      "raw public ipv6 site origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          siteUrlOrigin: "https://[2606:4700:4700::1111]",
        },
      }),
    ],
    [
      "localhost subdomain public site origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          siteUrlOrigin: "https://app.localhost",
        },
      }),
    ],
    [
      "private ipv6 public site origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          siteUrlOrigin: "https://[fd00::1]",
        },
      }),
    ],
    [
      "mismatched google callback origin",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          googleCallbackUrl: "https://other.convex.site/api/auth/callback/google",
        },
      }),
    ],
    [
      "google callback with credentials",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          googleCallbackUrl: "https://user:pass@prod-a.convex.site/api/auth/callback/google",
        },
      }),
    ],
    [
      "google callback with explicit default port",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          googleCallbackUrl: "https://prod-a.convex.site:443/api/auth/callback/google",
        },
      }),
    ],
    [
      "wrong Polar webhook path",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          polarWebhookUrl: "https://prod-a.convex.site/polar/wrong",
        },
      }),
    ],
    [
      "polar webhook with explicit default port",
      fixture({
        endpoints: {
          ...fixture().endpoints,
          polarWebhookUrl: "https://prod-a.convex.site:443/polar/events",
        },
      }),
    ],
  ]) {
    try {
      validateProductionEvidence(evidence);
      throw new Error(`Expected invalid fixture to fail: ${name}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Expected invalid fixture")) {
        throw error;
      }
    }
  }

  console.log("production evidence validator self-tests passed");
}

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.length === 1 && args[0] === "--self-test") {
      runSelfTests();
    } else if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      usage();
    } else if (args.length === 1) {
      const evidence = JSON.parse(await readFile(args[0], "utf8"));
      validateProductionEvidence(evidence);
      console.log("production evidence artifact is valid");
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
