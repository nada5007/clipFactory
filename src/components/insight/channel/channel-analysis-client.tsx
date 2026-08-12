"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SCAN_PERIOD_DEFAULT, SCAN_PERIOD_OPTIONS, scanPeriodLabel, type ScanPeriod } from "@/lib/scan-period";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { ScannedVideo, ScannedVideoWithRatio } from "@/lib/channel-scan";
import type { ChannelScanReport, ChannelSectionsReport } from "@/server/services/channel-analysis.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// "2개월 전"처럼 대략적인 상대 시간을 한국어로 만든다(유튜브 featured 카드와 동일한 표기).
function relativeTime(publishedAt: string): string {
  const diffMs = Date.now() - new Date(publishedAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "오늘";
  const years = Math.floor(diffMs / (365 * day));
  if (years >= 1) return `${years}년 전`;
  const months = Math.floor(diffMs / (30 * day));
  if (months >= 1) return `${months}개월 전`;
  const days = Math.floor(diffMs / day);
  return `${days}일 전`;
}

function youtubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function VideoThumb({ thumbnailUrl, title, videoId }: { thumbnailUrl?: string; title: string; videoId?: string }) {
  const inner = (
    <div className="relative aspect-video w-full overflow-hidden rounded bg-muted">
      {thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt={title} className="size-full object-cover" />
      )}
      {videoId && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            ▶
          </span>
        </span>
      )}
    </div>
  );

  if (!videoId) return inner;
  return (
    <a
      href={youtubeWatchUrl(videoId)}
      target="_blank"
      rel="noreferrer"
      className="group block"
      title="유튜브에서 원본 영상 재생"
    >
      {inner}
    </a>
  );
}

