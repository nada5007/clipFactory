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
import {
  DEFAULT_TTS_FIELDS_VALUE,
  toTtsGenerationOptions,
  TtsProviderFields,
  type TtsFieldsValue,
} from "@/components/projects/detail/tts-provider-fields";
import type { SerializedAudioSegment } from "@/types/project";

export function RegenerateAllTtsDialog({
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
    defaultOptions: ReturnType<typeof toTtsGenerationOptions>;
    segmentOverrides?: Record<number, ReturnType<typeof toTtsGenerationOptions>>;
  }) => Promise<void>;
}) {
  const [segments, setSegments] = useState<SerializedAudioSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainValue, setMainValue] = useState<TtsFieldsValue>(DEFAULT_TTS_FIELDS_VALUE);
  const [showPerSegment, setShowPerSegment] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [bulkValue, setBulkValue] = useState<TtsFieldsValue>(DEFAULT_TTS_FIELDS_VALUE);
  const [overrides, setOverrides] = useState<Record<number, TtsFieldsValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/tts`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setSegments)
      .finally(() => setLoading(false));
  }, [open, projectId]);

  function toggleOrder(order: number) {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }

  function applyBulkToSelected() {
    if (selectedOrders.size === 0) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (const order of Array.from(selectedOrders)) next[order] = bulkValue;
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const segmentOverrides =
        Object.keys(overrides).length > 0
          ? Object.fromEntries(
              Object.entries(overrides).map(([order, v]) => [order, toTtsGenerationOptions(v)]),
            )
          : undefined;
      await onSubmit({ defaultOptions: toTtsGenerationOptions(mainValue), segmentOverrides });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "TTS 재생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>TTS 재생성</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <TtsProviderFields value={mainValue} onChange={setMainValue} configuredKeys={configuredKeys} />

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>기존 음성을 모두 삭제하고 새로 생성합니다</li>
            <li>동일한 텍스트로 다른 음성이 생성됩니다</li>
          </ul>

          <label className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm">
            <Checkbox checked={showPerSegment} onCheckedChange={(v) => setShowPerSegment(Boolean(v))} />
            <span className="text-primary">세그먼트별 개별 음성 설정</span>
          </label>

          {showPerSegment && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">개별 설정하지 않은 세그먼트는 위 TTS 엔진 설정으로 생성됩니다.</p>
              <p className="text-xs font-medium">{selectedOrders.size}/{segments.length}개 선택됨</p>

              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : (
                <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {segments.map((segment) => (
                    <label key={segment.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                      <Checkbox
                        checked={selectedOrders.has(segment.order)}
                        onCheckedChange={() => toggleOrder(segment.order)}
                      />
                      <span className="text-xs text-muted-foreground">#{segment.order + 1}</span>
                      <span className="flex-1 truncate">{segment.text}</span>
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                        {overrides[segment.order] ? "개별설정" : "기본설정"}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{selectedOrders.size}개 세그먼트 일괄 설정</p>
                  <Button size="sm" onClick={applyBulkToSelected} disabled={selectedOrders.size === 0}>
                    선택한 {selectedOrders.size}개에 일괄 적용
                  </Button>
                </div>
                <TtsProviderFields value={bulkValue} onChange={setBulkValue} configuredKeys={configuredKeys} />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "요청 중..." : "생성 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
