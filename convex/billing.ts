import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, query, type ActionCtx } from "./_generated/server";
import { polar, polarProducts } from "./polarClient";
import {
  assertCompleteBillingProductConfiguration,
  assertConfiguredBillingProductId,
  assertConfiguredCheckoutProductIds,
  assertTrustedBillingOrigin,
  assertTrustedBillingUrl,
  assertTrustedPolarCheckoutUrl,
  configuredBillingProductIds,
  getDefaultBillingReturnUrl,
  normalizeBillingLocale,
} from "../lib/billingPolicy";
import { hasProductionSecretShape, timingSafeEqual } from "../lib/secretPolicy";

const BILLING_PORTAL_STATUSES = new Set(["active", "trialing", "past_due", "canceled"]);
const CHANGEABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
const CHECKOUT_BLOCKING_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

export const getConfiguredProducts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Cần đăng nhập để xem gói Polar");
    }

    try {
      assertCompleteBillingProductConfiguration(polarProducts);
    } catch {
      return {
        pro: null,
        business: null,
      };
    }

    const products = await polar.listProducts(ctx);
    const pro = products.find((product) => product.id === polarProducts.pro) ?? null;
    const business = products.find((product) => product.id === polarProducts.business) ?? null;
    if (!pro || !business) {
      return {
        pro: null,
        business: null,
      };
    }

    return {
      pro,
      business,
    };
  },
});

async function getBillingIdentity(ctx: Pick<ActionCtx, "runQuery">) {
  const user = await ctx.runQuery(internal.auth.getCurrentBillingIdentity);
  if (!user) {
    throw new Error("Cần đăng nhập để dùng billing");
  }
  if (!user.email) {
    throw new Error("Tài khoản cần email để dùng billing");
  }

  return {
    userId: user.userId,
    email: user.email,
  };
}

async function getCurrentPolarSubscription(ctx: ActionCtx, userId: string) {
  return polar.getCurrentSubscription(ctx, { userId });
}

function hasCheckoutBlockingSubscription(
  subscription: Awaited<ReturnType<typeof getCurrentPolarSubscription>>
) {
  return Boolean(
    subscription && CHECKOUT_BLOCKING_SUBSCRIPTION_STATUSES.has(subscription.status.toLowerCase())
  );
}

function hasBillingPortalSubscription(
  subscription: Awaited<ReturnType<typeof getCurrentPolarSubscription>>
) {
  return Boolean(subscription && BILLING_PORTAL_STATUSES.has(subscription.status.toLowerCase()));
}

function hasChangeableSubscription(
  subscription: Awaited<ReturnType<typeof getCurrentPolarSubscription>>
) {
  return Boolean(subscription && CHANGEABLE_SUBSCRIPTION_STATUSES.has(subscription.status.toLowerCase()));
}

async function requireSyncedConfiguredBillingProducts(ctx: ActionCtx) {
  assertCompleteBillingProductConfiguration(polarProducts);
  const syncedProducts = await polar.listProducts(ctx);
  const syncedProductIds = new Set(syncedProducts.map((product) => product.id));
  for (const productId of configuredBillingProductIds(polarProducts)) {
    if (!syncedProductIds.has(productId)) {
      throw new Error("Polar product chưa được sync vào Convex");
    }
  }
}

export const changeCurrentSubscription = action({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await getBillingIdentity(ctx);
    const productId = assertConfiguredBillingProductId(args.productId, polarProducts);
    const subscription = await getCurrentPolarSubscription(ctx, userId);
    if (!subscription || !hasChangeableSubscription(subscription)) {
      throw new Error("Không tìm thấy subscription Polar đang hoạt động để đổi gói");
    }
    if (subscription.productId === productId) {
      throw new Error("Subscription Polar đã dùng gói này");
    }
    await requireSyncedConfiguredBillingProducts(ctx);

    await polar.changeSubscription(ctx, {
      productId,
    });
  },
});

export const generateCheckoutLink = action({
  args: {
    productIds: v.array(v.string()),
    origin: v.string(),
    successUrl: v.string(),
    locale: v.optional(v.string()),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const productIds = assertConfiguredCheckoutProductIds(args.productIds, polarProducts);
    const origin = assertTrustedBillingOrigin(args.origin, process.env.SITE_URL);
    const successUrl = assertTrustedBillingUrl(
      args.successUrl,
      "Billing successUrl",
      process.env.SITE_URL
    );
    const locale = normalizeBillingLocale(args.locale);
    const { userId, email } = await getBillingIdentity(ctx);
    const subscription = await getCurrentPolarSubscription(ctx, userId);
    if (hasCheckoutBlockingSubscription(subscription)) {
      throw new Error("Tài khoản đã có subscription Polar, hãy đổi gói hoặc mở portal");
    }
    await requireSyncedConfiguredBillingProducts(ctx);
    const { url: baseUrl } = await polar.createCheckoutSession(ctx, {
      productIds,
      userId,
      email,
      origin,
      successUrl,
    });
    const checkoutUrl = new URL(assertTrustedPolarCheckoutUrl(baseUrl));

    if (!locale) {
      return { url: checkoutUrl.toString() };
    }

    checkoutUrl.searchParams.set("locale", locale);
    return { url: checkoutUrl.toString() };
  },
});

export const generateCustomerPortalUrl = action({
  args: {
    returnUrl: v.optional(v.string()),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const { userId } = await getBillingIdentity(ctx);
    const subscription = await getCurrentPolarSubscription(ctx, userId);
    if (!hasBillingPortalSubscription(subscription)) {
      throw new Error("Không tìm thấy subscription Polar để mở portal");
    }
    const returnUrl = args.returnUrl
      ? assertTrustedBillingUrl(args.returnUrl, "Billing returnUrl", process.env.SITE_URL)
      : getDefaultBillingReturnUrl(process.env.SITE_URL);
    const { url } = await polar.createCustomerPortalSession(ctx, {
      userId,
      returnUrl,
    });

    return { url };
  },
});

export const syncPolarProducts = action({
  args: {
    adminToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedToken =
      process.env.LI_XI_BILLING_ADMIN_TOKEN?.trim() ||
      process.env.LIXI_BILLING_ADMIN_TOKEN?.trim() ||
      "";
    if (!expectedToken) {
      throw new Error("Thiếu LI_XI_BILLING_ADMIN_TOKEN hoặc LIXI_BILLING_ADMIN_TOKEN để sync Polar products");
    }
    if (!hasProductionSecretShape(expectedToken)) {
      throw new Error("LI_XI_BILLING_ADMIN_TOKEN / LIXI_BILLING_ADMIN_TOKEN phải là secret production dài, không phải placeholder");
    }
    if (!timingSafeEqual(args.adminToken?.trim(), expectedToken)) {
      throw new Error("Token quản trị billing không hợp lệ");
    }

    await polar.syncProducts(ctx);
    return { success: true };
  },
});
