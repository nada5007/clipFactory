import { describe, expect, it } from "vitest";

import { detectDominantScript, filterByLanguageScripts, filterKoreanContent, looksKorean } from "@/lib/source-discovery";

describe("looksKorean", () => {
  it("한글 비중이 높은 텍스트는 한국 콘텐츠로 판정한다", () => {
    expect(looksKorean("한국 진돗개 훈련 브이로그")).toBe(true);
  });

  it("영어 텍스트는 한국 콘텐츠가 아니라고 판정한다", () => {
    expect(looksKorean("Foreigner reacts to Korean dog training")).toBe(false);
  });

  it("영문 제목에 한글 채널명이 섞여도 한글 비중이 낮으면 아니라고 판정한다", () => {
    expect(looksKorean("Amazing Jindo Dog Training Compilation 2026")).toBe(false);
  });

  it("빈 문자열은 한국 콘텐츠가 아니라고 판정한다", () => {
    expect(looksKorean("")).toBe(false);
  });
});

describe("filterKoreanContent", () => {
  const items = [
    { title: "한국 진돗개 훈련", channelTitle: "채널A" },
    { title: "Foreigner reacts to Korean culture", channelTitle: "Channel B" },
  ];

  it("excludeKorean이 false면 그대로 반환한다", () => {
    expect(filterKoreanContent(items, false)).toHaveLength(2);
  });

  it("excludeKorean이 true면 한국 콘텐츠를 제외한다", () => {
    const result = filterKoreanContent(items, true);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Foreigner");
  });
});

describe("detectDominantScript", () => {
  it("영어 제목은 라틴으로 판정한다", () => {
    expect(detectDominantScript("DARK Stories About The Most Popular Superheroes")).toBe("latin");
  });

  it("한자 위주 제목은 한자로 판정한다(라틴이 일부 섞여도)", () => {
    expect(detectDominantScript("MULTI SUB 新番 軟萌小奶團因半魔血脈")).toBe("han");
  });

  it("가나가 있으면 일본어로 판정한다", () => {
    expect(detectDominantScript("【FULL】ドラマ 感動の物語")).toBe("japanese");
  });

  it("키릴/태국/아랍/한글도 판정한다", () => {
    expect(detectDominantScript("Почему сиамские кошки")).toBe("cyrillic");
    expect(detectDominantScript("แมวไทยน่ารัก")).toBe("thai");
    expect(detectDominantScript("قصص القطط")).toBe("arabic");
    expect(detectDominantScript("고양이 훈련법")).toBe("korean");
  });

  it("문자 없이 숫자·기호만 있으면 unknown", () => {
    expect(detectDominantScript("123 !!! 🎬")).toBe("unknown");
  });
});

describe("filterByLanguageScripts", () => {
  const items = [
    { title: "DARK Stories About Superheroes", channelTitle: "ScreenRant" },
    { title: "MULTI SUB 新番 軟萌小奶團", channelTitle: "卡通" },
    { title: "【FULL】ドラマ 物語", channelTitle: "劇場" },
    { title: "Почему сиамские кошки", channelTitle: "Гохисыч" },
  ];

  it("언어를 하나도 안 고르면 필터하지 않는다", () => {
    expect(filterByLanguageScripts(items, [])).toHaveLength(4);
  });

  it("영어(라틴)만 고르면 한자·가나·키릴 결과를 제외한다", () => {
    const result = filterByLanguageScripts(items, ["en"]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("DARK Stories");
  });

  it("영어+중국어를 고르면 라틴·한자는 남고 일본어·키릴은 제외한다", () => {
    const result = filterByLanguageScripts(items, ["en", "zh"]);
    expect(result.map((r) => r.title)).toEqual([
      "DARK Stories About Superheroes",
      "MULTI SUB 新番 軟萌小奶團",
    ]);
  });

  it("숫자/이모지만 있는 제목은 판정 불가라 유지한다(과도한 제거 방지)", () => {
    const result = filterByLanguageScripts([{ title: "2024 🎬 #1", channelTitle: "x" }], ["en"]);
    expect(result).toHaveLength(1);
  });
});
