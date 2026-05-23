import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ConvexCtx = QueryCtx | MutationCtx;

export function isLegacyOwnerBridgeEnabled() {
  return (
    process.env.LI_XI_ENABLE_LEGACY_OWNER_BRIDGE === "true" ||
    process.env.LEGACY_OWNER_BRIDGE_ENABLED === "true"
  );
}

export function isLegacyAccountAuthEnabled() {
  return (
    process.env.LI_XI_ENABLE_LEGACY_AUTH === "true" ||
    process.env.LEGACY_AUTH_ENABLED === "true"
  );
}

export async function requireOwner(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  message = "Không tìm thấy host"
): Promise<Doc<"users">> {
  const owner = await ctx.db.get(ownerId);
  if (!owner) {
    throw new Error(message);
  }
  return owner;
}

export async function verifyAuthOwner(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  message = "Bạn không có quyền truy cập tài nguyên này",
  unauthenticatedMessage = "Cần đăng nhập để tiếp tục"
) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) {
    throw new Error(unauthenticatedMessage);
  }
  if (authUserId !== ownerId) {
    throw new Error(message);
  }
  return authUserId;
}

export async function requireResolvedOwner(
  ctx: ConvexCtx,
  requestedOwnerId?: Id<"users">,
  options: {
    notFoundMessage?: string;
    forbiddenMessage?: string;
    unauthenticatedMessage?: string;
  } = {}
) {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId) {
    if (requestedOwnerId && requestedOwnerId !== authUserId) {
      throw new Error(options.forbiddenMessage ?? "Bạn không có quyền truy cập tài nguyên này");
    }
    const owner = await requireOwner(ctx, authUserId, options.notFoundMessage);
    return {
      owner,
      ownerId: authUserId,
      source: "convexAuth" as const,
    };
  }

  if (!requestedOwnerId) {
    throw new Error(options.unauthenticatedMessage ?? "Cần đăng nhập để tiếp tục");
  }

  throw new Error(
    options.unauthenticatedMessage ??
      "Client ownerId không được dùng để xác thực. Vui lòng đăng nhập bằng Google."
  );
}

export async function requireVerifiedOwner(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  options: {
    notFoundMessage?: string;
    forbiddenMessage?: string;
    unauthenticatedMessage?: string;
  } = {}
) {
  const owner = await requireOwner(ctx, ownerId, options.notFoundMessage);
  await verifyAuthOwner(
    ctx,
    ownerId,
    options.forbiddenMessage,
    options.unauthenticatedMessage
  );
  return owner;
}
