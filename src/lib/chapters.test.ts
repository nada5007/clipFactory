import { describe, expect, it } from "vitest";

import { parseChapters } from "@/lib/chapters";

describe("parseChapters", () => {
  it("타임스탬프 라인이 2개 미만이면 빈 배열을 반환한다", () => {
    expect(parseChapters("설명입니다. 0:00 인트로만 있음")).toEqual([]);
    expect(parseChapters("챕터 없는 설명")).toEqual([]);
  });

  it("타임스탬프 라인이 2개 이상이면 챕터로 파싱한다", () => {
    const description = ["0:00 인트로", "1:23 본론 시작", "3:45 마무리"].join("\n");
    expect(parseChapters(description)).toEqual([
      { timestamp: "0:00", label: "인트로" },
      { timestamp: "1:23", label: "본론 시작" },
      { timestamp: "3:45", label: "마무리" },
    ]);
  });

  it("시:분:초 형식도 인식한다", () => {
    const description = ["0:00:00 시작", "1:02:30 다음"].join("\n");
    expect(parseChapters(description)).toEqual([
      { timestamp: "0:00:00", label: "시작" },
      { timestamp: "1:02:30", label: "다음" },
    ]);
  });
});
