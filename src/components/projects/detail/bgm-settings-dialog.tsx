"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { BGM_CATEGORIES } from "@/lib/bgm-category";
import { cn } from "@/lib/utils";
import type { BgmSettings, SerializedBgmTrack } from "@/types/project";

const ALL_CATEGORIES = ["전체", ...BGM_CATEGORIES] as const;

function formatDuration(sec: number | null): string {
  if (!sec) return "?";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BgmSettingsDialog({
  open,
  onOpenChange,
  projectId,
  channelId,
  initialSettings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  channelId: string;
  initialSettings: BgmSettings | null;
  onSaved: () => void;
}) {
  const [tracks, setTracks] = useState<SerializedBgmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof ALL_CATEGORIES)[number]>("전체");
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(initialSettings?.trackId ?? null);
  const [volumeDb, setVolumeDb] = useState(initialSettings?.volumeDb ?? 0);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSettings?.playbackSpeed ?? 1.0);
  const [loop, setLoop] = useState(initialSettings?.loop ?? true);
  const [scope, setScope] = useState<"project" | "channel">("project");
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 업로드 폼
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<(typeof BGM_CATEGORIES)[number]>("기타");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchTracks = () => {
    setLoading(true);
    fetch(`/api/bgm${category === "전체" ? "" : `?category=${encodeURIComponent(category)}`}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setTracks)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    fetchTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/bgm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "동기화에 실패했습니다.");
      }
      fetchTracks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "동기화에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpload() {
    if (!uploadFile || !uploadTitle.trim()) return;
    setError(null);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("title", uploadTitle);
      form.set("category", uploadCategory);
      const res = await fetch("/api/bgm/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "등록에 실패했습니다.");
      }
      setUploadTitle("");
      setUploadFile(null);
      fetchTracks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록에 실패했습니다.");
    }
  }

  async function handleDeleteTrack(id: string) {
    if (!window.confirm("이 트랙을 라이브러리에서 삭제할까요?")) return;
    const res = await fetch(`/api/bgm/${id}`, { method: "DELETE" });
    if (res.ok) fetchTracks();
  }

  async function handleSave() {
    if (!selectedTrackId) return;
    setSaving(true);
    setError(null);
    try {
      const settings: BgmSettings = { trackId: selectedTrackId, volumeDb, playbackSpeed, loop };
      const url = scope === "project" ? `/api/projects/${projectId}/bgm-settings` : `/api/channels/${channelId}/bgm-settings`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "저장에 실패했습니다.");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>BGM 설정 관리</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              브금대통령[BGM President] 채널의 무료 음원을 사용합니다 (출처 표시 필요).
            </p>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? "동기화 중..." : "🔄 브금대통령 채널 동기화"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  category === c ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : tracks.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              트랙이 없습니다. 채널 동기화 또는 직접 업로드로 추가하세요.
            </p>
          ) : (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {tracks.map((track) => (
                <label
                  key={track.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border p-2 text-sm",
                    selectedTrackId === track.id ? "border-primary bg-primary/5" : "",
                  )}
                >
                  <input
                    type="radio"
                    name="bgm-track"
                    checked={selectedTrackId === track.id}
                    onChange={() => setSelectedTrackId(track.id)}
                  />
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                    {track.category}
                  </span>
                  <span className="flex-1 truncate">{track.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(track.durationSec)}</span>
                  <audio controls preload="none" className="h-7 w-32 shrink-0" src={`/api/bgm/${track.id}/file`} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    onClick={() => handleDeleteTrack(track.id)}
                  >
                    삭제
                  </Button>
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 border-t pt-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>볼륨 (dB)</span>
                <span className="text-xs text-muted-foreground">{volumeDb.toFixed(1)}</span>
              </div>
              <Slider value={[volumeDb]} onValueChange={([v]) => setVolumeDb(v)} min={-60} max={12} step={0.5} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>재생 속도</span>
                <span className="text-xs text-muted-foreground">{playbackSpeed.toFixed(2)}x</span>
              </div>
              <Slider
                value={[playbackSpeed]}
                onValueChange={([v]) => setPlaybackSpeed(v)}
                min={0.5}
                max={2}
                step={0.05}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={loop} onCheckedChange={(v) => setLoop(Boolean(v))} />
            자동 반복 재생
          </label>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">적용 범위</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scope === "project"} onChange={() => setScope("project")} />
                이 프로젝트에만 적용
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scope === "channel"} onChange={() => setScope("channel")} />
                채널 기본값으로 저장
              </label>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">MP3 직접 업로드</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept="audio/mpeg,audio/mp3"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="max-w-56"
              />
              <Input
                placeholder="제목"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="max-w-40"
              />
              <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as (typeof BGM_CATEGORIES)[number])}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BGM_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleUpload} disabled={!uploadFile || !uploadTitle.trim()}>
                등록
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving || !selectedTrackId}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
