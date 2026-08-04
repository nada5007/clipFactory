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

// PROJECT_SPEC.md §1.3 "스크립트 탭 — UI 전체 확장 요구사항": 필드별 재생성에서 Claude 모델을 선택했을 때 사용한다.
export async function generateJsonWithAnthropic<T>(
  modelId: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const client = getClient();

  const response = await client.messages.parse({
    model: modelId,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude 응답을 파싱하지 못했습니다.");
  }

  return response.parsed_output;
}

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

// PROJECT_SPEC.md §2.3 "영상 분석 모달 (2.10) — 댓글/SEO/종합분석 탭 고도화": 댓글 상위 100개를 각각
// 감정(3분류)·의도(9분류)로 분류한다. 좋아요·작성자 등 실측 메타데이터는 AI가 아니라 YouTube API 원본을
// video-seo.service.ts에서 그대로 사용하고, 여기서는 텍스트 기반 분류만 담당한다.
const commentAnalysisSchema = z.object({
  classifications: z
    .array(
      z.object({
        index: z.number().int().describe("입력 댓글 목록의 0부터 시작하는 인덱스"),
        sentiment: z.enum(["positive", "neutral", "negative"]).describe("감정 분류"),
        intent: z
          .enum(["공감", "놀람", "수요", "질문", "요청", "칭찬", "비판", "기타"])
          .describe("댓글의 의도 분류 (하나만 선택)"),
      }),
    )
    .describe("입력된 모든 댓글에 대한 분류 결과 (빠짐없이)"),
  frequentQuestions: z.array(z.string()).describe("댓글에서 자주 나오는 질문 클러스터, 후속 영상 주제 후보 (최대 5개)"),
  summary: z.string().describe("전체 댓글 반응을 요약하는 한국어 한 문단"),
});

export type CommentClassification = z.infer<typeof commentAnalysisSchema>["classifications"][number];
export type CommentAnalysis = z.infer<typeof commentAnalysisSchema>;

export async function analyzeComments(comments: string[]): Promise<CommentAnalysis> {
  const client = getClient();
  const sample = comments.slice(0, 100);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(commentAnalysisSchema) },
    system:
      "너는 YouTube 댓글 반응을 분석하는 어시스턴트다. 주어진 댓글 목록의 각 댓글을 감정(positive/neutral/negative)과 " +
      "의도(공감/놀람/수요/질문/요청/칭찬/비판/기타 중 하나) 두 축으로 분류한다. 반어·풍자는 정확도가 낮을 수 있음을 " +
      "감안해 보수적으로 분류한다. 자주 나오는 질문을 클러스터링하고 전체 반응을 한국어로 요약한다. " +
      "입력된 모든 인덱스에 대해 빠짐없이 분류 결과를 반환한다.",
    messages: [
      { role: "user", content: `댓글 목록 (총 ${sample.length}개):\n${sample.map((c, i) => `${i}. ${c}`).join("\n")}` },
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

// 후보가 많을 때 한 번의 structured-output 호출로 처리하면, adaptive thinking 토큰까지 max_tokens를
// 잠식해 JSON 출력이 중간에 잘리고(.parse()가 "Unterminated string" 실패) 발굴 전체가 죽는다.
// 이를 막기 위해 채점·번역 모두 이 크기로 배치를 나눠 호출한 뒤 인덱스를 재매핑해 병합한다.
const LLM_BATCH_SIZE = 25;

async function scoreSourceMatchesBatch(
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

export async function scoreSourceMatches(
  concept: string,
  candidates: { title: string; description: string; channelTitle: string }[],
): Promise<SourceMatchResult[]> {
  const batches: { start: number; items: typeof candidates }[] = [];
  for (let i = 0; i < candidates.length; i += LLM_BATCH_SIZE) {
    batches.push({ start: i, items: candidates.slice(i, i + LLM_BATCH_SIZE) });
  }

  const batchResults = await Promise.all(
    batches.map(async ({ start, items }) => {
      try {
        const matches = await scoreSourceMatchesBatch(concept, items);
        // 각 배치는 로컬 인덱스(0~items.length-1)를 반환하므로 전역 인덱스로 되돌린다.
        // 범위를 벗어난 인덱스는 모델의 착오이므로 버린다.
        return matches
          .filter((m) => m.index >= 0 && m.index < items.length)
          .map((m) => ({ ...m, index: start + m.index }));
      } catch {
        // 한 배치가 실패해도 전체 발굴이 죽지 않게 한다 — 해당 배치 영상은 점수 0(정렬 하위)으로 남는다.
        return [] as SourceMatchResult[];
      }
    }),
  );

  return batchResults.flat();
}

// PROJECT_SPEC.md §2.3 "탐색·분석 (2.4) — 검색어 번역 옵션": 사용자가 입력한 검색어를 선택 국가의 언어로
// 번역해 그 나라 유튜브에서 검색되게 한다. 고유명사/브랜드는 원어를 유지하고, 검색에 적합한 자연스러운
// 현지어 표현으로 옮긴다.
const searchQueryTranslationSchema = z.object({
  translated: z.string().describe("대상 언어로 번역된 검색어 (검색에 적합한 자연스러운 표현)"),
});

export async function translateSearchQuery(query: string, targetLanguageLabel: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;

  const client = getClient();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(searchQueryTranslationSchema) },
    system:
      `너는 YouTube 검색어 번역가다. 주어진 검색어를 ${targetLanguageLabel}로, 그 언어권 사용자가 실제로 ` +
      "검색할 법한 자연스러운 표현으로 번역한다. 브랜드·고유명사·인명은 원어(또는 그 언어권 통용 표기)를 " +
      "유지한다. 설명 없이 번역된 검색어만 반환한다.",
    messages: [{ role: "user", content: trimmed }],
  });

  if (!response.parsed_output?.translated?.trim()) {
    // 번역 실패 시 원문으로 폴백해 검색 자체는 계속되게 한다.
    return trimmed;
  }
  return response.parsed_output.translated.trim();
}

