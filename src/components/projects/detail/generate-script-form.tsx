"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

const TOPIC_MIN = 100;
const TOPIC_MAX = 2000;

export function GenerateScriptForm({
  initialTopic = "",
  onSubmit,
  submitting,
  submitLabel = "대본 생성",
}: {
  initialTopic?: string;
  onSubmit: (input: {
    topic: string;
    durationSeconds: number;
    imagePromptCount: number;
    includeChannelPrompt: boolean;
  }) => void;
  submitting: boolean;
  submitLabel?: string;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [includeChannelPrompt, setIncludeChannelPrompt] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [imagePromptCount, setImagePromptCount] = useState(8);

  const topicValid = topic.trim().length >= TOPIC_MIN && topic.trim().length <= TOPIC_MAX;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="space-y-2">
        <Label htmlFor="script-topic">주제</Label>
        <Textarea
          id="script-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={5}
          placeholder="제목, 타깃, 형식, 톤, 전달 목표, 구조 등을 구체적으로 작성할수록 결과가 좋아집니다."
        />
        <p className="text-xs text-muted-foreground">
          {topic.length}/{TOPIC_MAX}자 (최소 {TOPIC_MIN}자)
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={includeChannelPrompt}
          onCheckedChange={(v) => setIncludeChannelPrompt(Boolean(v))}
        />
        채널 기본 프롬프트 포함
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>영상 길이</Label>
          <span className="text-sm text-muted-foreground">{durationSeconds}초</span>
        </div>
        <Slider
          value={[durationSeconds]}
          min={30}
          max={90}
          step={5}
          onValueChange={([v]) => setDurationSeconds(v)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="script-image-count">이미지 프롬프트 수</Label>
        <Input
          id="script-image-count"
          type="number"
          min={1}
          max={30}
          value={imagePromptCount}
          onChange={(e) =>
            setImagePromptCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
          }
          className="w-24"
        />
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!topicValid || submitting}
          onClick={() =>
            onSubmit({ topic: topic.trim(), durationSeconds, imagePromptCount, includeChannelPrompt })
          }
        >
          {submitting ? "생성 중..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
