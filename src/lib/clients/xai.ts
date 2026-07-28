import type { z } from "zod";

import { env } from "@/env";
import { parseJsonWithSchema } from "@/lib/llm-json";

function requireApiKey(): string {
  if (!env.XAI_API_KEY) {
    throw new Error("XAI_API_KEY가 설정되지 않았습니다. 채널 설정 > API 키 관리에서 등록하세요.");
  }
  return env.XAI_API_KEY;
}

// PROJECT_SPEC.md §1.3 "스크립트 탭 — UI 전체 확장 요구사항": 필드별 재생성에서 Grok 모델을 선택했을 때 사용한다.
// xAI API는 OpenAI 호환 스펙(chat/completions)을 그대로 따른다.
export async function generateJsonWithXai<T>(
  modelId: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const apiKey = requireApiKey();

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
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
    throw new Error(`xAI API 호출 실패 (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("xAI 응답에서 텍스트를 찾지 못했습니다.");
  }

  return parseJsonWithSchema(text, schema, "xAI");
}
