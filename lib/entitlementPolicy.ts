export type PlanTier = "free" | "pro" | "business";

export type PolarProductConfig = {
  pro: string;
  business: string;
};

export type PolarSubscriptionSnapshot = {
  status: string;
  productId: string;
} | null;

const entitlingPolarStatuses = new Set(["active", "trialing"]);
const placeholderPolarTokenValues = new Set([
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

function hasProductionPolarTokenShape(value: string | undefined) {
  const token = value?.trim();
  return Boolean(
    token &&
      token.length >= 32 &&
      !/\s/.test(token) &&
      !/[<>]/.test(token) &&
      !placeholderPolarTokenValues.has(token.toLowerCase())
  );
}

function hasConfiguredPolarProductId(value: string | undefined) {
  const productId = value?.trim();
  return Boolean(productId && !/\s/.test(productId) && !/[<>]/.test(productId));
}

export function normalizePlanTier(value: string | undefined): PlanTier {
  if (value === "pro" || value === "business") {
    return value;
  }
  return "free";
}

export function isPaidPlanFallbackEnabled(env: NodeJS.ProcessEnv) {
  return (
    env.LI_XI_ENABLE_PAID_PLAN_FALLBACK === "true" ||
    env.LIXI_ENABLE_PAID_PLAN_FALLBACK === "true"
  );
}

export function configuredFallbackTier(env: NodeJS.ProcessEnv): PlanTier {
  return normalizePlanTier(env.LI_XI_DEFAULT_PLAN ?? env.LIXI_DEFAULT_PLAN);
}

export function resolveFallbackTier(env: NodeJS.ProcessEnv): PlanTier {
  const fallbackTier = configuredFallbackTier(env);
  if (fallbackTier !== "free" && !isPaidPlanFallbackEnabled(env)) {
    return "free";
  }

  return fallbackTier;
}

export function configuredTierForProduct(
  productId: string | undefined,
  products: PolarProductConfig
): PlanTier | null {
  const normalizedProductId = productId?.trim();
  const normalizedProProductId = hasConfiguredPolarProductId(products.pro)
    ? products.pro.trim()
    : "";
  const normalizedBusinessProductId = hasConfiguredPolarProductId(products.business)
    ? products.business.trim()
    : "";
  const matchingConfiguredTiers: PlanTier[] = [];
  if (normalizedProductId && normalizedProProductId && normalizedProductId === normalizedProProductId) {
    matchingConfiguredTiers.push("pro");
  }
  if (
    normalizedProductId &&
    normalizedBusinessProductId &&
    normalizedProductId === normalizedBusinessProductId
  ) {
    matchingConfiguredTiers.push("business");
  }

  return matchingConfiguredTiers.length === 1 ? matchingConfiguredTiers[0] : null;
}

export function isBillingPlanMappingConfigured(
  env: NodeJS.ProcessEnv,
  products: PolarProductConfig
) {
  return Boolean(
    hasProductionPolarTokenShape(env.POLAR_ORGANIZATION_TOKEN) &&
      hasConfiguredPolarProductId(products.pro) &&
      hasConfiguredPolarProductId(products.business) &&
      products.pro.trim() !== products.business.trim()
  );
}

export function hasEntitlingPolarStatus(subscription: NonNullable<PolarSubscriptionSnapshot>) {
  return entitlingPolarStatuses.has(subscription.status.toLowerCase());
}

export function resolvePolarTier(
  subscription: PolarSubscriptionSnapshot,
  products: PolarProductConfig
): PlanTier | null {
  if (!subscription) {
    return null;
  }
  if (!hasEntitlingPolarStatus(subscription)) {
    return null;
  }

  return configuredTierForProduct(subscription.productId, products);
}
