"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateKo } from "@/lib/format";
import type { SerializedUploadConfig } from "@/types/project";

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

const PRIVACY_LABEL: Record<SerializedUploadConfig["privacyStatus"], string> = {
  PUBLIC: "공개 (누구나)",
  UNLISTED: "미등록 (URL 접속 가능)",
  PRIVATE: "비공개 (본인만)",
};

export function UploadPanel({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState<SerializedUploadConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [privacyStatus, setPrivacyStatus] =
    useState<SerializedUploadConfig["privacyStatus"]>("PRIVATE");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/upload`)
      .then((res) => res.json())
      .then((data: SerializedUploadConfig | null) => {
        setConfig(data);
        setTitle(data?.title ?? "");
        setDescription(data?.description ?? "");
        setTagsInput((data?.tags ?? []).join(", "));
        setPrivacyStatus(data?.privacyStatus ?? "PRIVATE");
        setScheduleEnabled(Boolean(data?.scheduledPublishAt));
        setScheduledAt(data?.scheduledPublishAt ? toDatetimeLocalValue(data.scheduledPublishAt) : "");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          tags,
          privacyStatus,
          scheduledPublishAt: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "업로드 설정을 저장하지 못했습니다.");
      setConfig(body);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 설정을 저장하지 못했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function upload() {
    setUploading(true);
    setError(null);
    try {
      const saved = await save();
      if (!saved) return;
      const res = await fetch(`/api/projects/${projectId}/upload`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "YouTube 업로드에 실패했습니다.");
      }
      setConfig(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "YouTube 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  if (config?.youtubeVideoId) {
    const scheduledDate = config.scheduledPublishAt ? new Date(config.scheduledPublishAt) : null;
    const isPendingSchedule = scheduledDate && scheduledDate.getTime() > Date.now();
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">업로드</h2>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-green-600">
            {isPendingSchedule
              ? `✓ 업로드 완료 (비공개, ${formatDateKo(config.scheduledPublishAt!)}에 자동 공개 예정)`
              : "✓ 업로드 완료"}
          </p>
          <a
            href={`https://www.youtube.com/watch?v=${config.youtubeVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline"
          >
            youtube.com/watch?v={config.youtubeVideoId}
          </a>
          {config.thumbnailWarning && (
            <p className="mt-2 text-xs text-amber-600">{config.thumbnailWarning}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">업로드</h2>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="upload-title">제목</Label>
          <Input
            id="upload-title"
            placeholder="비워두면 프로젝트 제목을 사용합니다"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="upload-description">설명</Label>
          <Textarea
            id="upload-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="upload-tags">태그 (쉼표로 구분)</Label>
          <Input
            id="upload-tags"
            placeholder="예: 교육, 키워드1, 키워드2"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>공개 설정</Label>
          {scheduleEnabled ? (
            <p className="text-sm text-muted-foreground">
              예약 업로드 사용 중 — 자동으로 비공개로 업로드되며, 지정 시각에 YouTube가 공개로 전환합니다.
            </p>
          ) : (
            <Select
              value={privacyStatus}
              onValueChange={(v) => setPrivacyStatus(v as SerializedUploadConfig["privacyStatus"])}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIVACY_LABEL) as SerializedUploadConfig["privacyStatus"][]).map((status) => (
                  <SelectItem key={status} value={status}>
                    {PRIVACY_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(Boolean(v))} />
            예약 업로드 사용
          </label>
          {scheduleEnabled && (
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={toDatetimeLocalValue(new Date(Date.now() + 15 * 60 * 1000).toISOString())}
              className="w-56"
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "설정 저장"}
          </Button>
          <Button onClick={upload} disabled={uploading}>
            {uploading ? "업로드 중..." : "YouTube에 업로드"}
          </Button>
        </div>
      </div>
    </div>
  );
}
