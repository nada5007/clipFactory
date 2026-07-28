"use client";

import { Music, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BgmSettingsDialog } from "@/components/projects/detail/bgm-settings-dialog";
import { RegenerateAllTtsDialog } from "@/components/projects/detail/regenerate-all-tts-dialog";
import { RegenerateSegmentDialog } from "@/components/projects/detail/regenerate-segment-dialog";
import {
  DEFAULT_TTS_FIELDS_VALUE,
  toTtsGenerationOptions,
  type TtsFieldsValue,
} from "@/components/projects/detail/tts-provider-fields";
import { useJobProgress } from "@/hooks/use-job-progress";
import { formatSecondsRange } from "@/lib/format";
import type { EffectiveBgmSettings, SerializedAudioSegment, SerializedBgmTrack } from "@/types/project";

function BgmCard({ projectId, channelId }: { projectId: string; channelId: string }) {
  const [effective, setEffective] = useState<EffectiveBgmSettings | null>(null);
  const [track, setTrack] = useState<SerializedBgmTrack | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const fetchEffective = useCallback(() => {
    fetch(`/api/projects/${projectId}/bgm-settings/effective`)
      .then((res) => (res.ok ? res.json() : { settings: null, scope: null }))
      .then((data: EffectiveBgmSettings) => {
        setEffective(data);
        if (data.settings) {
          fetch(`/api/bgm/${data.settings.trackId}`)
            .then((res) => (res.ok ? res.json() : null))
            .then(setTrack);
        } else {
          setTrack(null);
        }
      });
  }, [projectId]);

  useEffect(() => {
    fetchEffective();
  }, [fetchEffective]);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="size-4 text-primary" />
          <span className="font-medium">BGM 설정</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
          🎵 BGM 설정 관리
        </Button>
      </div>

      {effective?.settings && track ? (
        <div className="mt-3 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{effective.scope === "project" ? "프로젝트 전용" : "채널 기본값"}</Badge>
            <span className="text-sm font-medium">🎵 {track.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {track.durationSec ? `${Math.floor(track.durationSec / 60)}분 ${track.durationSec % 60}초` : "길이 정보 없음"}
            {" · "}
            {effective.settings.loop ? "자동 반복 재생" : "1회 재생"}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>볼륨 {effective.settings.volumeDb.toFixed(1)} dB</span>
            <span>재생 속도 {effective.settings.playbackSpeed.toFixed(2)}x</span>
          </div>
          <p className="text-xs text-muted-foreground">
            이 프로젝트에서는 {effective.scope === "project" ? "채널 기본값 대신 위 설정이" : "채널 기본값이"} 적용됩니다.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">아직 BGM이 설정되지 않았습니다.</p>
      )}

      <BgmSettingsDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        projectId={projectId}
        channelId={channelId}
        initialSettings={effective?.settings ?? null}
        onSaved={fetchEffective}
      />
    </div>
  );
}

function segmentToFieldsValue(segment: SerializedAudioSegment): TtsFieldsValue {
  const base = DEFAULT_TTS_FIELDS_VALUE;
  if (segment.provider === "openai") {
    return {
      ...base,
      provider: "openai",
      model: segment.model,
      voiceId: segment.voiceId,
      audioFormat: segment.settings?.audioFormat ?? "mp3",
      instructions: segment.settings?.instructions ?? "",
      speed: segment.settings?.speed ?? 1.0,
    };
  }
  return {
    ...base,
    provider: "elevenlabs",
    model: segment.model,
    voiceId: segment.voiceId,
    stability: segment.settings?.elevenlabs?.stability ?? base.stability,
    similarityBoost: segment.settings?.elevenlabs?.similarityBoost ?? base.similarityBoost,
    style: segment.settings?.elevenlabs?.style ?? base.style,
    speed: segment.settings?.elevenlabs?.speed ?? base.speed,
  };
}

