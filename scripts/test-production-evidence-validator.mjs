#!/usr/bin/env node

import { validateProductionEvidence } from "./validate-production-evidence.mjs";

const checkedAt = Date.parse("2026-05-22T00:00:00.000Z");

const requiredOmittedFields = [
  "opsAdminToken",
  "secretValues",
  "configuredName",
  "acceptedNames",
  "runtimeCheck.detail",
];

function readyCheck(key) {
  return {
    key,
    label: key,
    required: true,
    ready: true,
    status: "ready",
  };
}

function validEvidence(overrides = {}) {
  return {
    schema: "li-xi.production-readiness-evidence.v1",
    generatedAt: "2026-05-22T00:00:00.000Z",
    checkedAt,
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
          readyCheck("frontendConvexUrlHttpsOrigin"),
          readyCheck("frontendSiteUrlPublicOrigin"),
          readyCheck("frontendLegacyAccountAuthDisabled"),
          readyCheck("frontendLegacyOwnerBridgeDisabled"),
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
          readyCheck("convexSiteUrlHttps"),
          readyCheck("siteUrlHttps"),
          readyCheck("siteUrlOriginDerived"),
          readyCheck("googleCallbackUrlDerived"),
          readyCheck("polarWebhookUrlDerived"),
          readyCheck("googleClientIdShape"),
          readyCheck("googleClientSecretShape"),
          readyCheck("jwtPrivateKeyShape"),
          readyCheck("jwksShape"),
        ],
        r2: [
          readyCheck("r2TokenShape"),
          readyCheck("r2AccessKeyIdShape"),
          readyCheck("r2SecretAccessKeyShape"),
          readyCheck("r2EndpointHttpsOrigin"),
          readyCheck("r2BucketNameSafe"),
        ],
        polar: [
          readyCheck("polarOrganizationTokenShape"),
          readyCheck("polarWebhookSecretShape"),
          readyCheck("productionPolarServer"),
          readyCheck("uniqueConfiguredProducts"),
          readyCheck("proProductSynced"),
          readyCheck("businessProductSynced"),
          readyCheck("billingAdminTokenDisabled"),
          readyCheck("billingAdminTokenShapeSafe"),
        ],
        operations: [
          readyCheck("migrationTokenDisabled"),
          readyCheck("migrationTokenShapeSafe"),
          readyCheck("paidPlanFallbackDisabled"),
          readyCheck("legacyAccountAuthDisabled"),
          readyCheck("legacyOwnerBridgeDisabled"),
        ],
      },
    },
    crossRuntime: {
      allRequiredReady: true,
      missingRuntimeRequired: [],
      runtimeChecks: {
        deployment: [
          readyCheck("frontendBackendSiteOriginMatch"),
          readyCheck("frontendBackendConvexDeploymentMatch"),
        ],
      },
    },
    ...overrides,
  };
}

function assertRejects(name, evidence, expectedMessage) {
  try {
    validateProductionEvidence(evidence);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedMessage)) {
      return;
    }
    throw new Error(`${name} failed with unexpected message: ${message}`);
  }
  throw new Error(`${name} should fail validation`);
}

validateProductionEvidence(validEvidence());

assertRejects(
  "missing required backend runtime group",
  validEvidence({
    backend: {
      ...validEvidence().backend,
      runtimeChecks: {
        ...validEvidence().backend.runtimeChecks,
        r2: validEvidence().backend.runtimeChecks.r2.filter(
          (check) => check.key !== "r2EndpointHttpsOrigin"
        ),
      },
    },
  }),
  "backend.runtimeChecks.r2 must include r2EndpointHttpsOrigin"
);

assertRejects(
  "required runtime not ready",
  validEvidence({
    frontend: {
      ...validEvidence().frontend,
      runtimeChecks: {
        frontend: validEvidence().frontend.runtimeChecks.frontend.map((check) =>
          check.key === "frontendLegacyAccountAuthDisabled"
            ? { ...check, ready: false, status: "invalidConfig" }
            : check
        ),
      },
    },
  }),
  "frontend.runtimeChecks.frontend.frontendLegacyAccountAuthDisabled must be ready"
);

validateProductionEvidence(
  validEvidence({
    backend: {
      ...validEvidence().backend,
      runtimeChecks: {
        ...validEvidence().backend.runtimeChecks,
        polar: validEvidence().backend.runtimeChecks.polar.map((check) =>
          check.key === "billingAdminTokenShapeSafe" ? { ...check, required: false } : check
        ),
        operations: validEvidence().backend.runtimeChecks.operations.map((check) =>
          check.key === "migrationTokenShapeSafe" ? { ...check, required: false } : check
        ),
      },
    },
  })
);

assertRejects(
  "missing optional token shape checks",
  validEvidence({
    backend: {
      ...validEvidence().backend,
      runtimeChecks: {
        ...validEvidence().backend.runtimeChecks,
        polar: validEvidence().backend.runtimeChecks.polar.filter(
          (check) => check.key !== "billingAdminTokenShapeSafe"
        ),
      },
    },
  }),
  "backend.runtimeChecks must include billingAdminTokenShapeSafe"
);

assertRejects(
  "forbidden runtime detail",
  validEvidence({
    backend: {
      ...validEvidence().backend,
      runtimeChecks: {
        ...validEvidence().backend.runtimeChecks,
        polar: validEvidence().backend.runtimeChecks.polar.map((check) =>
          check.key === "billingAdminTokenDisabled"
            ? { ...check, detail: "secret-adjacent explanation" }
            : check
        ),
      },
    },
  }),
  "Evidence contains forbidden field: detail"
);

assertRejects(
  "bad Convex site deployment label",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      convexSiteOrigin: "https://prod-.convex.site",
    },
  }),
  "endpoints.convexSiteOrigin must be a clean Convex HTTP Actions origin"
);

assertRejects(
  "default-port Convex site origin",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      convexSiteOrigin: "https://prod-a.convex.site:443",
    },
  }),
  "endpoints.convexSiteOrigin must be a clean origin"
);

assertRejects(
  "raw public IPv4 site origin",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      siteUrlOrigin: "https://8.8.8.8",
    },
  }),
  "endpoints.siteUrlOrigin must not be a raw IPv4 address"
);

assertRejects(
  "CGNAT site origin",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      siteUrlOrigin: "https://100.64.0.1",
    },
  }),
  "endpoints.siteUrlOrigin must not be a raw IPv4 address, including private/link-local/CGNAT literals"
);

assertRejects(
  "raw public IPv6 site origin",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      siteUrlOrigin: "https://[2606:4700:4700::1111]",
    },
  }),
  "endpoints.siteUrlOrigin must not be a raw IPv6 address"
);

assertRejects(
  "wrong Google callback path",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      googleCallbackUrl: "https://prod-a.convex.site/api/auth/callback/github",
    },
  }),
  "endpoints.googleCallbackUrl must use /api/auth/callback/google"
);

assertRejects(
  "default-port Google callback",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      googleCallbackUrl: "https://prod-a.convex.site:443/api/auth/callback/google",
    },
  }),
  "endpoints.googleCallbackUrl must be a clean endpoint URL"
);

assertRejects(
  "default-port Polar webhook",
  validEvidence({
    endpoints: {
      ...validEvidence().endpoints,
      polarWebhookUrl: "https://prod-a.convex.site:443/polar/events",
    },
  }),
  "endpoints.polarWebhookUrl must be a clean endpoint URL"
);

assertRejects(
  "not production ready",
  validEvidence({ productionReady: false }),
  "productionReady must be true"
);

console.log("production evidence validator import tests passed");
