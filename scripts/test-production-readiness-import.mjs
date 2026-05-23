#!/usr/bin/env node

import {
  buildEvidence,
  configuredOpsAdminToken,
  deriveExpectedBackendEndpoints,
  evaluateCrossRuntimeReadiness,
  evaluateFrontendReadiness,
  isConvexCloudDeploymentOrigin,
  isConvexSiteDeploymentOrigin,
  hasProductionSecretShape,
  isProductionReady,
  isPublicHttpsOriginUrl,
} from "./verify-production-readiness.mjs";

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const frontendEnv = {
  VITE_CONVEX_URL: "https://prod-a.convex.cloud",
  VITE_SITE_URL: "https://app.example.com",
  VITE_LI_XI_ENABLE_LEGACY_AUTH: undefined,
  VITE_ENABLE_LEGACY_AUTH: undefined,
  VITE_LI_XI_ENABLE_LEGACY_OWNER_BRIDGE: undefined,
  VITE_LEGACY_OWNER_BRIDGE_ENABLED: undefined,
};

const backendReadiness = {
  allRequiredReady: true,
  missingRequired: [],
  missingRuntimeRequired: [],
  checkedAt: Date.now(),
  accessSource: "adminToken",
  endpoints: {
    convexSiteOrigin: "https://prod-a.convex.site",
    siteUrlOrigin: "https://app.example.com",
    googleCallbackUrl: "https://prod-a.convex.site/api/auth/callback/google",
    polarWebhookUrl: "https://prod-a.convex.site/polar/events",
  },
  runtimeChecks: {
    oauth: [{ key: "siteUrlHttps", label: "SITE_URL", required: true, ready: true, status: "ready" }],
  },
};

assert(isConvexCloudDeploymentOrigin("https://prod-a.convex.cloud"), "Convex cloud origin should be accepted");
assert(!isConvexCloudDeploymentOrigin("https://prod-a.convex.site"), "Convex site origin should not be accepted as cloud API URL");
assert(isConvexSiteDeploymentOrigin("https://prod-a.convex.site"), "Convex site origin should be accepted");
assert(!isPublicHttpsOriginUrl("https://127.0.0.1"), "private public site origins should be rejected");
assert(
  hasProductionSecretShape("prod_ops_admin_token_0123456789abcd", 32),
  "production-safe ops admin token should pass secret-shape validation"
);
assert(
  !hasProductionSecretShape("raw-secret", 32) &&
    !hasProductionSecretShape("placeholder", 32) &&
    !hasProductionSecretShape("prod ops admin token 0123456789", 32),
  "weak ops admin tokens should fail secret-shape validation"
);

withEnv(
  {
    LI_XI_OPS_ADMIN_TOKEN: undefined,
    LIXI_OPS_ADMIN_TOKEN: " alias_ops_admin_token_0123456789abcd ",
  },
  () => {
    assert(
      configuredOpsAdminToken() === "alias_ops_admin_token_0123456789abcd",
      "production readiness should accept LIXI_OPS_ADMIN_TOKEN as an ops token alias"
    );
  }
);

withEnv(
  {
    LI_XI_OPS_ADMIN_TOKEN: " canonical_ops_admin_token_0123456789abcd ",
    LIXI_OPS_ADMIN_TOKEN: "alias_ops_admin_token_0123456789abcd",
  },
  () => {
    assert(
      configuredOpsAdminToken() === "canonical_ops_admin_token_0123456789abcd",
      "production readiness should prefer LI_XI_OPS_ADMIN_TOKEN when both ops token envs are present"
    );
  }
);

const expectedEndpoints = deriveExpectedBackendEndpoints("https://prod-a.convex.site");
assert(
  expectedEndpoints.googleCallbackUrl === "https://prod-a.convex.site/api/auth/callback/google",
  "Google callback endpoint should derive from Convex site origin"
);
assert(
  expectedEndpoints.polarWebhookUrl === "https://prod-a.convex.site/polar/events",
  "Polar webhook endpoint should derive from Convex site origin"
);

const frontendReadiness = withEnv(frontendEnv, evaluateFrontendReadiness);
const crossRuntimeReadiness = withEnv(frontendEnv, () =>
  evaluateCrossRuntimeReadiness(backendReadiness)
);
assert(frontendReadiness.allRequiredReady, "frontend readiness should pass for clean production env");
assert(crossRuntimeReadiness.allRequiredReady, "cross-runtime readiness should pass for matching origins");
assert(
  isProductionReady(backendReadiness, frontendReadiness, crossRuntimeReadiness),
  "overall production readiness should pass only when backend, frontend, and cross-runtime checks pass"
);

const mismatchedCrossRuntime = withEnv(
  { ...frontendEnv, VITE_CONVEX_URL: "https://prod-b.convex.cloud" },
  () => evaluateCrossRuntimeReadiness(backendReadiness)
);
assert(
  mismatchedCrossRuntime.missingRuntimeRequired.includes(
    "deployment.frontendBackendConvexDeploymentMatch"
  ),
  "mismatched Convex deployments should fail cross-runtime readiness"
);

const evidence = withEnv(frontendEnv, () => buildEvidence(backendReadiness, frontendReadiness));
assert(evidence.productionReady, "evidence should mark the matching deployment production-ready");
assert(evidence.redaction.mode === "audit-safe", "evidence should remain audit-safe");
assert(
  !JSON.stringify(evidence).includes('"configuredName":') &&
    !JSON.stringify(evidence).includes('"acceptedNames":') &&
    !JSON.stringify(evidence).includes('"detail":'),
  "evidence should omit env metadata and verbose runtime details"
);

console.log("production readiness import tests passed");
