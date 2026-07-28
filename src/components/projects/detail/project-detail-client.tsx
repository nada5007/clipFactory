"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, FileText, Film, Image as ImageIcon, Mic, Upload } from "lucide-react";

import { ImagesPanel } from "@/components/projects/detail/images-panel";
import { ScriptPanel } from "@/components/projects/detail/script-panel";
import { ThumbnailPanel } from "@/components/projects/detail/thumbnail-panel";
import { TtsPanel } from "@/components/projects/detail/tts-panel";
import { UploadPanel } from "@/components/projects/detail/upload-panel";
import { VideoPanel } from "@/components/projects/detail/video-panel";
import { cn } from "@/lib/utils";
import type { SerializedProject } from "@/types/project";

type TabKey = "script" | "images" | "tts" | "video" | "thumbnail" | "upload";

// 탭별 완료 여부 점(dot) 표시용 근사치. 하위 리소스(이미지/오디오/썸네일 등) 존재 여부를 직접
// 조회하지 않고 Project.progress 임계값으로 근사한다 (PROJECT_SPEC.md §1.3 "탭 바 도입" 범위 내 단순화).
const TAB_ITEMS: { key: TabKey; label: string; icon: typeof FileText; progressThreshold: number }[] = [
  { key: "script", label: "스크립트 관리", icon: FileText, progressThreshold: 20 },
  { key: "images", label: "이미지", icon: ImageIcon, progressThreshold: 40 },
  { key: "tts", label: "TTS/BGM", icon: Mic, progressThreshold: 60 },
  { key: "video", label: "영상", icon: Film, progressThreshold: 80 },
  { key: "thumbnail", label: "썸네일", icon: Camera, progressThreshold: 90 },
  { key: "upload", label: "업로드", icon: Upload, progressThreshold: 100 },
];

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<SerializedProject | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("script");

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

      <div className="flex items-center gap-1 border-b">
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          const done = (project?.progress ?? 0) >= tab.progressThreshold;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
              <span
                className={cn("size-1.5 rounded-full", done ? "bg-emerald-500" : "bg-muted-foreground/30")}
              />
            </button>
          );
        })}
      </div>

      {activeTab === "script" && <ScriptPanel projectId={projectId} />}
      {activeTab === "images" && project && <ImagesPanel projectId={projectId} videoFormat={project.videoFormat} />}
      {activeTab === "tts" && project && <TtsPanel projectId={projectId} channelId={project.channelId} />}
      {activeTab === "video" && <VideoPanel projectId={projectId} />}
      {activeTab === "thumbnail" && project && (
        <ThumbnailPanel projectId={projectId} videoFormat={project.videoFormat} />
      )}
      {activeTab === "upload" && <UploadPanel projectId={projectId} />}
    </div>
  );
}