// UI_SPEC.md §7.1 "소스 발굴" "제목 자동 번역": 해외 영상 제목을 한국어로 일괄 번역한다.
const translationSchema = z.object({
  translations: z.array(z.object({ index: z.number().int(), translated: z.string() })),
});

async function translateTitlesBatch(titles: string[]): Promise<Map<number, string>> {
  const client = getClient();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(translationSchema) },
    system:
      "너는 번역가다. 주어진 영상 제목 목록을 자연스러운 한국어로 번역한다. " +
      "입력된 모든 인덱스에 대해 빠짐없이 번역 결과를 반환한다.",
    messages: [
      { role: "user", content: titles.map((t, i) => `${i}. ${t}`).join("\n") },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("제목 번역 결과를 파싱하지 못했습니다.");
  }

  return new Map(response.parsed_output.translations.map((t) => [t.index, t.translated]));
}

export async function translateTitles(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];

  const batches: { start: number; items: string[] }[] = [];
  for (let i = 0; i < titles.length; i += LLM_BATCH_SIZE) {
    batches.push({ start: i, items: titles.slice(i, i + LLM_BATCH_SIZE) });
  }

  const batchMaps = await Promise.all(
    batches.map(async ({ start, items }) => {
      try {
        const local = await translateTitlesBatch(items);
        const global = new Map<number, string>();
        local.forEach((translated, localIndex) => {
          if (localIndex >= 0 && localIndex < items.length) global.set(start + localIndex, translated);
        });
        return global;
      } catch {
        // 한 배치가 실패해도 전체가 죽지 않게 한다 — 해당 배치 제목은 아래에서 원문으로 폴백된다.
        return new Map<number, string>();
      }
    }),
  );

  const byIndex = new Map<number, string>();
  for (const map of batchMaps) {
    map.forEach((translated, index) => byIndex.set(index, translated));
  }
  return titles.map((title, i) => byIndex.get(i) ?? title);
}

// UI_SPEC.md §7.1 "탐색·분석" "자동 키워드 확장" / "추천 키워드": 입력 키워드의 연관 검색어를 생성한다.
// 같은 함수가 두 곳에서 쓰인다: (1) browse/analyze 내부에서 결과 풀을 넓히기 위한 자동(무버튼) 확장,
// (2) 분석 모드의 "추천 키워드" 버튼(사용자에게 다음 검색어를 명시적으로 제안).
const relatedKeywordsSchema = z.object({
  keywords: z.array(z.string()).describe("입력 키워드와 밀접하게 연관된 검색어 목록"),
});

