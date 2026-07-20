"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useJobProgress } from "@/hooks/use-job-progress";
import type { SerializedImageAsset } from "@/types/project";

export function ImagesPanel({ projectId }: { projectId: string }) {
  const [images, setImages] = useState<SerializedImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, start } = useJobProgress(projectId, "IMAGES");

  const fetchImages = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/images`)
      .then((res) => res.json())
      .then(setImages)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/images`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "이미지 생성에 실패했습니다.");
      }
      start((finalJob) => {
        setGenerating(false);
        if (finalJob.status === "SUCCEEDED") {
          fetchImages();
        } else {
          setError(finalJob.error ?? "이미지 생성에 실패했습니다.");
        }
      });
    } catch (e) {
      setGenerating(false);
      setError(e instanceof Error ? e.message : "이미지 생성에 실패했습니다.");
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">이미지 관리</h2>
        <Button onClick={generate} disabled={generating}>
          {generating ? "생성 중..." : images.length > 0 ? "⟳ 전체 재생성" : "이미지 생성"}
        </Button>
      </div>

      {generating && (
        <div className="space-y-1">
          <Progress value={job?.progress ?? 0} />
          <p className="text-xs text-muted-foreground">{job?.message ?? "준비 중..."}</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 생성된 이미지가 없습니다. 스크립트가 준비되면 이미지를 생성할 수 있습니다.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <div key={image.id} className="flex flex-col gap-2 overflow-hidden rounded-lg border bg-card">
              <div className="relative aspect-video bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/projects/${projectId}/images/${image.id}/file`}
                  alt={image.prompt}
                  className="size-full object-cover"
                />
                <Badge className="absolute right-1.5 top-1.5" variant="secondary">
                  #{image.order + 1}
                </Badge>
              </div>
              <p className="truncate px-2 pb-2 text-xs text-muted-foreground" title={image.prompt}>
                {image.prompt}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
