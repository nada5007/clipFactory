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
  DEFAULT_LLM_MODEL_ID,
  LLM_MODEL_OPTIONS,
  LLM_PROVIDER_ENV_KEY,
  LLM_PROVIDER_LABELS,
  type LlmProvider,
} from "@/lib/llm-models";

const CUSTOM_PROMPT_MAX_LENGTH = 1000;

const PROVIDER_ORDER: LlmProvider[] = ["anthropic", "openai", "xai", "google"];

export function RegenerateFieldDialog({
  open,
  onOpenChange,
  title,
  configuredKeys,
  onRegenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  configuredKeys: Set<string>;
  onRegenerate: (input: { customPrompt?: string; modelId: string }) => Promise<void>;
}) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_LLM_MODEL_ID);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onRegenerate({ customPrompt: customPrompt.trim() || undefined, modelId });
      setCustomPrompt("");
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">커스텀 프롬프트 (선택사항)</label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value.slice(0, CUSTOM_PROMPT_MAX_LENGTH))}
              placeholder="예: 클릭율 높은 제목, 이모지 포함, 10자 이내, SEO 최적화..."
              rows={4}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>비워두면 기본 설정으로 재생성됩니다</span>
              <span>
                {customPrompt.length}/{CUSTOM_PROMPT_MAX_LENGTH}자
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">재생성에 사용할 LLM 모델</label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_ORDER.map((provider) => {
                  const enabled = configuredKeys.has(LLM_PROVIDER_ENV_KEY[provider]);
                  const models = LLM_MODEL_OPTIONS.filter((m) => m.provider === provider);
                  return (
                    <SelectGroup key={provider}>
                      <SelectLabel>{LLM_PROVIDER_LABELS[provider]}</SelectLabel>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id} disabled={!enabled}>
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

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            재생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
