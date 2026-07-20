import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { env } from "@/env";

const MODEL = "claude-opus-4-8";

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다. .env를 확인하세요.");
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

const scriptOutputSchema = z.object({
  title: z.string().describe("영상 제목 (핵심 키워드 포함, 호기심을 자극하는 간결한 문구)"),
  hook: z.string().describe("영상 시작 3초 안에 관심을 끄는 후킹멘트"),
  body: z.string().describe("발화·자막의 원문이 되는 대본 본문 (자연스러운 구어체 한국어)"),
  imagePrompts: z
    .array(z.string())
    .describe("장면별 이미지 생성 프롬프트 목록. 반드시 영어로 작성"),
});

export type GeneratedScript = z.infer<typeof scriptOutputSchema>;

export type GenerateScriptInput = {
  topic: string;
  durationSeconds: number;
  imagePromptCount: number;
  channelPrompt?: string;
};

export function buildScriptPrompt(input: GenerateScriptInput): {
  system: string;
  user: string;
} {
  const system = [
    "너는 한국어 YouTube 쇼츠 대본 작가다.",
    "입력된 주제를 바탕으로 제목, 후킹멘트(영상 시작 3초용 문구), 대본 본문, 장면별 이미지 프롬프트를 생성한다.",
    "대본 본문은 실제 발화·자막으로 쓰이므로 자연스러운 구어체 한국어로 작성한다.",
    "이미지 프롬프트는 이미지 생성 모델이 이해할 수 있도록 반드시 영어로 작성한다.",
    input.channelPrompt ? `채널 기본 톤/스타일 지침: ${input.channelPrompt}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const user = [
    `주제: ${input.topic}`,
    `목표 영상 길이: 약 ${input.durationSeconds}초`,
    `이미지 프롬프트 개수: 정확히 ${input.imagePromptCount}개`,
  ].join("\n");

  return { system, user };
}

export async function generateScript(
  input: GenerateScriptInput,
): Promise<{ script: GeneratedScript; model: string }> {
  const client = getClient();
  const { system, user } = buildScriptPrompt(input);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(scriptOutputSchema),
    },
    system,
    messages: [{ role: "user", content: user }],
  });

  if (!response.parsed_output) {
    throw new Error("스크립트 생성 결과를 파싱하지 못했습니다.");
  }

  return { script: response.parsed_output, model: MODEL };
}

// PROJECT_SPEC.md §2.3 "영상 분석 모달 (2.10)" / UI_SPEC.md §7.1 "댓글 감정 분석": 댓글 상위 100개 → 긍/중/부정 비율 + 클러스터.
const commentAnalysisSchema = z.object({
  positiveRatio: z.number().min(0).max(1).describe("긍정 댓글 비율 (0~1)"),
  neutralRatio: z.number().min(0).max(1).describe("중립 댓글 비율 (0~1)"),
  negativeRatio: z.number().min(0).max(1).describe("부정 댓글 비율 (0~1)"),
  keywordClusters: z.array(z.string()).describe("댓글에서 반복되는 대표 키워드·주제 클러스터 (최대 8개)"),
  frequentQuestions: z.array(z.string()).describe("댓글에서 자주 나오는 질문 클러스터, 후속 영상 주제 후보 (최대 5개)"),
  summary: z.string().describe("전체 댓글 반응을 요약하는 한국어 한 문단"),
});

export type CommentAnalysis = z.infer<typeof commentAnalysisSchema>;

export async function analyzeComments(comments: string[]): Promise<CommentAnalysis> {
  const client = getClient();
  const sample = comments.slice(0, 100);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(commentAnalysisSchema) },
    system:
      "너는 YouTube 댓글 반응을 분석하는 어시스턴트다. 주어진 댓글 목록을 긍정/중립/부정으로 분류하고, " +
      "반복되는 키워드와 자주 나오는 질문을 클러스터링해 한국어로 요약한다. 반어·풍자는 정확도가 낮을 수 있음을 감안해 보수적으로 분류한다.",
    messages: [
      { role: "user", content: `댓글 목록 (총 ${sample.length}개):\n${sample.map((c, i) => `${i + 1}. ${c}`).join("\n")}` },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("댓글 분석 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output;
}

// PROJECT_SPEC.md §2.3 "영상 분석 모달 (2.10)" AI 아이디어: 제목+댓글 요약을 컨텍스트로 쇼츠 아이디어 5개 생성.
const videoIdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe("아이디어 제목 (밈체 허용, 호기심 자극)"),
        hook: z.string().describe("영상 시작 3초용 후킹멘트"),
        differentiator: z.string().describe("원본 영상과의 차별화 포인트"),
        keywords: z.array(z.string()).describe("관련 키워드 (최대 5개)"),
      }),
    )
    .length(5)
    .describe("이 소재로 만들 쇼츠 아이디어 5개"),
});

export type GeneratedVideoIdeas = z.infer<typeof videoIdeasSchema>;

export async function generateVideoIdeas(input: {
  title: string;
  description: string;
  commentSummary?: string;
}): Promise<GeneratedVideoIdeas> {
  const client = getClient();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(videoIdeasSchema) },
    system:
      "너는 한국어 YouTube 쇼츠 기획자다. 참고 영상의 제목·설명·댓글 반응을 소재로 삼아, " +
      "같은 주제를 새롭게 재해석한 쇼츠 아이디어 5개를 제안한다. 원본을 그대로 베끼지 않고 차별화 포인트를 제시한다.",
    messages: [
      {
        role: "user",
        content: [
          `참고 영상 제목: ${input.title}`,
          `참고 영상 설명: ${input.description.slice(0, 1000)}`,
          input.commentSummary ? `댓글 반응 요약: ${input.commentSummary}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n"),
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("아이디어 생성 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output;
}

// UI_SPEC.md §7.1 "소스 발굴": 컨셉↔영상 매치 점수(0~100) + 근거를 한 번의 배치 호출로 산정한다.
const sourceMatchSchema = z.object({
  matches: z.array(
    z.object({
      index: z.number().int().describe("입력 후보 목록의 0부터 시작하는 인덱스"),
      score: z.number().min(0).max(100).describe("컨셉과의 일치도 점수 (0~100)"),
      reason: z.string().describe("이 점수를 준 이유 (한국어 한 문장)"),
      matchedKeywords: z.array(z.string()).describe("컨셉과 매칭된 핵심 키워드 (최대 5개)"),
    }),
  ),
});

export type SourceMatchResult = z.infer<typeof sourceMatchSchema>["matches"][number];

export async function scoreSourceMatches(
  concept: string,
  candidates: { title: string; description: string; channelTitle: string }[],
): Promise<SourceMatchResult[]> {
  const client = getClient();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(sourceMatchSchema) },
    system:
      "너는 쇼츠 소재 리서처다. 주어진 '컨셉'과 후보 영상 목록(제목/설명/채널명)을 비교해 " +
      "각 영상이 그 컨셉의 소스 영상으로 얼마나 적합한지 0~100점으로 채점하고, 이유와 매칭 키워드를 함께 제시한다. " +
      "입력된 모든 인덱스에 대해 빠짐없이 결과를 반환한다.",
    messages: [
      {
        role: "user",
        content: [
          `컨셉: ${concept}`,
          "후보 영상 목록:",
          ...candidates.map(
            (c, i) => `${i}. 제목: ${c.title} / 채널: ${c.channelTitle} / 설명: ${c.description.slice(0, 200)}`,
          ),
        ].join("\n"),
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("매치 점수 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output.matches;
}
