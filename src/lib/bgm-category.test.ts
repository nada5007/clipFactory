import { describe, expect, it } from "vitest";

import { inferBgmCategory } from "@/lib/bgm-category";

describe("inferBgmCategory", () => {
  it("영어 키워드로 카테고리를 추론한다", () => {
    expect(inferBgmCategory("Epic Battle Theme")).toBe("웅장한");
    expect(inferBgmCategory("Cute Chit Chat")).toBe("귀여운");
  });

  it("한글 키워드로도 추론한다", () => {
    expect(inferBgmCategory("아기자기 귀여운음악 모음")).toBe("귀여운");
    expect(inferBgmCategory("웅장한 오케스트라")).toBe("웅장한");
  });

  it("매칭되는 키워드가 없으면 기타로 분류한다", () => {
    expect(inferBgmCategory("완전히 무관한 제목")).toBe("기타");
  });
});
