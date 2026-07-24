import { describe, expect, it } from "vitest";

import { NICHE_CATALOG, QUICK_SURGE_NICHES } from "@/lib/niche-catalog";

describe("niche-catalog", () => {
  it("NICHE_CATALOG에는 중복이 없다", () => {
    expect(new Set(NICHE_CATALOG).size).toBe(NICHE_CATALOG.length);
  });

  it("QUICK_SURGE_NICHES 8종은 모두 NICHE_CATALOG에 포함된다", () => {
    expect(QUICK_SURGE_NICHES).toHaveLength(8);
    for (const niche of QUICK_SURGE_NICHES) {
      expect(NICHE_CATALOG).toContain(niche);
    }
  });
});
