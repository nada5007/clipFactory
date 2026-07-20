import { describe, expect, it } from "vitest";

import { buildScriptPrompt } from "@/lib/clients/anthropic";

describe("buildScriptPrompt", () => {
  it("주제/길이/이미지 프롬프트 수를 사용자 메시지에 포함한다", () => {
    const { user } = buildScriptPrompt({
      topic: "혈관 건강에 대한 쇼츠",
      durationSeconds: 45,
      imagePromptCount: 6,
    });

    expect(user).toContain("혈관 건강에 대한 쇼츠");
    expect(user).toContain("45초");
    expect(user).toContain("정확히 6개");
  });

  it("channelPrompt가 없으면 시스템 프롬프트에 채널 지침 줄이 없다", () => {
    const { system } = buildScriptPrompt({
      topic: "주제",
      durationSeconds: 60,
      imagePromptCount: 8,
    });

    expect(system).not.toContain("채널 기본 톤/스타일 지침");
  });

  it("channelPrompt가 있으면 시스템 프롬프트에 포함된다", () => {
    const { system } = buildScriptPrompt({
      topic: "주제",
      durationSeconds: 60,
      imagePromptCount: 8,
      channelPrompt: "차분하고 신뢰감 있는 톤",
    });

    expect(system).toContain("차분하고 신뢰감 있는 톤");
  });

  it("이미지 프롬프트는 영어로 작성하도록 지시한다", () => {
    const { system } = buildScriptPrompt({
      topic: "주제",
      durationSeconds: 60,
      imagePromptCount: 8,
    });

    expect(system).toContain("영어로 작성");
  });
});
