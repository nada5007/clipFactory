import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonWithSchema } from "@/lib/llm-json";

const schema = z.object({ title: z.string() });

describe("parseJsonWithSchema", () => {
  it("순수 JSON 문자열을 파싱하고 스키마로 검증한다", () => {
    const result = parseJsonWithSchema('{"title": "안녕"}', schema, "테스트");
    expect(result.title).toBe("안녕");
  });

  it("코드블록으로 감싼 JSON도 파싱한다", () => {
    const result = parseJsonWithSchema('```json\n{"title": "안녕"}\n```', schema, "테스트");
    expect(result.title).toBe("안녕");
  });

  it("유효하지 않은 JSON이면 프로바이더명을 포함한 에러를 던진다", () => {
    expect(() => parseJsonWithSchema("이건 JSON이 아님", schema, "테스트")).toThrow("테스트");
  });

  it("스키마와 일치하지 않으면 에러를 던진다", () => {
    expect(() => parseJsonWithSchema('{"wrong": 1}', schema, "테스트")).toThrow("테스트");
  });
});
