import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ConvexCtx = QueryCtx | MutationCtx;

export async function listOwnerBudgetsForScope(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
) {
  return ctx.db
    .query("ownerBudgets")
    .withIndex("by_owner_campaign", (q) =>
      q.eq("ownerId", ownerId).eq("campaignId", campaignId)
    )
    .collect();
}

export function getUniqueOwnerBudget(
  budgets: Doc<"ownerBudgets">[],
  message = "Dữ liệu ngân sách bị trùng, vui lòng chạy maintenance trước"
) {
  if (budgets.length > 1) {
    throw new Error(message);
  }
  return budgets[0] ?? null;
}

export async function getUniqueOwnerBudgetForScope(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">,
  duplicateMessage?: string
) {
  return getUniqueOwnerBudget(
    await listOwnerBudgetsForScope(ctx, ownerId, campaignId),
    duplicateMessage
  );
}

export async function getCompletedOwnerBudgetForScope(
  ctx: ConvexCtx,
  ownerId: Id<"users">,
  campaignId?: Id<"campaigns">
) {
  const budget = await getUniqueOwnerBudgetForScope(ctx, ownerId, campaignId);
  if (!budget || !budget.isSetupCompleted) {
    throw new Error("Host chưa hoàn tất cấu hình ngân sách");
  }
  return budget;
}
