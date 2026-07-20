"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { PipelineSteps } from "@/components/projects/pipeline-steps";
import { formatDateKo } from "@/lib/format";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/project-labels";
import { cn } from "@/lib/utils";
import type { SerializedProject } from "@/types/project";

export function ProjectCard({
  project,
  onChanged,
}: {
  project: SerializedProject;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleReview() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: project.reviewStatus === "REVIEWED" ? "PENDING" : "REVIEWED",
        }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${project.id}/duplicate`, { method: "POST" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onCheckedChange={(v) => setSelected(Boolean(v))} />
          <Badge variant="secondary" className="bg-accent text-accent-foreground">
            {project.channel.name}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("border-transparent", STATUS_BADGE_CLASS[project.status])}>
            {STATUS_LABEL[project.status]}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="size-4" /> 수정
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={duplicate}>
                <Copy className="size-4" /> 복제
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" /> 삭제
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>프로젝트를 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &ldquo;{project.title}&rdquo; 프로젝트와 관련 데이터가 모두 삭제되며 되돌릴 수 없습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground">
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <h3 className="truncate font-semibold">{project.title}</h3>
        <p className="text-xs text-muted-foreground">{formatDateKo(project.createdAt)}</p>
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">진행률</span>
          <span className="font-medium">{project.progress}%</span>
        </div>
        <Progress value={project.progress} />
      </div>

      <PipelineSteps progress={project.progress} />

      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">검수 상태</span>
          <Badge variant={project.reviewStatus === "REVIEWED" ? "default" : "secondary"}>
            {project.reviewStatus === "REVIEWED" ? "검수 완료" : "검수 대기"}
          </Badge>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={project.reviewStatus === "REVIEWED"}
            onCheckedChange={toggleReview}
            disabled={busy}
          />
          검수 완료
        </label>
      </div>

      <div className="flex justify-end">
        <Button size="sm" asChild>
          <Link href={`/projects/${project.id}`}>작업 계속</Link>
        </Button>
      </div>

      <EditProjectDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
    </div>
  );
}
