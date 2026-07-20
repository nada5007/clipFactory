"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useJobProgress } from "@/hooks/use-job-progress";
import type { SerializedVideoAsset } from "@/types/project";

export function VideoPanel({ projectId }: { projectId: string }) {
  const [video, setVideo] = useState<SerializedVideoAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, start } = useJobProgress(projectId, "RENDER");

  const fetchVideo = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/render`)
      .then(async (res) => {
        if (res.status === 404) {
          setVideo(null);
          return;
        }
        setVideo(await res.json());
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  async function render() {
    setRendering(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/render`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "영상 렌더링에 실패했습니다.");
      }
      start((finalJob) => {
        setRendering(false);
        if (finalJob.status === "SUCCEEDED") {
          fetchVideo();
        } else {
          setError(finalJob.error ?? "영상 렌더링에 실패했습니다.");
        }
      });
    } catch (e) {
      setRendering(false);
      setError(e instanceof Error ? e.message : "영상 렌더링에 실패했습니다.");
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">영상</h2>
        <Button onClick={render} disabled={rendering}>
          {rendering ? "렌더링 중..." : video ? "🎬 다시 렌더링" : "🎬 영상 렌더링"}
        </Button>
      </div>

      {rendering && (
        <div className="space-y-1">
          <Progress value={job?.progress ?? 0} />
          <p className="text-xs text-muted-foreground">{job?.message ?? "준비 중..."}</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!video ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 렌더링된 영상이 없습니다. 이미지와 TTS가 준비되면 영상을 렌더링할 수 있습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-green-600">✓ 영상 생성 완료</p>
          <video
            controls
            preload="metadata"
            className="max-h-[480px] w-auto self-center rounded-md bg-black"
            src={`/api/projects/${projectId}/render/file`}
          />
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <a href={`/api/projects/${projectId}/render/file`} download>
                ⬇ 다운로드
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
