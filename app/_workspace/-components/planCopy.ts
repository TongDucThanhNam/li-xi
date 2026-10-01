import type { PlanLimitKey } from "@/lib/planLimits";

export const PLAN_TIER_NAMES = { free: "Miễn phí", pro: "Pro", business: "Business" } as const;
export const PLAN_RESOURCE_LABELS: Record<PlanLimitKey, string> = {
  campaigns: "Chiến dịch",
  games: "Trò chơi",
  assets: "Tài sản tải lên",
  redemptions: "Lượt trao thưởng",
  openSessions: "Lượt chơi đang mở",
  budgetItems: "Mệnh giá ngân sách",
};
