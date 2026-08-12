"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Segment = { startMs: number; endMs: number; reason: string };
type SourceVideo = { videoId: string; url: string; title: string };
type HighlightMeta = { transcriptSource?: string; cueCount?: number; targetDurationSec?: number; analyzedAt?: string };

function mmss(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("프레임 이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

// 한글은 단어 경계(공백)가 드물어 글자 단위로 폭을 재며 줄바꿈한다(최대 3줄).
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of Array.from(text.trim())) {
    if (ch === "\n") {
      if (cur) lines.push(cur);
      cur = "";
      continue;
    }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

// 하이라이트 프레임 위에 후킹 문구를 얹어 썸네일 PNG(dataURL)로 합성한다. 한글 렌더는 브라우저가
// 직접 처리하므로 서버 폰트 이슈가 없다.
async function composeHookThumbnail(frameUrl: string, text: string, width: number, height: number): Promise<string> {
  const img = await loadImage(frameUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 초기화하지 못했습니다.");

  // 프레임을 cover 방식으로 채운다.
  const scale = Math.max(width / img.width, height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);

  // 하단 가독성용 그라디언트.
  const grad = ctx.createLinearGradient(0, height * 0.5, 0, height);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, height * 0.5, width, height * 0.5);

  // 후킹 문구(굵게 + 검은 테두리).
  const fontSize = Math.round(width * 0.078);
  ctx.font = `900 ${fontSize}px "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = fontSize * 0.18;
  ctx.strokeStyle = "rgba(0,0,0,0.92)";
  ctx.fillStyle = "#ffffff";

  const lines = wrapLines(ctx, text, width * 0.88);
  const lineH = fontSize * 1.16;
  let y = height - Math.round(height * 0.07);
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.strokeText(lines[i], width / 2, y);
    ctx.fillText(lines[i], width / 2, y);
    y -= lineH;
  }
  return canvas.toDataURL("image/png");
}

export function HighlightPanel({ projectId }: { projectId: string }) {
  const [sourceVideo, setSourceVideo] = useState<SourceVideo | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [meta, setMeta] = useState<HighlightMeta | null>(null);

  const [manualTranscript, setManualTranscript] = useState("");
  const [targetSec, setTargetSec] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<{ clipCount: number; totalDurationMs: number } | null>(null);

  const [assetsRunning, setAssetsRunning] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsResult, setAssetsResult] = useState<{ subtitleCount: number; scriptTitle: string } | null>(null);

  const [thumbRunning, setThumbRunning] = useState(false);
  const [thumbSaving, setThumbSaving] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [thumbSaved, setThumbSaved] = useState(false);
  const [hookText, setHookText] = useState("");
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [thumbDims, setThumbDims] = useState<{ width: number; height: number } | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

  const loadSettings = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => {
        const s = (p?.settings ?? {}) as { sourceVideo?: SourceVideo; highlightSegments?: Segment[]; highlightMeta?: HighlightMeta };
        setSourceVideo(s.sourceVideo ?? null);
        setSegments(s.highlightSegments ?? []);
        setMeta(s.highlightMeta ?? null);
      });
  }, [projectId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const runAnalyze = () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    const body: { manualTranscript?: string; targetDurationSec?: number } = {};
    if (manualTranscript.trim()) body.manualTranscript = manualTranscript;
    const t = Number(targetSec);
    if (Number.isFinite(t) && t > 0) body.targetDurationSec = t;

    fetch(`/api/projects/${projectId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "하이라이트 분석에 실패했습니다.");
        setSegments(data.segments ?? []);
        setMeta({ transcriptSource: data.transcriptSource, cueCount: data.cueCount, targetDurationSec: data.targetDurationSec });
        setBuildResult(null);
      })
      .catch((e) => setAnalyzeError(e instanceof Error ? e.message : "하이라이트 분석에 실패했습니다."))
      .finally(() => setAnalyzing(false));
  };

  const runBuild = () => {
    setBuilding(true);
    setBuildError(null);
    fetch(`/api/projects/${projectId}/build-highlight-track`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "영상 트랙 생성에 실패했습니다.");
        setBuildResult(data);
      })
      .catch((e) => setBuildError(e instanceof Error ? e.message : "영상 트랙 생성에 실패했습니다."))
      .finally(() => setBuilding(false));
  };

  const runAssets = () => {
    setAssetsRunning(true);
    setAssetsError(null);
    fetch(`/api/projects/${projectId}/highlight-assets`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "대본·자막 생성에 실패했습니다.");
        setAssetsResult(data);
      })
      .catch((e) => setAssetsError(e instanceof Error ? e.message : "대본·자막 생성에 실패했습니다."))
      .finally(() => setAssetsRunning(false));
  };

  // 4단계: 하이라이트 프레임 + 후킹 문구를 가져와 미리보기를 합성한다.
  const runThumbnail = () => {
    setThumbRunning(true);
    setThumbError(null);
    setThumbSaved(false);
    fetch(`/api/projects/${projectId}/highlight-thumbnail`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "썸네일 프레임 생성에 실패했습니다.");
        const dims = { width: data.width as number, height: data.height as number };
        setFrameDataUrl(data.frameDataUrl);
        setThumbDims(dims);
        setHookText(data.hook ?? "");
        const preview = await composeHookThumbnail(data.frameDataUrl, data.hook ?? "", dims.width, dims.height);
        setThumbPreview(preview);
      })
      .catch((e) => setThumbError(e instanceof Error ? e.message : "썸네일 프레임 생성에 실패했습니다."))
      .finally(() => setThumbRunning(false));
  };

  // 문구를 바꾼 뒤 저장된 프레임으로 미리보기를 다시 합성한다(서버 재호출 없음).
  const recomposeThumbnail = async () => {
    if (!frameDataUrl || !thumbDims) return;
    setThumbError(null);
    setThumbSaved(false);
    try {
      const preview = await composeHookThumbnail(frameDataUrl, hookText, thumbDims.width, thumbDims.height);
      setThumbPreview(preview);
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : "썸네일 합성에 실패했습니다.");
    }
  };

  // 합성한 미리보기를 프로젝트 썸네일로 저장한다(기존 썸네일 저장 경로 재사용).
  const saveThumbnail = () => {
    if (!thumbPreview || !thumbDims) return;
    setThumbSaving(true);
    setThumbError(null);
    fetch(`/api/projects/${projectId}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: thumbPreview, width: thumbDims.width, height: thumbDims.height }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("썸네일 저장에 실패했습니다.");
        setThumbSaved(true);
      })
      .catch((e) => setThumbError(e instanceof Error ? e.message : "썸네일 저장에 실패했습니다."))
      .finally(() => setThumbSaving(false));
  };

  if (!sourceVideo) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        이 프로젝트에는 채널 분석 소스 영상이 연결되어 있지 않습니다. 채널 분석에서 &lsquo;프로젝트 생성&rsquo;으로 만든
        프로젝트에서만 하이라이트 자동 편집을 쓸 수 있습니다.
      </p>
    );
  }

  const totalSelectedSec = Math.round(segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0) / 1000);

  return (
    <div className="flex flex-col gap-5">
      {/* 원본 영상 */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">원본 영상</p>
        <a href={sourceVideo.url} target="_blank" rel="noreferrer" className="font-medium hover:text-primary hover:underline">
          {sourceVideo.title || sourceVideo.url}
        </a>
        <p className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ 다운로드·재가공 대상 영상의 권리·이용약관 책임은 사용자에게 있습니다. 본인 소유/라이선스 영상 사용을 전제로
          하며, 원본을 그대로 재업로드하기보다 변형·논평·요약 등 트랜스포머티브 편집 + 출처 표기를 권장합니다.
        </p>
      </div>

      {/* Phase 2: 하이라이트 분석 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">1단계 · 하이라이트 구간 분석</h3>
          <p className="text-xs text-muted-foreground">
            원본 영상의 자동자막을 읽어 흥미 구간을 AI가 선정합니다. 자동자막이 없거나 직접 넣고 싶으면 아래에 자막/타임스탬프를
            붙여넣으세요(예: <code>0:12 텍스트</code> 또는 VTT/SRT).
          </p>
        </div>
        <Textarea
          value={manualTranscript}
          onChange={(e) => setManualTranscript(e.target.value)}
          placeholder="(선택) 자막/타임스탬프 직접 붙여넣기 — 비우면 유튜브 자동자막을 사용합니다"
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={targetSec}
            onChange={(e) => setTargetSec(e.target.value)}
            placeholder="목표 길이(초, 비우면 자동)"
            className="w-56"
            inputMode="numeric"
          />
          <Button onClick={runAnalyze} disabled={analyzing}>
            {analyzing ? "분석 중..." : "하이라이트 분석"}
          </Button>
        </div>
        {analyzeError && <p className="text-sm text-destructive">{analyzeError}</p>}

        {segments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              선정 구간 {segments.length}개 · 합계 약 {totalSelectedSec}초
              {meta?.transcriptSource ? ` · 자막출처: ${meta.transcriptSource === "manual" ? "직접 입력" : "자동자막"}` : ""}
            </p>
            <div className="flex flex-col divide-y rounded-lg border">
              {segments.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-2 text-sm">
                  <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {mmss(s.startMs)}~{mmss(s.endMs)}
                  </span>
                  <span className="line-clamp-1 text-muted-foreground">{s.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phase 3a: 영상 트랙 생성 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">2단계 · 선정 구간으로 영상 트랙 만들기</h3>
          <p className="text-xs text-muted-foreground">
            원본 영상을 내려받아 위에서 선정된 구간을 잘라 타임라인의 VIDEO 트랙으로 구성합니다(기존 자동 생성분은 교체).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runBuild} disabled={building || segments.length === 0}>
            {building ? "생성 중... (다운로드·컷 시간이 걸릴 수 있음)" : "영상 트랙 만들기"}
          </Button>
          <Link href={`/projects/${projectId}/timeline`} className="text-sm text-primary underline">
            타임라인 편집기 열기 →
          </Link>
        </div>
        {segments.length === 0 && (
          <p className="text-xs text-muted-foreground">먼저 1단계에서 하이라이트 구간을 분석해주세요.</p>
        )}
        {buildError && <p className="text-sm text-destructive">{buildError}</p>}
        {buildResult && (
          <p className="text-sm">
            VIDEO 트랙에 클립 <span className="font-semibold text-primary">{buildResult.clipCount}개</span>(총{" "}
            {Math.round(buildResult.totalDurationMs / 1000)}초)를 구성했습니다. &lsquo;영상&rsquo; 탭 또는 타임라인 편집기에서
            확인하세요.
          </p>
        )}
      </div>

      {/* Phase 3b: 대본·자막 자동 생성 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">3단계 · 대본·자막 자동 생성</h3>
          <p className="text-xs text-muted-foreground">
            원본 자막을 잘라낸 구간에 맞춰 재배치해 <b>영상 내 오디오 자막</b>을 SUBTITLE 트랙에 넣고, 원본 내용을 바탕으로
            <b> 새 대본(스크립트)</b>을 생성합니다(스크립트 탭에서 확인·수정 가능).
          </p>
        </div>
        <Button onClick={runAssets} disabled={assetsRunning || segments.length === 0} variant="secondary" className="w-fit">
          {assetsRunning ? "생성 중..." : "대본·자막 자동 생성"}
        </Button>
        {assetsError && <p className="text-sm text-destructive">{assetsError}</p>}
        {assetsResult && (
          <p className="text-sm">
            자막 <span className="font-semibold text-primary">{assetsResult.subtitleCount}개</span> 생성 · 대본 &ldquo;
            {assetsResult.scriptTitle}&rdquo; 저장 완료.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          ※ 대본을 음성(TTS)으로 읽어주는 내레이션 자동 생성은 원본 오디오 유지 여부 등 설계 확정 후 추가 예정입니다.
        </p>
      </div>

      {/* Phase 4: 후킹 썸네일 자동 생성 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">4단계 · 후킹 썸네일 자동 생성</h3>
          <p className="text-xs text-muted-foreground">
            하이라이트 영상에서 대표 장면 한 컷을 뽑고, 대본의 <b>후킹 문구</b>를 얹어 썸네일을 자동 합성합니다. 문구는 아래에서
            바로 수정할 수 있고, &lsquo;썸네일 탭&rsquo;에서 세밀 편집도 가능합니다.
          </p>
        </div>
        <Button onClick={runThumbnail} disabled={thumbRunning} variant="secondary" className="w-fit">
          {thumbRunning ? "프레임 추출 중..." : frameDataUrl ? "프레임 다시 추출" : "후킹 썸네일 자동 생성"}
        </Button>
        {thumbError && <p className="text-sm text-destructive">{thumbError}</p>}

        {frameDataUrl && thumbPreview && (
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbPreview}
              alt="후킹 썸네일 미리보기"
              className="w-40 shrink-0 rounded-lg border object-contain"
            />
            <div className="flex flex-1 flex-col gap-2">
              <label className="text-xs text-muted-foreground">후킹 문구</label>
              <Textarea value={hookText} onChange={(e) => setHookText(e.target.value)} rows={3} />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={recomposeThumbnail} variant="outline" size="sm">
                  미리보기 다시 합성
                </Button>
                <Button onClick={saveThumbnail} disabled={thumbSaving} size="sm">
                  {thumbSaving ? "저장 중..." : "이 썸네일로 저장"}
                </Button>
                {thumbSaved && <span className="text-sm text-primary">저장 완료 · 썸네일 탭에서 확인하세요.</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
