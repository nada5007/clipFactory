"use client";

import { Check, Copy, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GenerateScriptForm } from "@/components/projects/detail/generate-script-form";
import { RegenerateFieldDialog } from "@/components/projects/detail/regenerate-field-dialog";
import { formatDateKo } from "@/lib/format";
import { scriptTopicStorageKey } from "@/lib/script-topic-injection";
import type { ScriptField } from "@/lib/script-fields";
import type { SerializedScript } from "@/types/project";

const IMAGE_PROMPT_MAX_COUNT = 900;

type GenerateInput = {
  topic: string;
  durationSeconds: number;
  imagePromptCount: number;
  includeChannelPrompt: boolean;
};

function CardHeaderActions({
  onEdit,
  onRegenerate,
  onCopy,
}: {
  onEdit?: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {onEdit && (
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} title="수정">
          <Pencil className="size-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-7" onClick={onRegenerate} title="재생성">
        <RefreshCw className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => {
          onCopy();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        title="복사"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function EditableField({
  label,
  value,
  multiline,
  onSave,
  onRegenerate,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onSave: (next: string) => Promise<void>;
  onRegenerate: () => void;
  onCopy: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between rounded-t-lg bg-accent px-4 py-2">
        <span className="text-sm font-medium text-accent-foreground">{label}</span>
        {!editing && (
          <CardHeaderActions onEdit={() => setEditing(true)} onRegenerate={onRegenerate} onCopy={onCopy} />
        )}
      </div>
      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            {multiline ? (
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} />
            ) : (
              <input
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={saving || draft.trim().length === 0}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(draft);
                    setEditing(false);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                저장
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{value}</p>
        )}
      </div>
    </div>
  );
}

function ImagePromptsCard({
  prompts,
  onSave,
  onRegenerate,
  onCopy,
}: {
  prompts: string[];
  onSave: (next: string[]) => Promise<void>;
  onRegenerate: () => void;
  onCopy: () => void;
}) {
  const [drafts, setDrafts] = useState(prompts);
  const [addCount, setAddCount] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(prompts);
  }, [prompts]);

  const dirty = JSON.stringify(drafts) !== JSON.stringify(prompts);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between rounded-t-lg bg-accent px-4 py-2">
        <span className="text-sm font-medium text-accent-foreground">이미지 프롬프트 ({drafts.length}개)</span>
        <CardHeaderActions onRegenerate={onRegenerate} onCopy={onCopy} />
      </div>
      <div className="flex flex-col gap-3 p-4">
        {drafts.map((prompt, i) => (
          <div key={i} className="space-y-1 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                #{i + 1}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-destructive"
                title="삭제"
                onClick={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) =>
                setDrafts((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
              }
              rows={3}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              나노바나나 시리즈(표준/고속/프로)는 한글 프롬프트를 지원합니다.
            </p>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={IMAGE_PROMPT_MAX_COUNT}
              value={addCount}
              onChange={(e) => setAddCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-16"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDrafts((prev) => [
                  ...prev,
                  ...Array.from({ length: addCount }, () => ""),
                ])
              }
            >
              <Plus className="mr-1 size-3.5" />
              프롬프트 추가
            </Button>
            <span className="text-xs text-muted-foreground">
              ({drafts.length}/{IMAGE_PROMPT_MAX_COUNT})
            </span>
          </div>

          {dirty && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDrafts(prompts)}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(drafts.filter((p) => p.trim().length > 0));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                저장
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ScriptPanel({ projectId }: { projectId: string }) {
  const [script, setScript] = useState<SerializedScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectedTopic, setInjectedTopic] = useState<string | undefined>(undefined);
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());
  const [regenerateField, setRegenerateField] = useState<ScriptField | null>(null);

  useEffect(() => {
    const key = scriptTopicStorageKey(projectId);
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setInjectedTopic(stored);
      sessionStorage.removeItem(key);
    }
  }, [projectId]);

  useEffect(() => {
    fetch("/api/settings/env-keys")
      .then((res) => res.json())
      .then((statuses: { key: string; runtimeConfigured: boolean; fileConfigured: boolean }[]) => {
        setConfiguredKeys(
          new Set(statuses.filter((s) => s.runtimeConfigured || s.fileConfigured).map((s) => s.key)),
        );
      })
      .catch(() => setConfiguredKeys(new Set()));
  }, []);

  const fetchScript = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/script`)
      .then(async (res) => {
        if (res.status === 404) {
          setScript(null);
          return;
        }
        setScript(await res.json());
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchScript();
  }, [fetchScript]);

  async function generate(input: GenerateInput) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "스크립트 생성에 실패했습니다.");
      }
      setScript(await res.json());
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "스크립트 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveField(field: "title" | "hook" | "body", value: string) {
    const res = await fetch(`/api/projects/${projectId}/script`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setScript(await res.json());
  }

  async function saveImagePrompts(prompts: string[]) {
    const res = await fetch(`/api/projects/${projectId}/script`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagePrompts: prompts }),
    });
    setScript(await res.json());
  }

  async function submitRegenerateField(
    field: ScriptField,
    input: { customPrompt?: string; modelId: string },
  ) {
    const res = await fetch(`/api/projects/${projectId}/script/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, ...input }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "재생성에 실패했습니다.");
    }
    setScript(await res.json());
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</div>;
  }

  if (!script || showForm) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {script ? "스크립트 재생성" : "새 스크립트 생성"}
        </h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <GenerateScriptForm
          initialTopic={script?.topic ?? injectedTopic}
          submitting={generating}
          submitLabel={script ? "재생성" : "대본 생성"}
          onSubmit={generate}
        />
        {script && (
          <Button variant="outline" onClick={() => setShowForm(false)} disabled={generating}>
            취소
          </Button>
        )}
      </div>
    );
  }

  const FIELD_DIALOG_TITLES: Record<ScriptField, string> = {
    title: "제목 재생성",
    hook: "후킹멘트 재생성",
    body: "대본 재생성",
    imagePrompts: "이미지 프롬프트 재생성",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">스크립트 관리</h2>
          <p className="text-xs text-muted-foreground">생성일: {formatDateKo(script.createdAt)}</p>
        </div>
        <Button variant="outline" onClick={() => setShowForm(true)}>
          전체 스크립트 재생성
        </Button>
      </div>

      <EditableField
        label="제목"
        value={script.title}
        onSave={(v) => saveField("title", v)}
        onRegenerate={() => setRegenerateField("title")}
        onCopy={() => navigator.clipboard.writeText(script.title)}
      />
      <EditableField
        label="후킹멘트"
        value={script.hook}
        onSave={(v) => saveField("hook", v)}
        onRegenerate={() => setRegenerateField("hook")}
        onCopy={() => navigator.clipboard.writeText(script.hook)}
      />
      <EditableField
        label="대본"
        value={script.body}
        multiline
        onSave={(v) => saveField("body", v)}
        onRegenerate={() => setRegenerateField("body")}
        onCopy={() => navigator.clipboard.writeText(script.body)}
      />

      <ImagePromptsCard
        prompts={script.imagePrompts}
        onSave={saveImagePrompts}
        onRegenerate={() => setRegenerateField("imagePrompts")}
        onCopy={() => navigator.clipboard.writeText(script.imagePrompts.join("\n\n"))}
      />

      <p className="text-right text-xs text-muted-foreground">✓ 생성 완료 ({script.model})</p>

      {regenerateField && (
        <RegenerateFieldDialog
          open
          onOpenChange={(open) => !open && setRegenerateField(null)}
          title={FIELD_DIALOG_TITLES[regenerateField]}
          configuredKeys={configuredKeys}
          onRegenerate={(input) => submitRegenerateField(regenerateField, input)}
        />
      )}
    </div>
  );
}
