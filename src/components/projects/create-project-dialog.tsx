"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SerializedChannel, VideoFormat } from "@/types/project";

const FORMAT_OPTIONS: { value: VideoFormat; label: string; hint: string }[] = [
  { value: "SHORT", label: "숏폼 (9:16)", hint: "최대 180초" },
  { value: "LONG", label: "롱폼 (16:9)", hint: "최대 1800초 (30분)" },
];

export function CreateProjectDialog({
  channels,
  onCreated,
}: {
  channels: SerializedChannel[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>(
    channels[0]?.videoFormat ?? "SHORT",
  );
  const [saving, setSaving] = useState(false);

  function openDialog(next: boolean) {
    if (next) {
      setChannelId(channels[0]?.id ?? "");
      setTitle("");
      setDescription("");
      setVideoFormat(channels[0]?.videoFormat ?? "SHORT");
    }
    setOpen(next);
  }

  function selectChannel(id: string) {
    setChannelId(id);
    const channel = channels.find((c) => c.id === id);
    if (channel) setVideoFormat(channel.videoFormat);
  }

  async function create() {
    setSaving(true);
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, title, description, videoFormat }),
      });
      onCreated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button disabled={channels.length === 0}>
          <Plus className="size-4" /> 새 프로젝트
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 프로젝트</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>채널 선택</Label>
            <Select value={channelId} onValueChange={selectChannel}>
              <SelectTrigger>
                <SelectValue placeholder="채널을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-title">프로젝트 제목 (필수입력)</Label>
            <Input
              id="new-title"
              placeholder="예: 2024년 1월 콘텐츠"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-description">설명 (선택)</Label>
            <Textarea
              id="new-description"
              placeholder="프로젝트에 대한 간단한 설명..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>영상 포맷</Label>
            <RadioGroup
              value={videoFormat}
              onValueChange={(v) => setVideoFormat(v as VideoFormat)}
              className="grid grid-cols-2 gap-3"
            >
              {FORMAT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm",
                    videoFormat === option.value
                      ? "border-primary bg-accent"
                      : "border-input",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={option.value} />
                    <span className="font-medium">{option.label}</span>
                  </div>
                  <span className="pl-6 text-xs text-muted-foreground">{option.hint}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={create} disabled={saving || !channelId || title.trim().length === 0}>
            생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
