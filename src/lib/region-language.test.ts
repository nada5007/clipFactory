import { describe, expect, it } from "vitest";

import { resolveRegionLanguage, resolveTranslateTargetLabel } from "@/lib/region-language";

describe("resolveRegionLanguage", () => {
  it("국가 코드를 relevanceLanguage와 언어 라벨로 매핑한다", () => {
    expect(resolveRegionLanguage("US")).toEqual({ relevanceLanguage: "en", languageLabel: "영어" });
    expect(resolveRegionLanguage("JP")).toEqual({ relevanceLanguage: "ja", languageLabel: "일본어" });
    expect(resolveRegionLanguage("KR")).toEqual({ relevanceLanguage: "ko", languageLabel: "한국어" });
  });

  it("소문자 코드도 처리한다", () => {
    expect(resolveRegionLanguage("de")?.relevanceLanguage).toBe("de");
  });

  it("모르는/빈 코드는 undefined를 반환한다", () => {
    expect(resolveRegionLanguage("ZZ")).toBeUndefined();
    expect(resolveRegionLanguage(undefined)).toBeUndefined();
  });
});

describe("resolveTranslateTargetLabel", () => {
  it("비KR 국가는 그 국가 언어 라벨을 반환한다", () => {
    expect(resolveTranslateTargetLabel("US")).toBe("영어");
    expect(resolveTranslateTargetLabel("VN")).toBe("베트남어");
  });

  it("KR이거나 매핑이 없으면 undefined(번역 불필요)", () => {
    expect(resolveTranslateTargetLabel("KR")).toBeUndefined();
    expect(resolveTranslateTargetLabel("kr")).toBeUndefined();
    expect(resolveTranslateTargetLabel(undefined)).toBeUndefined();
    expect(resolveTranslateTargetLabel("ZZ")).toBeUndefined();
  });
});
