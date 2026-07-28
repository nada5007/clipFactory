"use client";

import type { VideoFormat } from "@prisma/client";
import { Eye, Plus, RefreshCw, Trash2, Upload, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RegenerateAllImagesDialog } from "@/components/projects/detail/regenerate-all-images-dialog";
import { RegenerateImageDialog } from "@/components/projects/detail/regenerate-image-dialog";
import { TransformImageDialog } from "@/components/projects/detail/transform-image-dialog";
import { useJobProgress } from "@/hooks/use-job-progress";
import type { ImageTransformRatio, ImageTransformResolution } from "@/lib/image-models";
import type { SerializedImageAsset } from "@/types/project";

function fileUrl(projectId: string, image: SerializedImageAsset): string | null {
  return image.filePath ? `/api/projects/${projectId}/images/${image.id}/file` : null;
}

function ImageCard({
  projectId,
  image,
  onDeleted,
  onChanged,
  onOpenRegenerate,
  onOpenTransform,
}: {
  projectId: string;
  image: SerializedImageAsset;
  onDeleted: () => void;
  onChanged: () => void;
  onOpenRegenerate: () => void;
  onOpenTransform: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = fileUrl(projectId, image);

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/projects/${projectId}/images/${image.id}/upload`, {
        method: "POST",
        body: form,
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("이 이미지를 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/images/${image.id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-video bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={image.prompt || "빈 카드"} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            빈 카드 — 업로드 또는 재생성으로 채워주세요
          </div>
        )}
        <Badge className="absolute right-1.5 top-1.5" variant="secondary">
          #{image.order + 1}
        </Badge>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="원본보기"
            disabled={!url}
            onClick={() => url && window.open(url, "_blank")}
          >
            <Eye className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="이미지 교체"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadChange} />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="이미지 재생성"
            disabled={busy}
            onClick={onOpenRegenerate}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="이미지 변환"
            disabled={busy || !url}
            onClick={onOpenTransform}
          >
            <Wand2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            title="삭제"
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="truncate px-2 pb-2 text-xs text-muted-foreground" title={image.prompt}>
        {image.prompt || "(빈 카드)"}
      </p>
    </div>
  );
}

export function ImagesPanel({ projectId, videoFormat }: { projectId: string; videoFormat: VideoFormat }) {
  const [images, setImages] = useState<SerializedImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());
  const [regenerateTarget, setRegenerateTarget] = useState<SerializedImageAsset | null>(null);
  const [transformTarget, setTransformTarget] = useState<SerializedImageAsset | null>(null);
  const [showRegenerateAll, setShowRegenerateAll] = useState(false);
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
    modelKey: string;
    promptOverrides: Record<number, string>;
    resolution?: ImageTransformResolution;
  }) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
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
      throw e;
    }
  }

  async function addBlankCard() {
    const res = await fetch(`/api/projects/${projectId}/images/blank`, { method: "POST" });
    if (res.ok) fetchImages();
  }

  async function regenerateOne(
    image: SerializedImageAsset,
    input: { prompt: string; modelKey: string; resolution?: "1K" | "2K" | "4K" },
  ) {
    const res = await fetch(`/api/projects/${projectId}/images/${image.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "재생성에 실패했습니다.");
    }
    fetchImages();
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  const defaultRatio: ImageTransformRatio = videoFormat === "LONG" ? "16:9" : "9:16";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">이미지 관리</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addBlankCard} disabled={generating}>
            <Plus className="mr-1 size-3.5" />
            빈 카드 추가
          </Button>
          <Button onClick={() => setShowRegenerateAll(true)} disabled={generating}>
            {generating ? "생성 중..." : images.length > 0 ? "⟳ 전체 재생성" : "이미지 생성"}
          </Button>
        </div>
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
            <ImageCard
              key={image.id}
              projectId={projectId}
              image={image}
              onDeleted={fetchImages}
              onChanged={fetchImages}
              onOpenRegenerate={() => setRegenerateTarget(image)}
              onOpenTransform={() => setTransformTarget(image)}
            />
          ))}
        </div>
      )}

      <RegenerateAllImagesDialog
        open={showRegenerateAll}
        onOpenChange={setShowRegenerateAll}
        projectId={projectId}
        configuredKeys={configuredKeys}
        onSubmit={generateAll}
      />

      {regenerateTarget && (
        <RegenerateImageDialog
          open
          onOpenChange={(open) => !open && setRegenerateTarget(null)}
          initialPrompt={regenerateTarget.prompt}
          configuredKeys={configuredKeys}
          onRegenerate={(input) => regenerateOne(regenerateTarget, input)}
        />
      )}

      {transformTarget && (
        <TransformImageDialog
          open
          onOpenChange={(open) => !open && setTransformTarget(null)}
          projectId={projectId}
          targetImageId={transformTarget.id}
          initialImage={
            fileUrl(projectId, transformTarget)
              ? { id: transformTarget.id, url: fileUrl(projectId, transformTarget)! }
              : null
          }
          defaultRatio={defaultRatio}
          configuredKeys={configuredKeys}
          onApplied={fetchImages}
        />
      )}
    </div>
  );
}
