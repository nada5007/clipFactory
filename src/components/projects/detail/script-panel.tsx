"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GenerateScriptForm } from "@/components/projects/detail/generate-script-form";
import { formatDateKo } from "@/lib/format";
import { scriptTopicStorageKey } from "@/lib/script-topic-injection";
import type { SerializedScript } from "@/types/project";

type GenerateInput = {
  topic: string;
  durationSeconds: number;
  imagePromptCount: number;
  includeChannelPrompt: boolean;
};

function EditableField({
  label,
  value,
  multiline,
  onSave,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onSave: (next: string) => Promise<void>;
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
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            수정
          </Button>
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

export function ScriptPanel({ projectId }: { projectId: string }) {
  const [script, setScript] = useState<SerializedScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectedTopic, setInjectedTopic] = useState<string | undefined>(undefined);

  useEffect(() => {
    const key = scriptTopicStorageKey(projectId);
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setInjectedTopic(stored);
      sessionStorage.removeItem(key);
    }
  }, [projectId]);

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

      <EditableField label="제목" value={script.title} onSave={(v) => saveField("title", v)} />
      <EditableField label="후킹멘트" value={script.hook} onSave={(v) => saveField("hook", v)} />
      <EditableField
        label="대본"
        value={script.body}
        multiline
        onSave={(v) => saveField("body", v)}
      />

      <div className="rounded-lg border bg-card">
        <div className="rounded-t-lg bg-accent px-4 py-2">
          <span className="text-sm font-medium text-accent-foreground">
            이미지 프롬프트 ({script.imagePrompts.length}개)
          </span>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {script.imagePrompts.map((prompt, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <Badge variant="secondary" className="shrink-0">
                #{i + 1}
              </Badge>
              <p className="text-muted-foreground">{prompt}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-right text-xs text-muted-foreground">✓ 생성 완료 ({script.model})</p>
    </div>
  );
}
