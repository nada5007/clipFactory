import { describe, expect, it } from "vitest";

import { OPENAI_TTS_MODELS, OPENAI_TTS_VOICES } from "@/lib/voice-models";

describe("voice-models", () => {
  it("gpt-4o-mini-tts는 지시문은 지원하고 숫자 속도는 지원하지 않는다", () => {
    const model = OPENAI_TTS_MODELS.find((m) => m.id === "gpt-4o-mini-tts");
    expect(model?.supportsInstructions).toBe(true);
    expect(model?.supportsSpeed).toBe(false);
  });

  it("tts-1/tts-1-hd는 숫자 속도는 지원하고 지시문은 지원하지 않는다", () => {
    const tts1 = OPENAI_TTS_MODELS.find((m) => m.id === "tts-1");
    const ttsHd = OPENAI_TTS_MODELS.find((m) => m.id === "tts-1-hd");
    expect(tts1?.supportsSpeed).toBe(true);
    expect(tts1?.supportsInstructions).toBe(false);
    expect(ttsHd?.supportsSpeed).toBe(true);
  });

  it("음성 목록에 중복 ID가 없다", () => {
    const ids = OPENAI_TTS_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
