import type { z } from "zod";

import { env } from "@/env";
import { parseJsonWithSchema } from "@/lib/llm-json";

function requireApiKey(): string {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다. 채널 설정 > API 키 관리에서 등록하세요.");
  }
  return env.GEMINI_API_KEY;
}

// PROJECT_SPEC.md §1.3 "스크립트 탭 — UI 전체 확장 요구사항": 필드별 재생성에서 Gemini 모델을 선택했을 때 사용한다.
// 공식 SDK 대신 REST 호출을 쓴다 (이 프로젝트에 Google Generative AI SDK가 아직 설치되어 있지 않음).
export async function generateJsonWithGemini<T>(
  modelId: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const apiKey = requireApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini API 호출 실패 (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini 응답에서 텍스트를 찾지 못했습니다.");
  }

  return parseJsonWithSchema(text, schema, "Gemini");
}
