import { describe, expect, it } from "vitest";

import { buildImagePrompt, resolveImageSize } from "@/lib/clients/image";

describe("resolveImageSize", () => {
  it("SHORT는 세로(9:16) 사이즈를 반환한다", () => {
    expect(resolveImageSize("SHORT")).toBe("1024x1536");
  });

  it("LONG은 가로(16:9) 사이즈를 반환한다", () => {
    expect(resolveImageSize("LONG")).toBe("1536x1024");
  });
});

describe("buildImagePrompt", () => {
  it("채널 프롬프트가 없으면 장면 프롬프트만 반환한다", () => {
    expect(buildImagePrompt("a cat sitting on a chair")).toBe("a cat sitting on a chair");
  });

  it("채널 프롬프트가 있으면 앞에 붙인다", () => {
    expect(buildImagePrompt("a cat sitting on a chair", "cozy cinematic lighting")).toBe(
      "cozy cinematic lighting. a cat sitting on a chair",
    );
  });
});
