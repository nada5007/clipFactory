import { z } from "zod";

export type ScriptField = "title" | "hook" | "body" | "imagePrompts";

export const SCRIPT_FIELD_SCHEMAS = {
  title: z.object({ title: z.string().describe("영상 제목 (핵심 키워드 포함, 호기심을 자극하는 간결한 문구)") }),
  hook: z.object({ hook: z.string().describe("영상 시작 3초 안에 관심을 끄는 후킹멘트") }),
  body: z.object({ body: z.string().describe("발화·자막의 원문이 되는 대본 본문 (자연스러운 구어체 한국어)") }),
  imagePrompts: z.object({
    imagePrompts: z.array(z.string()).describe("장면별 이미지 생성 프롬프트 목록. 반드시 영어로 작성"),
  }),
} satisfies Record<ScriptField, z.ZodType>;

export type ScriptFieldContext = {
  topic: string;
  title: string;
  hook: string;
  body: string;
  imagePrompts: string[];
};

const FIELD_LABELS: Record<ScriptField, string> = {
  title: "제목",
  hook: "후킹멘트",
  body: "대본 본문",
  imagePrompts: "이미지 프롬프트",
};

function fieldInstructionLine(field: ScriptField, context: ScriptFieldContext): string {
  switch (field) {
    case "title":
      return "위 내용을 바탕으로 제목만 새로 생성해라. 다른 필드는 변경하지 않는다.";
    case "hook":
      return "위 내용을 바탕으로 후킹멘트만 새로 생성해라. 다른 필드는 변경하지 않는다.";
    case "body":
      return "위 내용을 바탕으로 대본 본문만 새로 생성해라. 제목·후킹멘트와 자연스럽게 이어지도록 작성한다.";
    case "imagePrompts":
      return `위 대본에 맞는 이미지 프롬프트를 정확히 ${context.imagePrompts.length}개 새로 생성해라. 반드시 영어로 작성한다.`;
  }
}

export function buildScriptFieldPrompt(
  field: ScriptField,
  context: ScriptFieldContext,
  customPrompt?: string,
): { system: string; user: string } {
  const system = [
    "너는 한국어 YouTube 쇼츠 대본 작가다.",
    `아래는 이미 작성된 쇼츠 대본의 현재 상태다. 이 중 "${FIELD_LABELS[field]}" 항목만 새로 생성한다.`,
    "주제, 어조, 흐름 등 기존 맥락은 유지한다.",
    customPrompt ? `추가 지시사항: ${customPrompt}` : undefined,
    "반드시 유효한 JSON 객체만 응답한다. 다른 설명 문구를 포함하지 않는다.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const user = [
    `주제: ${context.topic}`,
    `현재 제목: ${context.title}`,
    `현재 후킹멘트: ${context.hook}`,
    `현재 대본: ${context.body}`,
    `현재 이미지 프롬프트 개수: ${context.imagePrompts.length}`,
    "",
    fieldInstructionLine(field, context),
  ].join("\n");

  return { system, user };
}
