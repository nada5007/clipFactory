"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { ImagesPanel } from "@/components/projects/detail/images-panel";
import { ScriptPanel } from "@/components/projects/detail/script-panel";
import { ThumbnailPanel } from "@/components/projects/detail/thumbnail-panel";
import { TtsPanel } from "@/components/projects/detail/tts-panel";
import { UploadPanel } from "@/components/projects/detail/upload-panel";
import { VideoPanel } from "@/components/projects/detail/video-panel";
import { Separator } from "@/components/ui/separator";
import type { SerializedProject } from "@/types/project";

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<SerializedProject | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setProject);
  }, [projectId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/projects"
          className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 프로젝트 관리로
        </Link>
        <h1 className="text-2xl font-bold">{project?.title ?? "프로젝트"}</h1>
        {project?.description && (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>

      <ScriptPanel projectId={projectId} />
      <Separator />
      <ImagesPanel projectId={projectId} />
      <Separator />
      <TtsPanel projectId={projectId} />
      <Separator />
      <VideoPanel projectId={projectId} />
      <Separator />
      {project && <ThumbnailPanel projectId={projectId} videoFormat={project.videoFormat} />}
      <Separator />
      <UploadPanel projectId={projectId} />
    </div>
  );
}
