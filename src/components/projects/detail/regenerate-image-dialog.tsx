"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_IMAGE_MODEL_KEY,
  IMAGE_MODEL_OPTIONS,
  IMAGE_PROVIDER_ENV_KEY,
  IMAGE_TRANSFORM_RESOLUTIONS,
  type ImageProvider,
  type ImageTransformResolution,
} from "@/lib/image-models";

const PROVIDER_ORDER: ImageProvider[] = ["openai", "google"];
const PROVIDER_LABELS: Record<ImageProvider, string> = { openai: "OpenAI", google: "Google Gemini" };

export function RegenerateImageDialog({
  open,
  onOpenChange,
  initialPrompt,
  configuredKeys,
  onRegenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt: string;
  configuredKeys: Set<string>;
  onRegenerate: (input: { prompt: string; modelKey: string; resolution?: ImageTransformResolution }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [modelKey, setModelKey] = useState(DEFAULT_IMAGE_MODEL_KEY);
  const [resolution, setResolution] = useState<ImageTransformResolution>("2K");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = IMAGE_MODEL_OPTIONS.find((m) => m.key === modelKey);
  const isGoogle = selectedModel?.provider === "google";

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onRegenerate({ prompt, modelKey, resolution: isGoogle ? resolution : undefined });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "재생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이미지 재생성</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">이미지 생성 프롬프트</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">모델 선택</label>
            <Select value={modelKey} onValueChange={setModelKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_ORDER.map((provider) => {
                  const enabled = configuredKeys.has(IMAGE_PROVIDER_ENV_KEY[provider]);
                  const models = IMAGE_MODEL_OPTIONS.filter((m) => m.provider === provider);
                  return (
                    <SelectGroup key={provider}>
                      <SelectLabel>{PROVIDER_LABELS[provider]}</SelectLabel>
                      {models.map((model) => (
                        <SelectItem key={model.key} value={model.key} disabled={!enabled}>
                          {model.label} - {model.description}
                          {!enabled && " (API 키 필요)"}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {isGoogle && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">이미지 해상도</label>
              <Select value={resolution} onValueChange={(v) => setResolution(v as ImageTransformResolution)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_TRANSFORM_RESOLUTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || prompt.trim().length === 0}>
            {submitting ? "재생성 중..." : "재생성 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
