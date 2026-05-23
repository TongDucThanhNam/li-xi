#!/usr/bin/env node

import {
  configuredFallbackTier,
  configuredTierForProduct,
  isBillingPlanMappingConfigured,
  resolveFallbackTier,
  resolvePolarTier,
} from "../lib/entitlementPolicy.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

const products = {
  pro: "prod_pro",
  business: "prod_business",
};

assert(configuredTierForProduct("prod_pro", products) === "pro", "Pro product id should map to Pro");
assert(
  configuredTierForProduct("prod_business", products) === "business",
  "Business product id should map to Business"
);
assert(
  configuredTierForProduct("prod_unknown", products) === null,
  "Unknown product id should not grant a paid tier"
);
assert(
  configuredTierForProduct("prod_same", { pro: "prod_same", business: "prod_same" }) === null,
  "Duplicate configured product ids should not grant an ambiguous paid tier"
);
assert(
  configuredTierForProduct(" prod_pro ", { pro: " prod_pro ", business: "prod_business" }) === "pro",
  "Configured product ids should be matched after trimming"
);
assert(
  configuredTierForProduct("prod_bad", { pro: "prod_bad value", business: "prod_business" }) === null,
  "Configured product ids with whitespace should not grant paid entitlements"
);

assert(
  resolvePolarTier({ status: "active", productId: "prod_pro" }, products) === "pro",
  "Active configured Pro subscription should grant Pro"
);
assert(
  resolvePolarTier({ status: "TRIALING", productId: "prod_business" }, products) === "business",
  "Trialing configured Business subscription should grant Business case-insensitively"
);
for (const status of ["past_due", "canceled", "incomplete"]) {
  assert(
    resolvePolarTier({ status, productId: "prod_pro" }, products) === null,
    `${status} subscription should not grant paid entitlements`
  );
}
assert(resolvePolarTier(null, products) === null, "Missing subscription should not grant paid entitlements");

withEnv(
  {
    LI_XI_DEFAULT_PLAN: "business",
    LIXI_DEFAULT_PLAN: undefined,
    LI_XI_ENABLE_PAID_PLAN_FALLBACK: undefined,
    LIXI_ENABLE_PAID_PLAN_FALLBACK: undefined,
  },
  () => {
    assert(configuredFallbackTier(process.env) === "business", "Configured fallback tier should parse env");
    assert(resolveFallbackTier(process.env) === "free", "Paid fallback should be disabled by default");
  }
);

withEnv(
  {
    LI_XI_DEFAULT_PLAN: "business",
    LIXI_DEFAULT_PLAN: undefined,
    LI_XI_ENABLE_PAID_PLAN_FALLBACK: "true",
    LIXI_ENABLE_PAID_PLAN_FALLBACK: undefined,
  },
  () => {
    assert(resolveFallbackTier(process.env) === "business", "Explicit paid fallback override should allow staging fallback tier");
  }
);

withEnv({ POLAR_ORGANIZATION_TOKEN: "pola_123456789012345678901234567890" }, () => {
  assert(
    isBillingPlanMappingConfigured(process.env, products),
    "Billing plan mapping should be configured with production-shaped org token and distinct product ids"
  );
  assert(
    !isBillingPlanMappingConfigured(process.env, { pro: "same", business: "same" }),
    "Billing plan mapping should reject duplicate product ids"
  );
  assert(
    !isBillingPlanMappingConfigured(process.env, { pro: "prod_pro", business: "" }),
    "Billing plan mapping should reject missing product ids"
  );
  assert(
    !isBillingPlanMappingConfigured(process.env, { pro: "prod_pro", business: "   " }),
    "Billing plan mapping should reject blank product ids after trimming"
  );
  assert(
    !isBillingPlanMappingConfigured(process.env, { pro: "prod_pro", business: "prod bad" }),
    "Billing plan mapping should reject product ids with whitespace"
  );
});

withEnv({ POLAR_ORGANIZATION_TOKEN: "token" }, () => {
  assert(
    !isBillingPlanMappingConfigured(process.env, products),
    "Billing plan mapping should reject placeholder Polar organization token"
  );
});

withEnv({ POLAR_ORGANIZATION_TOKEN: undefined }, () => {
  assert(
    !isBillingPlanMappingConfigured(process.env, products),
    "Billing plan mapping should require Polar organization token"
  );
});

console.log("entitlement policy regression tests passed");
