import { describe, expect, it } from "vitest";

import { buildScriptFieldPrompt } from "@/lib/script-fields";

const context = {
  topic: "여름 휴가 꿀팁",
  title: "기존 제목",
  hook: "기존 후킹멘트",
  body: "기존 대본",
  imagePrompts: ["a beach", "a suitcase"],
};

describe("buildScriptFieldPrompt", () => {
  it("지정된 필드만 재생성하도록 지시하고 나머지 필드는 컨텍스트로 포함한다", () => {
    const { system, user } = buildScriptFieldPrompt("title", context);

    expect(system).toContain("제목");
    expect(user).toContain("기존 대본");
    expect(user).toContain("제목만 새로 생성");
  });

  it("커스텀 프롬프트가 있으면 system에 추가 지시사항으로 포함한다", () => {
    const { system } = buildScriptFieldPrompt("hook", context, "이모지 포함");

    expect(system).toContain("이모지 포함");
  });

  it("imagePrompts는 현재 개수를 그대로 유지하도록 지시한다", () => {
    const { user } = buildScriptFieldPrompt("imagePrompts", context);

    expect(user).toContain("정확히 2개");
  });
});
