import type { PlanLimitKey } from "./planLimits";

export type PlanResourceState = { used: number; limit: number | null; isFull: boolean; isExceeded: boolean };
export type PlanResources = Partial<Record<PlanLimitKey, PlanResourceState>>;

export const PLAN_RESOURCE_ORDER: PlanLimitKey[] = ["campaigns", "games", "assets", "redemptions", "openSessions", "budgetItems"];

export function usagePercent(resource: PlanResourceState) {
  if (!resource.limit) return 0;
  return Math.min(100, Math.round((resource.used / resource.limit) * 100));
}

export function usageLevel(resource: PlanResourceState): "ok" | "near" | "full" {
  if (resource.limit === null) return "ok";
  if (resource.isFull || resource.isExceeded) return "full";
  return usagePercent(resource) >= 80 ? "near" : "ok";
}

/** The limited resource closest to its limit; ties follow PLAN_RESOURCE_ORDER. */
export function tightestResource(resources: PlanResources) {
  let best: { key: PlanLimitKey; resource: PlanResourceState } | null = null;
  for (const key of PLAN_RESOURCE_ORDER) {
    const resource = resources[key];
    if (!resource || !resource.limit) continue;
    if (!best || resource.used / resource.limit > best.resource.used / (best.resource.limit as number)) {
      best = { key, resource };
    }
  }
  return best;
}
