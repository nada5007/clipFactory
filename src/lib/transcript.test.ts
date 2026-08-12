import { describe, expect, it } from "vitest";

import { formatCuesForPrompt, parseTranscript, retimeCuesToTimeline } from "@/lib/transcript";

describe("parseTranscript — VTT", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
안녕하세요 오늘은

00:00:04.000 --> 00:00:07.500
전기요금 절약 팁을 알려드릴게요`;

  it("VTT 큐를 시작/종료 ms와 텍스트로 파싱한다", () => {
    const cues = parseTranscript(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 1000, endMs: 4000, text: "안녕하세요 오늘은" });
    expect(cues[1]).toEqual({ startMs: 4000, endMs: 7500, text: "전기요금 절약 팁을 알려드릴게요" });
  });

  it("WEBVTT 헤더 블록은 무시한다", () => {
    expect(parseTranscript(vtt)[0].text).not.toContain("WEBVTT");
  });

  it("인라인 태그(<...>)를 제거한다", () => {
    const withTags = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<00:00:01.500><c>안녕</c>하세요`;
    expect(parseTranscript(withTags)[0].text).toBe("안녕하세요");
  });
});

describe("parseTranscript — SRT", () => {
  const srt = `1
00:00:01,000 --> 00:00:03,000
첫 문장

2
00:00:03,000 --> 00:00:05,000
둘째 문장`;

  it("SRT(쉼표 ms)도 파싱한다", () => {
    const cues = parseTranscript(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 1000, endMs: 3000, text: "첫 문장" });
  });
});

describe("parseTranscript — 유튜브 스크립트 복사류", () => {
  it("타임스탬프 단독 줄 + 다음 줄 본문을 큐로 묶는다", () => {
    const text = `0:12\n첫 구간 내용\n0:20\n둘째 구간 내용`;
    const cues = parseTranscript(text);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 12000, endMs: 20000, text: "첫 구간 내용" });
    expect(cues[1].startMs).toBe(20000);
    expect(cues[1].endMs).toBe(25000); // 마지막은 +5초 근사
  });

  it("`mm:ss 텍스트` 인라인 형식도 파싱한다", () => {
    const text = `1:05 흥미로운 도입\n1:30 핵심 반전`;
    const cues = parseTranscript(text);
    expect(cues[0]).toEqual({ startMs: 65000, endMs: 90000, text: "흥미로운 도입" });
  });

  it("HH:MM:SS(시간 포함)도 처리한다", () => {
    const cues = parseTranscript(`1:02:03 후반부 하이라이트`);
    expect(cues[0].startMs).toBe((1 * 3600 + 2 * 60 + 3) * 1000);
  });
});

describe("parseTranscript — 엣지", () => {
  it("빈 문자열은 빈 배열", () => {
    expect(parseTranscript("")).toEqual([]);
    expect(parseTranscript("   \n  ")).toEqual([]);
  });

  it("인접 중복 텍스트(자동자막 롤업)를 합친다", () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n같은 말\n\n00:00:02.000 --> 00:00:03.000\n같은 말`;
    const cues = parseTranscript(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toEqual({ startMs: 1000, endMs: 3000, text: "같은 말" });
  });
});

describe("formatCuesForPrompt", () => {
  it("[mm:ss] 텍스트 줄로 만든다", () => {
    const out = formatCuesForPrompt([
      { startMs: 12000, endMs: 20000, text: "도입" },
      { startMs: 90000, endMs: 95000, text: "반전" },
    ]);
    expect(out).toBe("[00:12] 도입\n[01:30] 반전");
  });
});

describe("retimeCuesToTimeline", () => {
  const cues = [
    { startMs: 0, endMs: 5000, text: "구간0 밖 앞" },
    { startMs: 8000, endMs: 12000, text: "A 구간 자막1" },
    { startMs: 12000, endMs: 18000, text: "A 구간 자막2" },
    { startMs: 25000, endMs: 30000, text: "구간 사이(선택 안 됨)" },
    { startMs: 35000, endMs: 40000, text: "B 구간 자막1" },
  ];

  it("선정 구간과 겹치는 자막만 새 타임라인 위치로 옮긴다", () => {
    // A: 8~20s (12s), B: 35~50s → 새 타임라인 A[0~12s], B[12~27s]
    const result = retimeCuesToTimeline(cues, [
      { startMs: 8000, endMs: 20000 },
      { startMs: 35000, endMs: 50000 },
    ]);
    expect(result).toEqual([
      { startMs: 0, endMs: 4000, text: "A 구간 자막1" }, // 8~12 → 0~4
      { startMs: 4000, endMs: 10000, text: "A 구간 자막2" }, // 12~18 → 4~10
      { startMs: 12000, endMs: 17000, text: "B 구간 자막1" }, // 35~40 → 12~17
    ]);
  });

  it("구간 경계를 넘는 자막은 구간 안으로 클램프한다", () => {
    const result = retimeCuesToTimeline(
      [{ startMs: 6000, endMs: 14000, text: "경계 걸침" }],
      [{ startMs: 8000, endMs: 12000 }], // 8~12
    );
    // 겹침 8~12 → 새 0~4
    expect(result).toEqual([{ startMs: 0, endMs: 4000, text: "경계 걸침" }]);
  });

  it("겹치는 자막이 없으면 빈 배열", () => {
    expect(retimeCuesToTimeline(cues, [{ startMs: 100000, endMs: 100500 }])).toEqual([]);
  });
});