export async function generateRelatedKeywords(keyword: string, count = 3): Promise<string[]> {
  const client = getClient();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(relatedKeywordsSchema) },
    system:
      "너는 YouTube SEO 키워드 리서처다. 주어진 키워드와 같은 주제·의도를 공유하면서 " +
      `약간씩 다른 앵글의 연관 검색어를 정확히 ${count}개 제안한다. 너무 넓히면 결과가 무의미해지므로 ` +
      "원래 키워드의 핵심 주제를 벗어나지 않는 선에서 제안한다.",
    messages: [{ role: "user", content: `키워드: ${keyword}` }],
  });

  if (!response.parsed_output) {
    throw new Error("연관 키워드 생성 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output.keywords.slice(0, count);
}

// UI_SPEC.md §7.1 "영상 카드 공통 버튼 4종" "[대본 패턴]": 영상의 훅 구조·흐름을 분석해
// 같은 주제를 내 스타일로 재해석한 새 대본을 생성한다. 산출 스키마는 기능 1의 스크립트 생성과 동일하게 재사용한다.
export async function generateScriptPattern(input: {
  title: string;
  description: string;
}): Promise<GeneratedScript> {
  const client = getClient();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(scriptOutputSchema) },
    system:
      "너는 한국어 YouTube 쇼츠 대본 작가다. 참고 영상의 제목·설명에서 훅 구조와 전개 흐름을 분석한 뒤, " +
      "같은 주제를 내 채널 스타일로 재해석한 새 대본(제목/후킹멘트/본문/이미지 프롬프트)을 생성한다. " +
      "원본 문장을 그대로 베끼지 않는다.",
    messages: [
      {
        role: "user",
        content: `참고 영상 제목: ${input.title}\n참고 영상 설명: ${input.description.slice(0, 1000)}`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("대본 패턴 생성 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output;
}

// UI_SPEC.md §7.1 "떡상 영상" "[패턴 분석]" 버튼: 결과 상위 떡상 영상들의 공통 훅·업로드 시간대·길이·주제를 추출한다.
// 개별 카드의 [대본 패턴](영상 1개 → 새 대본)과 달리, 결과 집합 전체를 대상으로 한 패턴 요약이다.
const surgePatternAnalysisSchema = z.object({
  commonHooks: z.array(z.string()).describe("여러 영상에서 반복되는 후킹 패턴 (최대 5개)"),
  uploadTimePattern: z.string().describe("업로드 시간대 경향에 대한 한국어 설명 한두 문장"),
  lengthPattern: z.string().describe("영상 길이 경향에 대한 한국어 설명 한두 문장"),
  topicPattern: z.string().describe("주제·소재의 공통점에 대한 한국어 설명 한두 문장"),
  summary: z.string().describe("종합 요약 한 문단 — 이 패턴을 재현하려면 무엇을 해야 하는지"),
});

export type SurgePatternAnalysis = z.infer<typeof surgePatternAnalysisSchema>;

export async function analyzeSurgePatterns(
  videos: { title: string; publishedAt: string; durationSeconds: number; ratio: number }[],
): Promise<SurgePatternAnalysis> {
  const client = getClient();
  const sample = videos.slice(0, 20);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(surgePatternAnalysisSchema) },
    system:
      "너는 YouTube 쇼츠 트렌드 분석가다. 자기 채널 평균 대비 떡상한(폭증한) 영상 목록이 주어진다. " +
      "제목의 반복되는 후킹 패턴, 업로드 시간대 경향, 영상 길이 경향, 주제 공통점을 찾아 " +
      "이 패턴을 재현하려면 무엇을 해야 하는지 한국어로 정리한다.",
    messages: [
      {
        role: "user",
        content: sample
          .map((v, i) => `${i}. 제목: ${v.title} / 게시: ${v.publishedAt} / 길이: ${v.durationSeconds}초 / 배수: ${v.ratio.toFixed(1)}배`)
          .join("\n"),
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("패턴 분석 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output;
}

// UI_SPEC.md §7.1 "홈" "오늘의 AI 아이디어": 니치 기반(또는 직접 입력) 쇼츠 아이디어 5개 시드.
const dailyIdeaSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe("아이디어 제목 (밈체 허용)"),
        niche: z
          .string()
          .describe("이 아이디어가 속한 니치 — 자동 모드에서는 제공된 니치 목록 중 정확히 하나. 해당 없으면 빈 문자열"),
        recommendScore: z.number().min(0).max(100).describe("추천 점수 (강추 {점수})"),
        whyGood: z.string().describe("왜 좋은가 — 트렌드 근거 한 문장"),
        hook: z.string().describe("후킹 — 영상 시작 3초용 문구"),
        differentiator: z.string().describe("차별화 포인트"),
        keywords: z.array(z.string()).describe("관련 키워드 (최대 5개)"),
      }),
    )
    .length(5),
});