export function TtsPanel({ projectId, channelId }: { projectId: string; channelId: string }) {
  const [segments, setSegments] = useState<SerializedAudioSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());
  const [showRegenerateAll, setShowRegenerateAll] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<SerializedAudioSegment | null>(null);
  const { job, start } = useJobProgress(projectId, "TTS");

  const fetchSegments = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/tts`)
      .then((res) => res.json())
      .then(setSegments)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  useEffect(() => {
    fetch("/api/settings/env-keys")
      .then((res) => res.json())
      .then((statuses: { key: string; runtimeConfigured: boolean; fileConfigured: boolean }[]) => {
        setConfiguredKeys(
          new Set(statuses.filter((s) => s.runtimeConfigured || s.fileConfigured).map((s) => s.key)),
        );
      })
      .catch(() => setConfiguredKeys(new Set()));
  }, []);

  async function generateAll(input: {
    defaultOptions: ReturnType<typeof toTtsGenerationOptions>;
    segmentOverrides?: Record<number, ReturnType<typeof toTtsGenerationOptions>>;
  }) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "TTS 생성에 실패했습니다.");
      }
      start((finalJob) => {
        setGenerating(false);
        if (finalJob.status === "SUCCEEDED") {
          fetchSegments();
        } else {
          setError(finalJob.error ?? "TTS 생성에 실패했습니다.");
        }
      });
    } catch (e) {
      setGenerating(false);
      setError(e instanceof Error ? e.message : "TTS 생성에 실패했습니다.");
      throw e;
    }
  }

  async function regenerateOne(segment: SerializedAudioSegment, value: TtsFieldsValue) {
    const res = await fetch(`/api/projects/${projectId}/tts/${segment.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ options: toTtsGenerationOptions(value) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "재생성에 실패했습니다.");
    }
    fetchSegments();
  }

  async function deleteOne(segment: SerializedAudioSegment) {
    if (!window.confirm("이 세그먼트를 삭제할까요?")) return;
    const res = await fetch(`/api/projects/${projectId}/tts/${segment.id}`, { method: "DELETE" });
    if (res.ok) fetchSegments();
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">TTS/BGM 관리</h2>
        <Button onClick={() => setShowRegenerateAll(true)} disabled={generating}>
          {generating ? "생성 중..." : segments.length > 0 ? "🎙 음성 재생성" : "🎙 TTS 생성"}
        </Button>
      </div>

      <BgmCard projectId={projectId} channelId={channelId} />

      {generating && (
        <div className="space-y-1">
          <Progress value={job?.progress ?? 0} />
          <p className="text-xs text-muted-foreground">{job?.message ?? "준비 중..."}</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {segments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 생성된 음성이 없습니다. 스크립트가 준비되면 TTS를 생성할 수 있습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">총 {segments.length}개 세그먼트</p>
          {segments.map((segment) => (
            <div key={segment.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="shrink-0">
                  #{segment.order + 1}
                </Badge>
                <span className="w-28 shrink-0 text-xs text-muted-foreground">
                  {formatSecondsRange(segment.startMs, segment.endMs)}
                </span>
                <Badge className="shrink-0">{segment.provider === "openai" ? "OpenAI" : "ElevenLabs"}</Badge>
                <p className="flex-1 truncate text-sm">{segment.text}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-1">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{segment.model}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{segment.voiceId}</span>
                <audio
                  controls
                  preload="none"
                  className="h-8 flex-1 min-w-40"
                  src={`/api/projects/${projectId}/tts/${segment.id}/audio`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="재생성"
                  onClick={() => setRegenerateTarget(segment)}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  title="삭제"
                  onClick={() => deleteOne(segment)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RegenerateAllTtsDialog
        open={showRegenerateAll}
        onOpenChange={setShowRegenerateAll}
        projectId={projectId}
        configuredKeys={configuredKeys}
        onSubmit={generateAll}
      />

      {regenerateTarget && (
        <RegenerateSegmentDialog
          open
          onOpenChange={(open) => !open && setRegenerateTarget(null)}
          initialValue={segmentToFieldsValue(regenerateTarget)}
          configuredKeys={configuredKeys}
          onRegenerate={(value) => regenerateOne(regenerateTarget, value)}
        />
      )}
    </div>
  );
}
