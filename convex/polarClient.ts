import { Polar } from "@convex-dev/polar";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { normalizeConfiguredPolarServer, resolvePolarServer } from "../lib/polarServerPolicy";

function configuredPolarProductId(primaryName: string, legacyName: string) {
  return (process.env[primaryName] ?? process.env[legacyName] ?? "").trim();
}

export const polarProducts = {
  pro: configuredPolarProductId("POLAR_PRO_PRODUCT_ID", "LI_XI_POLAR_PRO_PRODUCT_ID"),
  business: configuredPolarProductId(
    "POLAR_BUSINESS_PRODUCT_ID",
    "LI_XI_POLAR_BUSINESS_PRODUCT_ID"
  ),
} as const;

export const polarWebhookPath = "/polar/events";

export function configuredPolarServer() {
  return normalizeConfiguredPolarServer(process.env.POLAR_SERVER);
}

export function resolvedPolarServer(): "sandbox" | "production" {
  return resolvePolarServer(process.env.POLAR_SERVER);
}

export function configuredPolarWebhookSecret() {
  return process.env.POLAR_WEBHOOK_SECRET?.trim() ?? "";
}

export const polar = new Polar<DataModel, typeof polarProducts>(components.polar, {
  products: polarProducts,
  server: resolvedPolarServer(),
  webhookSecret: configuredPolarWebhookSecret(),
  getUserInfo: async (ctx): Promise<{ userId: string; email: string }> => {
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
  },
});