function Heatmap({ heatmap }: { heatmap: ChannelScanReport["analysis"]["heatmap"] }) {
  const maxAvg = Math.max(1, ...heatmap.map((c) => c.avgViewCount));
  const lookup = new Map(heatmap.map((c) => [`${c.dayOfWeek}-${c.hour}`, c]));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[2rem_repeat(24,1fr)] gap-0.5 text-[10px] text-muted-foreground">
        <div />
        {HOURS.map((h) => (
          <div key={h} className="text-center">
            {h}
          </div>
        ))}
        {DAY_LABELS.map((label, dayOfWeek) => (
          <div key={label} className="contents">
            <div className="flex items-center">{label}</div>
            {HOURS.map((hour) => {
              const cell = lookup.get(`${dayOfWeek}-${hour}`);
              const intensity = cell ? cell.avgViewCount / maxAvg : 0;
              return (
                <div
                  key={hour}
                  title={cell ? `${DAY_LABELS[dayOfWeek]}요일 ${hour}시 — 영상 ${cell.videoCount}개, 평균 ${numberFormat.format(Math.round(cell.avgViewCount))}회` : "데이터 없음"}
                  className="aspect-square rounded-sm"
                  style={{ backgroundColor: `rgba(99, 102, 241, ${Math.max(0.06, intensity)})` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// 프로젝트 생성 체크박스 + 떡상 배수·조회수를 함께 보여주는 영상 카드(TOP10·카테고리 캐러셀 공용).
function VideoCard({
  video,
  ratio,
  selected,
  onToggle,
  className,
  showRelativeTime,
}: {
  video: ScannedVideo;
  ratio: number;
  selected: boolean;
  onToggle: () => void;
  className?: string;
  showRelativeTime?: boolean;
}) {
  return (
    <div className={`relative flex flex-col gap-1 overflow-hidden rounded-lg border bg-card ${className ?? ""}`}>
      <div className="absolute left-1 top-1 z-10 rounded bg-background/80 p-0.5">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="프로젝트 생성 대상으로 선택" />
      </div>
      <VideoThumb thumbnailUrl={video.thumbnailUrl} title={video.title} videoId={video.videoId} />
      <div className="flex flex-col gap-0.5 px-2 pb-2">
        <a
          href={youtubeWatchUrl(video.videoId)}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-xs font-medium hover:text-primary hover:underline"
          title={video.title}
        >
          {video.title}
        </a>
        <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {ratio > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{ratio.toFixed(1)}배</span>
          )}
          <span>
            조회수 {numberFormat.format(video.viewCount)}회{showRelativeTime ? ` · ${relativeTime(video.publishedAt)}` : ""}
          </span>
        </p>
      </div>
    </div>
  );
}

// featured 카테고리(재생목록 섹션) 재현: 채널 홈처럼 재생목록별 가로 스크롤 캐러셀로 보여준다(부모가 데이터를 관리).
function ChannelSections({
  sections,
  loading,
  error,
  median,
  selectedIds,
  toggleSelect,
  selectedCount,
  onCreate,
}: {
  sections: ChannelSectionsReport["sections"] | undefined;
  loading: boolean;
  error: string | null;
  median: number;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectedCount: number;
  onCreate: () => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">채널 카테고리 불러오는 중...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!sections || sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">채널 카테고리 (재생목록)</h3>
        <Button size="sm" disabled={selectedCount === 0} onClick={onCreate}>
          프로젝트 생성{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
      </div>
      {sections.map((section) => (
        <div key={section.playlistId} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <span className="text-xs text-muted-foreground">{numberFormat.format(section.itemCount)}개</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {section.videos.map((video) => (
              <VideoCard
                key={video.videoId}
                className="w-40 shrink-0"
                video={video}
                ratio={median > 0 ? video.viewCount / median : 0}
                selected={selectedIds.has(video.videoId)}
                onToggle={() => toggleSelect(video.videoId)}
                showRelativeTime
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChannelAnalysisClient() {
  const [input, setInput] = usePersistedState("insight:channel:input", "");
  const [period, setPeriod] = usePersistedState<ScanPeriod>("insight:channel:period", SCAN_PERIOD_DEFAULT);
  const [report, setReport] = usePersistedState<ChannelScanReport | null>("insight:channel:report", null);
  const [sections, setSections] = usePersistedState<ChannelSectionsReport | null>("insight:channel:sections", null);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelSaved, setChannelSaved] = useState(false);

  // 채널 분석 결과 → 프로젝트 생성(Phase 1): 영상 다중선택 + 롱/숏 팝업 + 자동 명명.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [chosenChannelId, setChosenChannelId] = useState("");
  const [chosenFormat, setChosenFormat] = useState<"LONG" | "SHORT">("LONG");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  // 프로젝트를 만들 로컬 채널 목록을 미리 불러온다(팝업의 채널 선택용).
  useEffect(() => {
    fetch("/api/channels")
      .then((res) => res.json())
      .then((cs: { id: string; name: string }[]) => {
        setChannels(cs);
        setChosenChannelId((prev) => prev || cs[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);

  // report.channel.id가 바뀌면 채널 카테고리(재생목록) 섹션을 불러온다(같은 채널이면 재조회 안 함 — 쿼터 절약).
  const reportChannelId = report?.channel.id;
  useEffect(() => {
    if (!reportChannelId) return;
    if (sections?.channelId === reportChannelId) return;
    setSectionsLoading(true);
    setSectionsError(null);
    fetch(`/api/insight/channel/sections?${new URLSearchParams({ channelId: reportChannelId }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "채널 카테고리를 불러오지 못했습니다.");
        setSections(body);
      })
      .catch((e) => setSectionsError(e instanceof Error ? e.message : "채널 카테고리를 불러오지 못했습니다."))
      .finally(() => setSectionsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportChannelId]);

  // 여러 목록(TOP10/떡상/그리드/카테고리)에 같은 영상이 겹쳐 나오므로 videoId 기준으로 메타데이터를 한 곳에
  // 모아 선택 항목의 제목·조회수·링크를 프로젝트 명명에 쓴다. 카테고리 영상은 스캔 median 대비 배수를 계산해 담는다.
  const videoById = useMemo(() => {
    const map = new Map<string, ScannedVideoWithRatio>();
    const median = report?.analysis.medianViewCount ?? 0;
    if (report) {
      for (const v of [...report.analysis.topVideos, ...report.analysis.surgedVideos, ...report.analysis.videos]) {
        map.set(v.videoId, v);
      }
    }
    if (sections && sections.channelId === reportChannelId) {
      for (const s of sections.sections) {
        for (const v of s.videos) {
          if (!map.has(v.videoId)) map.set(v.videoId, { ...v, ratio: median > 0 ? v.viewCount / median : 0 });
        }
      }
    }
    return map;
  }, [report, sections, reportChannelId]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openCreateDialog = () => {
    setCreateError(null);
    setCreatedCount(0);
    setDialogOpen(true);
  };

  const handleCreateProjects = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!chosenChannelId) {
      setCreateError("프로젝트를 만들 채널을 선택하세요.");
      return;
    }
    setCreating(true);
    setCreateError(null);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    try {
      let ok = 0;
      for (const id of ids) {
        const video = videoById.get(id);
        if (!video) continue;
        // 요구사항 ①: 제목·설명을 아이템의 초기 정보 + 현재 날짜·시간 조합으로 작명. 설명에는 Phase 2가 쓸
        // 원본 영상 링크도 담는다.
        const title = `${video.title.slice(0, 40)} · ${stamp}`;
        const description = [
          `원본 채널: ${report?.channel.snippet.title ?? "-"}`,
          `원본 영상: ${video.title}`,
          `https://www.youtube.com/watch?v=${video.videoId}`,
          `조회수 ${numberFormat.format(video.viewCount)}회`,
          `(채널 분석에서 생성 · ${stamp})`,
        ].join("\n");
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: chosenChannelId,
            title,
            description,
            creationType: "AI_AUTO",
            videoFormat: chosenFormat,
            // Phase 2/3가 쓸 원본 영상 링크를 구조화해 함께 저장한다.
            sourceVideo: {
              videoId: video.videoId,
              url: `https://www.youtube.com/watch?v=${video.videoId}`,
              title: video.title,
            },
          }),
        });
        if (res.ok) ok += 1;
      }
      setCreatedCount(ok);
      setSelectedIds(new Set());
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const saveChannel = () => {
    if (!report) return;
    fetch("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CHANNEL",
        snapshot: {
          channelId: report.channel.id,
          title: report.channel.snippet.title,
          subscriberCount: Number(report.channel.statistics.subscriberCount ?? 0),
          videoCount: report.totalUploadCount,
          viewCount: Number(report.channel.statistics.viewCount ?? 0),
        },
      }),
    }).then((res) => {
      if (res.ok) setChannelSaved(true);
    });
  };

  const runScan = (scanPeriod: ScanPeriod = period) => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("채널 URL, ID, 핸들 또는 이름을 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setChannelSaved(false);
    setSelectedIds(new Set());
    setCreatedCount(0);

    fetch(`/api/insight/channel/scan?${new URLSearchParams({ channel: trimmed, period: scanPeriod }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "채널을 분석하지 못했습니다.");
        setReport(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "채널을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">채널 분석</h2>
        <p className="text-sm text-muted-foreground">
          채널 URL, ID 또는 @핸들을 입력하면 TOP 영상·전체 영상 스캔·업로드 골든타임·썸네일을 분석합니다
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runScan()}
          placeholder="예: @veritasium 또는 채널 URL"
          className="max-w-sm"
        />
        <Select
          value={period}
          onValueChange={(v) => {
            const next = v as ScanPeriod;
            setPeriod(next);
            if (report && input.trim()) runScan(next); // 이미 분석한 상태면 기간 변경 시 즉시 재분석
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCAN_PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => runScan()} disabled={loading}>
          {loading ? "분석 중..." : "분석"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">채널</p>
                <p className="font-medium">{report.channel.snippet.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">구독자</p>
                <p className="font-medium">{numberFormat.format(Number(report.channel.statistics.subscriberCount ?? 0))}명</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 영상 수</p>
                <p className="font-medium">{numberFormat.format(report.totalUploadCount)}개</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 조회수</p>
                <p className="font-medium">{numberFormat.format(Number(report.channel.statistics.viewCount ?? 0))}회</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-fit" disabled={channelSaved} onClick={saveChannel}>
              {channelSaved ? "채널 저장됨" : "채널 저장"}
            </Button>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">인기 영상 TOP 10 ({scanPeriodLabel(report.period ?? SCAN_PERIOD_DEFAULT)})</h3>
              <Button size="sm" disabled={selectedIds.size === 0} onClick={openCreateDialog}>
                프로젝트 생성{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              ※ 채널 역대 전체가 아니라 <b>선택 기간 내 업로드</b> 중 조회수 상위입니다(유튜브 &lsquo;인기순&rsquo;과 다를 수
              있음). 더 넓게 보려면 위 기간을 늘려주세요. 배수는 선택 기간 median 대비값.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {report.analysis.topVideos.map((video) => (
                <VideoCard
                  key={video.videoId}
                  video={video}
                  ratio={video.ratio}
                  selected={selectedIds.has(video.videoId)}
                  onToggle={() => toggleSelect(video.videoId)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                전체 영상 스캔 — {scanPeriodLabel(report.period ?? SCAN_PERIOD_DEFAULT)} 업로드 {numberFormat.format(report.scannedCount)}개 중 median 대비 3배 이상 떡상 {report.analysis.surgedVideos.length}개
              </h3>
              <Button size="sm" disabled={selectedIds.size === 0} onClick={openCreateDialog}>
                프로젝트 생성{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              중앙값 조회수 {numberFormat.format(report.analysis.medianViewCount)}회 (선택 기간 내 업로드 기준선 — 이 값 대비 3배↑가 &lsquo;떡상&rsquo;)
            </p>
            {report.analysis.surgedVideos.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">median 대비 3배 이상 떡상한 영상이 없습니다.</p>
            ) : (
              <div className="flex flex-col divide-y rounded-lg border">
                {report.analysis.surgedVideos.map((video) => (
                  <div key={video.videoId} className="flex items-center gap-3 p-2 text-sm">
                    <Checkbox
                      checked={selectedIds.has(video.videoId)}
                      onCheckedChange={() => toggleSelect(video.videoId)}
                      aria-label="프로젝트 생성 대상으로 선택"
                    />
                    <a
                      href={youtubeWatchUrl(video.videoId)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-1 items-center justify-between gap-3 hover:bg-muted"
                      title="유튜브에서 원본 영상 재생"
                    >
                      <span className="line-clamp-1 hover:text-primary" title={video.title}>
                        {video.title}
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {video.ratio.toFixed(1)}배 · {numberFormat.format(video.viewCount)}회
                      </span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ChannelSections
            sections={sections?.channelId === report.channel.id ? sections.sections : undefined}
            loading={sectionsLoading}
            error={sectionsError}
            median={report.analysis.medianViewCount}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            selectedCount={selectedIds.size}
            onCreate={openCreateDialog}
          />

          <div>
            <h3 className="mb-2 text-sm font-semibold">골든 업로드 시간대 (KST, 요일×시간)</h3>
            {report.analysis.heatmap.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">히트맵을 만들 데이터가 부족합니다.</p>
            ) : (
              <Heatmap heatmap={report.analysis.heatmap} />
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">썸네일 그리드 (조회수 순)</h3>
              <Button size="sm" disabled={selectedIds.size === 0} onClick={openCreateDialog}>
                프로젝트 생성{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              선택 기간 내 스캔한 업로드 <b>전부</b>를 조회수 높은 순으로 나열한 썸네일 갤러리입니다. 잘되는 영상들의 <b>썸네일
              디자인 패턴</b>(색·글자·구도)을 한눈에 훑고, 체크박스로 여러 개를 골라 바로 프로젝트로 만들 수 있습니다.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {report.analysis.videos.map((video) => (
                <div key={video.videoId} className="relative">
                  <div className="absolute left-1 top-1 z-10 rounded bg-background/80 p-0.5">
                    <Checkbox
                      checked={selectedIds.has(video.videoId)}
                      onCheckedChange={() => toggleSelect(video.videoId)}
                      aria-label="프로젝트 생성 대상으로 선택"
                    />
                  </div>
                  <VideoThumb thumbnailUrl={video.thumbnailUrl} title={video.title} videoId={video.videoId} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>선택한 {selectedIds.size || createdCount}개 영상으로 프로젝트 생성</DialogTitle>
            <DialogDescription>
              영상마다 개별 프로젝트가 만들어집니다. 실제 영상 다운로드·구간 분석·편집은 이후 단계에서 진행됩니다.
            </DialogDescription>
          </DialogHeader>

          {createdCount > 0 ? (
            <div className="flex flex-col gap-3 py-2 text-sm">
              <p>
                프로젝트 <span className="font-semibold text-primary">{createdCount}개</span>를 만들었습니다.
              </p>
              <Link href="/projects" className="text-sm text-primary underline">
                프로젝트 관리로 이동 →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">영상 형태</p>
                <RadioGroup
                  value={chosenFormat}
                  onValueChange={(v) => setChosenFormat(v as "LONG" | "SHORT")}
                  className="flex gap-4"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="LONG" /> 롱폼 (16:9)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="SHORT" /> 숏폼 (9:16)
                  </label>
                </RadioGroup>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">프로젝트를 만들 채널</p>
                {channels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    먼저 채널 설정에서 채널을 하나 만들어야 합니다.
                  </p>
                ) : (
                  <Select value={chosenChannelId} onValueChange={setChosenChannelId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="채널 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
          )}

          <DialogFooter>
            {createdCount > 0 ? (
              <Button onClick={() => setDialogOpen(false)}>닫기</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
                  취소
                </Button>
                <Button onClick={handleCreateProjects} disabled={creating || channels.length === 0 || selectedIds.size === 0}>
                  {creating ? "생성 중..." : `${selectedIds.size}개 생성`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
