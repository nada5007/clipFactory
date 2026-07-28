import { describe, expect, it } from "vitest";

import { getImageModelOption, IMAGE_MODEL_OPTIONS } from "@/lib/image-models";

describe("getImageModelOption", () => {
  it("등록된 키로 옵션을 조회한다", () => {
    const option = getImageModelOption("nanobanana-pro");
    expect(option.provider).toBe("google");
  });

  it("알 수 없는 키는 에러를 던진다", () => {
    expect(() => getImageModelOption("no-such-key")).toThrow("알 수 없는 이미지 모델");
  });

  it("OpenAI는 품질 티어 3단계를 갖는다", () => {
    const openaiOptions = IMAGE_MODEL_OPTIONS.filter((m) => m.provider === "openai");
    expect(openaiOptions.map((m) => m.quality)).toEqual(["low", "medium", "high"]);
  });

  it("Google Nano Banana 계열은 3개 티어이며 각각 최대 입력 이미지 개수를 갖는다", () => {
    const googleOptions = IMAGE_MODEL_OPTIONS.filter((m) => m.provider === "google");
    expect(googleOptions).toHaveLength(3);
    expect(googleOptions.map((m) => m.maxInputImages)).toEqual([3, 5, 5]);
  });
});