export type DailyIdea = z.infer<typeof dailyIdeaSchema>["ideas"][number];

export type NichePerformerContext = { niche: string; title: string; viewCount: number; vph: number };

export type GenerateDailyIdeasInput =
  | { mode: "auto"; niches: string[]; trendTitles?: string[]; nichePerformers?: NichePerformerContext[] }
  | { mode: "manual"; topic: string; targetAudience?: string; category?: string };

export async function generateDailyIdeas(input: GenerateDailyIdeasInput): Promise<DailyIdea[]> {
  const client = getClient();

  // 니치별 실제 상위 성과 영상을 프롬프트에 근거로 넣어(retrieval-grounded), 아이디어가 니치 안에서
  // 실제 성과 데이터에 기반해 생성되도록 한다.
  const nichePerformerLines =
    input.mode === "auto" && input.nichePerformers && input.nichePerformers.length > 0
      ? [
          "니치별 실제 상위 성과 영상 (지금 YouTube에서 성과 좋은 실제 영상 — 제목 · 조회수 · VPH(시간당 조회수)):",
          ...input.nichePerformers.map(
            (p) => `- [${p.niche}] ${p.title} (조회수 ${p.viewCount.toLocaleString("ko-KR")} · VPH ${Math.round(p.vph)})`,
          ),
        ]
      : [];

  const context =
    input.mode === "auto"
      ? [
          `니치(관심 카테고리): ${input.niches.length > 0 ? input.niches.join(", ") : "미설정 — 범용 인기 소재로 생성"}`,
          ...nichePerformerLines,
          input.trendTitles && input.trendTitles.length > 0
            ? `참고용 전국 인기 영상 제목(니치 무관 트렌드): ${input.trendTitles.slice(0, 20).join(" / ")}`
            : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
      : [
          `토픽: ${input.topic}`,
          input.targetAudience ? `타겟 청중: ${input.targetAudience}` : undefined,
          input.category ? `카테고리: ${input.category}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n");

  const autoNicheRule =
    input.mode === "auto" && input.niches.length > 0
      ? `모든 아이디어는 반드시 제공된 니치(${input.niches.join(", ")}) 중 하나에 확실히 속해야 하며, ` +
        "니치를 벗어난 소재는 절대 제안하지 마라. 각 아이디어의 niche 필드에 그 아이디어가 속한 니치를 정확히 적는다. " +
        "위 '니치별 실제 상위 성과 영상'의 성공 포맷·주제를 반영하되 그대로 베끼지 말고 새롭게 변주한다. "
      : "각 아이디어의 niche 필드에는 해당 니치가 있으면 적고, 없으면 빈 문자열을 둔다. ";

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(dailyIdeaSchema) },
    system:
      "너는 한국어 YouTube 쇼츠 기획자다. 주어진 니치(또는 토픽)를 바탕으로 오늘 만들 만한 쇼츠 아이디어 5개를 제안한다. " +
      autoNicheRule +
      "각 아이디어는 제목, 소속 니치(niche), 추천 점수(0~100), 왜 좋은지(트렌드 근거), 후킹(첫 3초 문구), 차별화 포인트, 키워드로 구성한다.",
    messages: [{ role: "user", content: context }],
  });

  if (!response.parsed_output) {
    throw new Error("아이디어 생성 결과를 파싱하지 못했습니다.");
  }

  return response.parsed_output.ideas;
}
