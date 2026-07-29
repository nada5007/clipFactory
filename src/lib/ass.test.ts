import { describe, expect, it } from "vitest";

import { generateAss } from "@/lib/ass";
import { resolveSubtitleStyle } from "@/lib/timeline";

describe("generateAss", () => {
  it("해상도와 큐 개수만큼 Dialogue 라인을 생성한다", () => {
    const style = resolveSubtitleStyle(null, 1080, 1920);
    const ass = generateAss(
      [
        { text: "첫 문장", startMs: 0, endMs: 1500, style },
        { text: "둘째 문장", startMs: 1500, endMs: 3000, style },
      ],
      1080,
      1920,
    );

    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass.match(/^Dialogue:/gm)).toHaveLength(2);
    expect(ass).toContain("0:00:00.00,0:00:01.50");
  });

  it("흰색/검정 hex 색상을 ASS BGR 포맷으로 변환한다", () => {
    const style = resolveSubtitleStyle({ fontColor: "#FFFFFF", backgroundColor: "#000000" }, 1080, 1920);
    const ass = generateAss([{ text: "자막", startMs: 0, endMs: 1000, style }], 1080, 1920);

    expect(ass).toContain("\\c&HFFFFFF&");
    expect(ass).toContain("\\3c&H000000&");
  });

  it("줄바꿈(\\n)을 ASS 개행 코드(\\N)로 변환한다", () => {
    const style = resolveSubtitleStyle(null, 1080, 1920);
    const ass = generateAss([{ text: "첫줄\n둘째줄", startMs: 0, endMs: 1000, style }], 1080, 1920);

    expect(ass).toContain("첫줄\\N둘째줄");
  });
});
