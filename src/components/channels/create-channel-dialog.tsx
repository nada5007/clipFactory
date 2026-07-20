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
import type { VideoFormat } from "@/types/project";

export function CreateChannelDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("SHORT");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, videoFormat }),
      });
      onCreated();
      setOpen(false);
      setName("");
      setVideoFormat("SHORT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> 새 채널 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 채널 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">채널 이름</Label>
            <Input
              id="channel-name"
              placeholder="예: 건강 정보 채널"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>기본 비디오 포맷</Label>
            <RadioGroup
              value={videoFormat}
              onValueChange={(v) => setVideoFormat(v as VideoFormat)}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="SHORT" /> 숏폼 (9:16)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="LONG" /> 롱폼 (16:9)
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={create} disabled={saving || name.trim().length === 0}>
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
