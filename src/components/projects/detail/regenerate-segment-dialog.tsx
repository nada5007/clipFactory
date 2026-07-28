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
  DEFAULT_TTS_FIELDS_VALUE,
  toTtsGenerationOptions,
  TtsProviderFields,
  type TtsFieldsValue,
} from "@/components/projects/detail/tts-provider-fields";

export function RegenerateSegmentDialog({
  open,
  onOpenChange,
  initialValue,
  configuredKeys,
  onRegenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: TtsFieldsValue;
  configuredKeys: Set<string>;
  onRegenerate: (value: TtsFieldsValue) => Promise<void>;
}) {
  const [value, setValue] = useState<TtsFieldsValue>(initialValue ?? DEFAULT_TTS_FIELDS_VALUE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onRegenerate(value);
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
          <DialogTitle>세그먼트 재생성</DialogTitle>
        </DialogHeader>

        <TtsProviderFields value={value} onChange={setValue} configuredKeys={configuredKeys} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "재생성 중..." : "재생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { toTtsGenerationOptions };
