"use client";

import Link from "next/link";
import { Layers, PlayCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SerializedVideoAsset } from "@/types/project";

// PROJECT_SPEC.md §1.3 "영상 탭 + 타임라인 편집기 Phase A": 렌더링 트리거는 타임라인 편집기 툴바로
// 이동했다. 이 패널은 진입 안내 + 완료된 영상 미리보기/다운로드만 담당한다.
export function VideoPanel({ projectId }: { projectId: string }) {
  const [video, setVideo] = useState<SerializedVideoAsset | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">영상</h2>
        <Button asChild>
          <Link href={`/projects/${projectId}/timeline`}>
            <Layers className="mr-1.5 size-4" />
            타임라인 편집
          </Link>
        </Button>
      </div>

      {!video ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <PlayCircle className="size-10 text-primary/60" />
          <p className="font-medium">타임라인 편집기에서 영상을 생성해주세요</p>
          <p className="text-sm text-muted-foreground">영상 생성은 타임라인 편집기에서 진행됩니다.</p>
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
