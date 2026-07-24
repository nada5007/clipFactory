import { describe, expect, it } from "vitest";

import {
  ALL_REGION_CODES,
  LANGUAGE_OPTIONS,
  REGION_GROUPS,
} from "@/lib/source-discovery-options";

describe("source-discovery-options", () => {
  it("지역 코드는 그룹 간에 중복되지 않는다", () => {
    expect(new Set(ALL_REGION_CODES).size).toBe(ALL_REGION_CODES.length);
  });

  it("지역 그룹은 7개다", () => {
    expect(REGION_GROUPS).toHaveLength(7);
  });

  it("언어 코드는 중복되지 않는다", () => {
    const codes = LANGUAGE_OPTIONS.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("언어 옵션은 15개다", () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(15);
  });
});
