import { describe, expect, it } from "vitest";

import { generateSrt } from "@/lib/srt";

describe("generateSrt", () => {
  it("SRT 형식(번호, 타임코드, 텍스트)으로 변환한다", () => {
    const srt = generateSrt([
      { text: "첫 문장", startMs: 0, endMs: 1500 },
      { text: "둘째 문장", startMs: 1500, endMs: 3200 },
    ]);

    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\n첫 문장\n\n2\n00:00:01,500 --> 00:00:03,200\n둘째 문장\n",
    );
  });

  it("1시간을 넘는 타임코드도 올바르게 포맷한다", () => {
    const srt = generateSrt([{ text: "긴 영상", startMs: 3_661_250, endMs: 3_662_000 }]);
    expect(srt).toContain("01:01:01,250 --> 01:01:02,000");
  });

  it("빈 배열이면 빈 문자열을 반환한다", () => {
    expect(generateSrt([])).toBe("");
  });
});
