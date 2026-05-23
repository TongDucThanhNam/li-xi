import Google from "@auth/core/providers/google";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, MutationCtx, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import {
  normalizeOwnerUsername,
  validateOwnerUsername,
  validatePin,
} from "../lib/lixiPolicy";
import { isLegacyAccountAuthEnabled, isLegacyOwnerBridgeEnabled } from "./authorization";
import {
  displayNameFromUser,
  ensureHostProfileForOwner,
  getHostProfileForOwner,
} from "./hostProfiles";
import { createPinHash, verifyPinHash } from "./security";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
});

type MaybeLegacyUser = Doc<"users"> & {
  pin?: unknown;
  pinHash?: unknown;
  pinSalt?: unknown;
  usernameNormalized?: unknown;
};

function hasHashedPin(user: MaybeLegacyUser): user is MaybeLegacyUser & { pinHash: string; pinSalt: string } {
  return typeof user.pinHash === "string" && typeof user.pinSalt === "string";
}

function getLegacyPin(user: MaybeLegacyUser) {
  return typeof user.pin === "string" ? user.pin : null;
}

function assertLegacyAccountAuthEnabled() {
  if (isLegacyAccountAuthEnabled() && isLegacyOwnerBridgeEnabled()) {
    return;
  }

  throw new Error(
    "Legacy username/PIN account auth chỉ bật khi cả account auth và owner bridge migration được cấu hình. Vui lòng đăng nhập bằng Google."
  );
}

function getDisplayName(user: Doc<"users">) {
  return displayNameFromUser(user);
}

async function findUserForAuth(ctx: MutationCtx, username: string, usernameNormalized: string) {
  const normalizedUser = await ctx.db
    .query("users")
    .withIndex("by_username_normalized", (q) => q.eq("usernameNormalized", usernameNormalized))
    .first();

  if (normalizedUser) {
    return normalizedUser as MaybeLegacyUser;
  }

  const exactLegacyUser = await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("username", username))
    .first();

  return (exactLegacyUser as MaybeLegacyUser | null) ?? null;
}

export const register = mutation({
  args: {
    username: v.string(),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    assertLegacyAccountAuthEnabled();

    const username = validateOwnerUsername(args.username);
    const pin = validatePin(args.pin);
    const usernameNormalized = normalizeOwnerUsername(username);

    const existingUser = await findUserForAuth(ctx, username, usernameNormalized);

    if (existingUser) {
      throw new Error("Tên đăng nhập đã tồn tại");
    }

    const { hash, salt } = await createPinHash(pin);
    const userId = await ctx.db.insert("users", {
      username,
      usernameNormalized,
      pinHash: hash,
      pinSalt: salt,
      createdAt: Date.now(),
    });
    const user = await ctx.db.get(userId);
    if (user) {
      await ensureHostProfileForOwner(ctx, user, { displayName: username });
    }

    return { userId, username };
  },
});

export const login = mutation({
  args: {
    username: v.string(),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    assertLegacyAccountAuthEnabled();

    const username = validateOwnerUsername(args.username);
    const pin = validatePin(args.pin);
    const usernameNormalized = normalizeOwnerUsername(username);

    const user = await findUserForAuth(ctx, username, usernameNormalized);

    if (!user) {
      throw new Error("Tên đăng nhập hoặc mật khẩu không đúng");
    }

    const pinMatches = hasHashedPin(user)
      ? await verifyPinHash(pin, user.pinSalt, user.pinHash)
      : getLegacyPin(user) === pin;

    if (!pinMatches) {
      throw new Error("Tên đăng nhập hoặc mật khẩu không đúng");
    }

    const patchPayload: Partial<Doc<"users">> = {};
    if (user.usernameNormalized !== usernameNormalized) {
      patchPayload.usernameNormalized = usernameNormalized;
    }
    if (typeof user.createdAt !== "number") {
      patchPayload.createdAt = Date.now();
    }

    if (!hasHashedPin(user)) {
      const { hash, salt } = await createPinHash(pin);
      patchPayload.pinHash = hash;
      patchPayload.pinSalt = salt;
    }

    if (Object.keys(patchPayload).length > 0) {
      await ctx.db.patch(user._id, patchPayload);
    }
    const profile = await ensureHostProfileForOwner(ctx, user, {
      displayName: getDisplayName(user),
    });

    return {
      userId: user._id,
      username: profile.displayName,
    };
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    const profile = await getHostProfileForOwner(ctx, user._id);
    const displayName = profile?.displayName ?? getDisplayName(user);

    return {
      username: displayName,
      hostProfile: {
        displayName,
        slug: profile?.slug ?? null,
        defaultCampaignId: profile?.defaultCampaignId ?? null,
        onboardingCompleted: profile?.onboardingCompleted ?? false,
      },
      hasHostPin: hasHashedPin(user),
    };
  },
});

export const getCurrentBillingIdentity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    return {
      userId: user._id,
      email: user.email ?? null,
    };
  },
});

export const ensureCurrentHostProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Cần đăng nhập Google để khởi tạo hồ sơ host");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Không tìm thấy tài khoản host");
    }

    const profile = await ensureHostProfileForOwner(ctx, user);
    return {
      hostProfile: {
        displayName: profile.displayName,
        slug: profile.slug,
        defaultCampaignId: profile.defaultCampaignId ?? null,
        onboardingCompleted: profile.onboardingCompleted,
      },
      hasHostPin: hasHashedPin(user),
    };
  },
});

export const setHostPin = mutation({
  args: {
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Cần đăng nhập để thiết lập PIN host");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Không tìm thấy tài khoản host");
    }

    const pin = validatePin(args.pin);
    const { hash, salt } = await createPinHash(pin);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      pinHash: hash,
      pinSalt: salt,
      createdAt: user.createdAt ?? now,
    });
    const profile = await ensureHostProfileForOwner(ctx, user);

    return {
      hostProfile: {
        displayName: profile.displayName,
        slug: profile.slug,
        defaultCampaignId: profile.defaultCampaignId ?? null,
        onboardingCompleted: profile.onboardingCompleted,
      },
      hasHostPin: true,
    };
  },
});
