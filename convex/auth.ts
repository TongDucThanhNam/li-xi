import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import {
  normalizeOwnerUsername,
  validateOwnerUsername,
  validatePin,
} from "../lib/lixiPolicy";
import { createPinHash, verifyPinHash } from "./security";

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

    return { userId, username };
  },
});

export const login = mutation({
  args: {
    username: v.string(),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
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

    if (!hasHashedPin(user)) {
      const { hash, salt } = await createPinHash(pin);
      patchPayload.pinHash = hash;
      patchPayload.pinSalt = salt;
    }

    if (Object.keys(patchPayload).length > 0) {
      await ctx.db.patch(user._id, patchPayload);
    }

    return {
      userId: user._id,
      username: user.username,
    };
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }
    return {
      _id: user._id,
      username: user.username,
      createdAt: user.createdAt,
    };
  },
});
