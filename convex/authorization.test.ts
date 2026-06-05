import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { requireResolvedOwner, verifyAuthOwner } from "./authorization";
import { modules } from "./test.setup";

describe("authorization policy (runtime)", () => {
  test("requireResolvedOwner rejects unauthenticated request when no ownerId provided", async () => {
    const t = convexTest(schema, modules);
    await expect(async () => {
      await t.mutation(async (ctx) => {
        await requireResolvedOwner(ctx);
      });
    }).rejects.toThrowError("Cần đăng nhập để tiếp tục");
  });

  test("requireResolvedOwner rejects unauthenticated request when client provides ownerId (legacy prevention)", async () => {
    const t = convexTest(schema, modules);
    
    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Host 1" });
    });

    await expect(async () => {
      await t.mutation(async (ctx) => {
        await requireResolvedOwner(ctx, ownerId);
      });
    }).rejects.toThrowError("Client ownerId không được dùng để xác thực");
  });

  test("verifyAuthOwner rejects unauthenticated request", async () => {
    const t = convexTest(schema, modules);
    
    const ownerId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Host 2" });
    });

    await expect(async () => {
      await t.mutation(async (ctx) => {
        await verifyAuthOwner(ctx, ownerId);
      });
    }).rejects.toThrowError("Cần đăng nhập để tiếp tục");
  });
});
