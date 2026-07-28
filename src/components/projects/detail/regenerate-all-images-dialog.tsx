"use client";

import { useEffect, useState } from "react";

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
  DEFAULT_STYLE_PRESET_KEY,
  IMAGE_MODEL_OPTIONS,
  IMAGE_PROVIDER_ENV_KEY,
  IMAGE_TRANSFORM_RESOLUTIONS,
  STYLE_PRESETS,
  type ImageProvider,
  type ImageTransformResolution,
} from "@/lib/image-models";
import type { SerializedScript } from "@/types/project";

const PROVIDER_ORDER: ImageProvider[] = ["openai", "google"];
const PROVIDER_LABELS: Record<ImageProvider, string> = { openai: "OpenAI", google: "Google Gemini" };

export function RegenerateAllImagesDialog({
  open,
  onOpenChange,
  projectId,
  configuredKeys,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  configuredKeys: Set<string>;
  onSubmit: (input: {
    modelKey: string;
    promptOverrides: Record<number, string>;
    resolution?: ImageTransformResolution;
  }) => Promise<void>;
}) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [modelKey, setModelKey] = useState(DEFAULT_IMAGE_MODEL_KEY);
  const [stylePresetKey, setStylePresetKey] = useState(DEFAULT_STYLE_PRESET_KEY);
  const [resolution, setResolution] = useState<ImageTransformResolution>("2K");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = IMAGE_MODEL_OPTIONS.find((m) => m.key === modelKey);
  const isGoogle = selectedModel?.provider === "google";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/script`)
      .then((res) => (res.ok ? res.json() : null))
      .then((script: SerializedScript | null) => setPrompts(script?.imagePrompts ?? []))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const stylePreset = STYLE_PRESETS.find((p) => p.key === stylePresetKey);
      const promptOverrides = Object.fromEntries(
        prompts.map((p, i) => [i, stylePreset?.promptFragment ? `${stylePreset.promptFragment}. ${p}` : p]),
      );
      await onSubmit({ modelKey, promptOverrides, resolution: isGoogle ? resolution : undefined });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 전체 재생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>이미지 전체 재생성</DialogTitle>
        </DialogHeader>

        <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          기존 이미지가 모두 삭제되고 새로 생성됩니다.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">장면별 프롬프트 조정 (이번 실행에만 적용)</label>
            {loading ? (
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            ) : (
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
                {prompts.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <span className="text-xs text-muted-foreground">장면 {i + 1}</span>
                    <Textarea
                      value={p}
                      onChange={(e) =>
                        setPrompts((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                      }
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">이번 실행에 사용할 모델</label>
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium">스타일 프리셋</label>
              <Select value={stylePresetKey} onValueChange={setStylePresetKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.key} value={preset.key}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                선택한 스타일 문구가 각 장면 프롬프트 앞에 자동으로 붙습니다.
              </p>
            </div>

            {isGoogle ? (
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
            ) : (
              <p className="text-xs text-muted-foreground">
                OpenAI는 프로젝트 형식(가로/세로)에 맞춰 해상도가 자동으로 결정됩니다.
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || prompts.length === 0}>
            {submitting ? "요청 중..." : "재생성 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
