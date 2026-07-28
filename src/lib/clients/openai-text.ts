import type { z } from "zod";

import { env } from "@/env";
import { parseJsonWithSchema } from "@/lib/llm-json";

// 이미지 생성(gpt-image-1)과 같은 OpenAI 계정 키(IMAGE_API_KEY)를 재사용한다 — 별도 텍스트 전용 키를 두지 않는다.
function requireApiKey(): string {
  if (!env.IMAGE_API_KEY) {
    throw new Error("OpenAI API 키가 설정되지 않았습니다. 채널 설정 > API 키 관리에서 등록하세요.");
  }
  return env.IMAGE_API_KEY;
}

// PROJECT_SPEC.md §1.3 "스크립트 탭 — UI 전체 확장 요구사항": 필드별 재생성에서 GPT 모델을 선택했을 때 사용한다.
export async function generateJsonWithOpenAi<T>(
  modelId: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const apiKey = requireApiKey();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI API 호출 실패 (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI 응답에서 텍스트를 찾지 못했습니다.");
  }

  return parseJsonWithSchema(text, schema, "OpenAI");
}
