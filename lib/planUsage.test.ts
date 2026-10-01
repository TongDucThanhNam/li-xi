import { describe, expect, test } from "vitest";
import type { PlanResources } from "./planUsage";
import { PLAN_RESOURCE_ORDER, tightestResource, usageLevel, usagePercent } from "./planUsage";

function resource(used: number, limit: number | null, overrides: Partial<{ isFull: boolean; isExceeded: boolean }> = {}) {
  return {
    used,
    limit,
    isFull: overrides.isFull ?? (limit !== null && used >= limit),
    isExceeded: overrides.isExceeded ?? (limit !== null && used > limit),
  };
}

describe("usagePercent", () => {
  test("unlimited resource → 0", () => {
    expect(usagePercent(resource(1000, null))).toBe(0);
  });

  test("4/5 → 80", () => {
    expect(usagePercent(resource(4, 5))).toBe(80);
  });

  test("5/5 and 6/5 cap at 100", () => {
    expect(usagePercent(resource(5, 5))).toBe(100);
    expect(usagePercent(resource(6, 5))).toBe(100);
  });
});

describe("usageLevel", () => {
  test("unlimited → ok", () => {
    expect(usageLevel(resource(1000, null))).toBe("ok");
  });

  test("4/5 → near (>= 80%)", () => {
    expect(usageLevel(resource(4, 5))).toBe("near");
    expect(usageLevel(resource(3, 5))).toBe("ok");
  });

  test("5/5 and 6/5 → full", () => {
    expect(usageLevel(resource(5, 5))).toBe("full");
    expect(usageLevel(resource(6, 5))).toBe("full");
    // The server flags drive the verdict, not the ratio alone.
    expect(usageLevel(resource(4, 5, { isFull: true }))).toBe("full");
    expect(usageLevel(resource(4, 5, { isExceeded: true }))).toBe("full");
  });
});

describe("tightestResource", () => {
  test("ignores unlimited and missing keys", () => {
    const resources: PlanResources = {
      campaigns: resource(0, 1),
      redemptions: resource(9999, null),
    };
    expect(tightestResource(resources)).toEqual({ key: "campaigns", resource: resources.campaigns });
  });

  test("returns null when nothing is limited", () => {
    expect(tightestResource({})).toBeNull();
    expect(tightestResource({ games: resource(100, null) })).toBeNull();
  });

  test("prefers the earlier PLAN_RESOURCE_ORDER key on a tie", () => {
    const resources: PlanResources = {
      games: resource(5, 10),
      campaigns: resource(1, 2),
    };
    expect(tightestResource(resources)?.key).toBe("campaigns");
    expect(PLAN_RESOURCE_ORDER.indexOf("campaigns")).toBeLessThan(PLAN_RESOURCE_ORDER.indexOf("games"));
  });

  test("picks the highest used/limit ratio", () => {
    const resources: PlanResources = {
      campaigns: resource(1, 5),
      games: resource(9, 10),
      assets: resource(50, 100),
    };
    expect(tightestResource(resources)?.key).toBe("games");
  });
});
