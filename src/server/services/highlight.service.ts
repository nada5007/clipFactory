import { selectEngagingSegments, type EngagingSegment } from "@/lib/clients/anthropic";
import { prisma } from "@/lib/prisma";
import { formatCuesForPrompt, parseTranscript } from "@/lib/transcript";
import { fetchAutoSubtitles } from "@/lib/ytdlp";

// 영상 형태별 기본 목표 길이(초). 사용자가 targetDurationSec로 덮어쓸 수 있다.
const DEFAULT_TARGET_SEC: Record<"SHORT" | "LONG", number> = { SHORT: 45, LONG: 180 };

type SourceVideo = { videoId: string; url: string; title: string };

export type AnalyzeHighlightsInput = {
  manualTranscript?: string;
  targetDurationSec?: number;
};

export type HighlightAnalysisResult = {
  transcriptSource: "manual" | "auto-subtitle";
  cueCount: number;
  targetDurationSec: number;
  segments: EngagingSegment[];
};

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 2)": 자막을 확보(수동 우선, 없으면 자동자막)해 파싱하고
// AI로 흥미 구간을 선정한 뒤 프로젝트 settings.highlightSegments에 저장한다.
export async function analyzeProjectHighlights(
  projectId: string,
  input: AnalyzeHighlightsInput,
): Promise<HighlightAnalysisResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const settings = (project.settings && typeof project.settings === "object" ? project.settings : {}) as Record<
    string,
    unknown
  >;
  const sourceVideo = settings.sourceVideo as SourceVideo | undefined;

  // 1) 자막 확보: 수동 붙여넣기가 있으면 우선, 없으면 원본 영상에서 자동자막을 받는다.
  let rawTranscript: string | null = null;
  let transcriptSource: HighlightAnalysisResult["transcriptSource"] = "manual";
  if (input.manualTranscript && input.manualTranscript.trim()) {
    rawTranscript = input.manualTranscript;
    transcriptSource = "manual";
  } else if (sourceVideo?.url) {
    rawTranscript = await fetchAutoSubtitles(sourceVideo.url);
    transcriptSource = "auto-subtitle";
  }

  if (!rawTranscript || !rawTranscript.trim()) {
    throw new Error(
      "자막을 확보하지 못했습니다. 원본 영상에 자막이 없으면 자막/타임스탬프를 직접 붙여넣어 다시 시도해주세요.",
    );
  }

  const cues = parseTranscript(rawTranscript);
  if (cues.length === 0) {
    throw new Error("자막을 해석하지 못했습니다. 타임스탬프가 포함된 자막(VTT/SRT 또는 `0:12 텍스트` 형식)인지 확인해주세요.");
  }

  // 2) AI 흥미 구간 선정.
  const format = project.videoFormat === "LONG" ? "LONG" : "SHORT";
  const targetDurationSec = input.targetDurationSec && input.targetDurationSec > 0 ? input.targetDurationSec : DEFAULT_TARGET_SEC[format];
  const segments = await selectEngagingSegments(formatCuesForPrompt(cues), { targetDurationSec, format });

  // 3) 결과를 프로젝트 settings에 저장(Phase 3 컷이 사용).
  await prisma.project.update({
    where: { id: projectId },
    data: {
      settings: {
        ...settings,
        highlightSegments: segments,
        highlightMeta: { transcriptSource, cueCount: cues.length, targetDurationSec, analyzedAt: new Date().toISOString() },
      } as never,
    },
  });

  return { transcriptSource, cueCount: cues.length, targetDurationSec, segments };
}
