"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSecondsRange } from "@/lib/format";
import type { SerializedAudioSegment } from "@/types/project";

export function TtsPanel({ projectId }: { projectId: string }) {
  const [segments, setSegments] = useState<SerializedAudioSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tts`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "TTS 생성에 실패했습니다.");
      }
      setSegments(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "TTS 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">TTS/BGM 관리</h2>
        <Button onClick={generate} disabled={generating}>
          {generating ? "생성 중..." : segments.length > 0 ? "🎙 음성 재생성" : "🎙 TTS 생성"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {segments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 생성된 음성이 없습니다. 스크립트가 준비되면 TTS를 생성할 수 있습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">총 {segments.length}개 세그먼트</p>
          {segments.map((segment) => (
            <div key={segment.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <Badge variant="secondary" className="shrink-0">
                #{segment.order + 1}
              </Badge>
              <span className="w-28 shrink-0 text-xs text-muted-foreground">
                {formatSecondsRange(segment.startMs, segment.endMs)}
              </span>
              <p className="flex-1 truncate text-sm">{segment.text}</p>
              <audio
                controls
                preload="none"
                className="h-8 w-56 shrink-0"
                src={`/api/projects/${projectId}/tts/${segment.id}/audio`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
