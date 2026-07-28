"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_PRESETS,
  DEFAULT_IMAGE_MODEL_KEY,
  getImageModelOption,
  IMAGE_MODEL_OPTIONS,
  IMAGE_PROVIDER_ENV_KEY,
  IMAGE_TRANSFORM_RATIOS,
  IMAGE_TRANSFORM_RESOLUTIONS,
  type ImageProvider,
  type ImageTransformRatio,
  type ImageTransformResolution,
  type PresetLanguage,
} from "@/lib/image-models";

const PROVIDER_ORDER: ImageProvider[] = ["openai", "google"];
const PROVIDER_LABELS: Record<ImageProvider, string> = { openai: "OpenAI", google: "Google Gemini" };
const MAX_SOURCES = 5;

type SourceItem =
  | { key: string; kind: "existing"; id: string; previewUrl: string }
  | { key: string; kind: "upload"; file: File; previewUrl: string };

export function TransformImageDialog({
  open,
  onOpenChange,
  projectId,
  targetImageId,
  initialImage,
  defaultRatio,
  configuredKeys,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  targetImageId: string;
  initialImage: { id: string; url: string } | null;
  defaultRatio: ImageTransformRatio;
  configuredKeys: Set<string>;
  onApplied: () => void;
}) {
  const [sources, setSources] = useState<SourceItem[]>(
    initialImage ? [{ key: initialImage.id, kind: "existing", id: initialImage.id, previewUrl: initialImage.url }] : [],
  );
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [presetLang, setPresetLang] = useState<PresetLanguage>("ko");
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState(DEFAULT_IMAGE_MODEL_KEY);
  const [ratio, setRatio] = useState<ImageTransformRatio>(defaultRatio);
  const [resolution, setResolution] = useState<ImageTransformResolution>("2K");
  const [strength, setStrength] = useState(50);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = IMAGE_MODEL_OPTIONS.find((m) => m.key === modelKey) ?? getImageModelOption(modelKey);
  const maxSources = Math.min(MAX_SOURCES, selectedModel.maxInputImages ?? MAX_SOURCES);

  // 모델을 더 낮은 최대 입력 개수를 가진 모델로 바꾸면 초과분을 자동으로 잘라낸다.
  useEffect(() => {
    setSources((prev) => (prev.length > maxSources ? prev.slice(0, maxSources) : prev));
  }, [maxSources]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = maxSources - sources.length;
    const toAdd = Array.from(files)
      .slice(0, Math.max(0, remaining))
      .map((file) => ({
        key: `${file.name}-${file.lastModified}-${Math.random()}`,
        kind: "upload" as const,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
    setSources((prev) => [...prev, ...toAdd]);
    setPreviewBase64(null);
  }

  function removeSource(key: string) {
    setSources((prev) => {
      const target = prev.find((s) => s.key === key);
      if (target?.kind === "upload") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.key !== key);
    });
    setPreviewBase64(null);
  }

  function buildPrompt(): string {
    const preset = BACKGROUND_PRESETS.find((p) => p.key === presetKey);
    const presetFragment = preset?.promptFragment[presetLang];
    return [presetFragment, prompt.trim()].filter(Boolean).join(". ");
  }

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    try {
      const form = new FormData();
      for (const source of sources) {
        if (source.kind === "existing") form.append("existingImageIds", source.id);
        else form.append("files", source.file);
      }
      form.append("prompt", buildPrompt());
      form.append("modelKey", modelKey);
      form.append("ratio", ratio);
      form.append("resolution", resolution);
      form.append("strength", String(strength));

      const res = await fetch(`/api/projects/${projectId}/images/transform/preview`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "이미지 변환에 실패했습니다.");
      }
      const data = (await res.json()) as { imageBase64: string };
      setPreviewBase64(data.imageBase64);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 변환에 실패했습니다.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!previewBase64) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/images/${targetImageId}/transform/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: previewBase64 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "적용에 실패했습니다.");
      }
      onApplied();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "적용에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  }

  const busy = previewing || applying;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>이미지 변환</DialogTitle>
        </DialogHeader>

        <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
          불건전한 목적의 이미지 변환 시도는 제한될 수 있습니다.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                소스 이미지 ({sources.length}/{maxSources})
              </label>
              <div className="grid grid-cols-4 gap-2">
                {sources.map((source) => (
                  <div key={source.key} className="relative aspect-square overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={source.previewUrl} alt="소스 이미지" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeSource(source.key)}
                      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {sources.length < maxSources && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-4" />
                    <span className="text-xs">추가</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-muted-foreground">여러 이미지를 합성하여 변환합니다.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">배경 프리셋</label>
                <div className="flex overflow-hidden rounded-md border text-xs">
                  <button
                    type="button"
                    onClick={() => setPresetLang("ko")}
                    className={cn("px-2 py-1", presetLang === "ko" ? "bg-primary text-primary-foreground" : "")}
                  >
                    한국어
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLang("en")}
                    className={cn("px-2 py-1", presetLang === "en" ? "bg-primary text-primary-foreground" : "")}
                  >
                    English
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BACKGROUND_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPresetKey((prev) => (prev === p.key ? null : p.key))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      presetKey === p.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                    )}
                  >
                    {p.label[presetLang]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">변환 프롬프트 (한글/영어 모두 가능)</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 이 제품을 깨끗한 흰색 대리석 위에 고급스러운 조명으로 배치해주세요"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                나노바나나 모델은 한글 프롬프트가 완벽하게 지원됩니다. 한글로 자유롭게 입력하세요.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">모델</label>
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
                            {model.label}
                            {!enabled && " (API 키 필요)"}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                모델: {selectedModel.label}
                <br />
                {selectedModel.description}
                {selectedModel.maxInputImages && (
                  <>
                    <br />
                    최대 입력 이미지: {selectedModel.maxInputImages}개
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">해상도</label>
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium">비율</label>
                <div className="flex flex-wrap gap-1">
                  {IMAGE_TRANSFORM_RATIOS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRatio(r)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs",
                        ratio === r ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>변환 강도</span>
                <span className="text-xs text-muted-foreground">{strength}</span>
              </div>
              <Slider value={[strength]} onValueChange={([v]) => setStrength(v)} min={0} max={100} step={5} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>원본 유지</span>
                <span>자유 변환</span>
              </div>
            </div>

            <div className="flex aspect-video items-center justify-center rounded-md border bg-muted">
              {previewBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${previewBase64}`}
                  alt="변환 결과"
                  className="size-full object-contain"
                />
              ) : (
                <p className="text-xs text-muted-foreground">미리보기를 눌러주세요</p>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            닫기
          </Button>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={busy || sources.length === 0 || buildPrompt().length === 0}
          >
            {previewing ? "변환 중..." : "미리보기"}
          </Button>
          <Button onClick={handleApply} disabled={busy || !previewBase64}>
            {applying ? "적용 중..." : "결과 적용"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
