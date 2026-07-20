import { describe, expect, it } from "vitest";

import { resolveProjectDefaults } from "@/lib/project-defaults";

describe("resolveProjectDefaults", () => {
  const channel = {
    videoFormat: "SHORT" as const,
    defaultSettings: { scriptPrompt: "채널 기본 프롬프트" },
  };

  it("override가 없으면 채널의 videoFormat을 상속한다", () => {
    const result = resolveProjectDefaults(channel, {});
    expect(result.videoFormat).toBe("SHORT");
  });

  it("override가 있으면 그 값을 우선한다", () => {
    const result = resolveProjectDefaults(channel, { videoFormat: "LONG" });
    expect(result.videoFormat).toBe("LONG");
  });

  it("채널의 defaultSettings를 그대로 복사(스냅샷)한다", () => {
    const result = resolveProjectDefaults(channel, {});
    expect(result.settings).toEqual({ scriptPrompt: "채널 기본 프롬프트" });
  });

  it("defaultSettings가 없으면 빈 객체로 대체한다", () => {
    const result = resolveProjectDefaults({ videoFormat: "SHORT", defaultSettings: null }, {});
    expect(result.settings).toEqual({});
  });
});
