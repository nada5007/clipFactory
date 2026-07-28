import { describe, expect, it } from "vitest";

import { getLlmModelOption, LLM_MODEL_OPTIONS } from "@/lib/llm-models";

describe("getLlmModelOption", () => {
  it("등록된 모델 ID로 옵션을 조회한다", () => {
    const option = getLlmModelOption("claude-sonnet-5");
    expect(option.provider).toBe("anthropic");
  });

  it("알 수 없는 모델 ID는 에러를 던진다", () => {
    expect(() => getLlmModelOption("no-such-model")).toThrow("알 수 없는 LLM 모델");
  });

  it("모든 프로바이더가 최소 하나 이상의 모델을 갖는다", () => {
    const providers = new Set(LLM_MODEL_OPTIONS.map((m) => m.provider));
    expect(providers).toEqual(new Set(["anthropic", "openai", "xai", "google"]));
  });
});
