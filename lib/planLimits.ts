import type { PlanTier } from "./entitlementPolicy";

export type PlanLimitKey = "campaigns" | "assets" | "openSessions" | "budgetItems" | "redemptions" | "games";
export type PlanLimitValue = number | null;
export type PlanLimits = Record<PlanLimitKey, PlanLimitValue>;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    campaigns: 1,
    assets: 5,
    openSessions: 1,
    budgetItems: 50,
    redemptions: 100,
    games: 5,
  },
  pro: {
    campaigns: 10,
    assets: 100,
    openSessions: 10,
    budgetItems: 200,
    redemptions: 5000,
    games: 25,
  },
  business: {
    campaigns: null,
    assets: null,
    openSessions: null,
    budgetItems: 500,
    redemptions: null,
    games: null,
  },
};
