import type { z } from "zod";

// Gemini/OpenAI/xAI는 Anthropic의 zodOutputFormat 같은 네이티브 구조화 출력 헬퍼가 없으므로,
// 프롬프트로 "JSON만 응답" 지시 후 이 함수로 파싱·검증한다.
export function parseJsonWithSchema<T>(text: string, schema: z.ZodType<T>, providerLabel: string): T {
  const cleaned = text.trim().replace(/^```json\s*|^```\s*|```\s*$/g, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`${providerLabel} 응답을 JSON으로 파싱하지 못했습니다.`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${providerLabel} 응답이 예상한 형식과 일치하지 않습니다.`);
  }
  return result.data;
}
