"use client";

import { HelpCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_KEY_GUIDES } from "@/lib/api-key-guides";
import type { EnvKeyStatus } from "@/server/services/env-config.service";

function ApiKeyGuideDialog({
  status,
  open,
  onOpenChange,
}: {
  status: EnvKeyStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const guide = status ? API_KEY_GUIDES[status.key] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{status?.label} 발급 안내</DialogTitle>
        </DialogHeader>
        {guide && (
          <div className="flex flex-col gap-3 text-sm">
            <ol className="list-decimal space-y-2 pl-5">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {guide.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  {link.label} 열기
                </a>
              ))}
            </div>
            {guide.note && <p className="text-xs text-muted-foreground">{guide.note}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysSettingsClient() {
  const [statuses, setStatuses] = useState<EnvKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [everSaved, setEverSaved] = useState(false);
  const [guideKey, setGuideKey] = useState<string | null>(null);

  const fetchStatuses = useCallback(() => {
    setLoading(true);
    fetch("/api/settings/env-keys")
      .then((res) => res.json())
      .then(setStatuses)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const hasPendingRestart = everSaved || statuses.some((s) => s.fileConfigured && !s.runtimeConfigured);

  async function save(key: string, explicitValue?: string) {
    const value = (explicitValue ?? drafts[key] ?? "").trim();
    setSavingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/settings/env-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장하지 못했습니다.");
      setStatuses((prev) => prev.map((s) => (s.key === key ? body : s)));
      setDrafts((prev) => ({ ...prev, [key]: "" }));
      setEverSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">API 키 설정</h1>
        <p className="text-sm text-muted-foreground">
          외부 API 키를 여기서 입력하면 서버의 .env 파일에 저장됩니다. 실제 값은 화면에 다시 표시되지 않고 일부만
          마스킹되어 보여집니다.
        </p>
      </div>

      {hasPendingRestart && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">변경사항을 적용하려면 개발 서버를 재시작하세요.</p>
          <p className="mt-1 text-xs text-amber-800">
            .env 파일은 서버가 시작될 때 한 번만 읽히기 때문에, 저장 직후에는 지금 실행 중인 서버에 반영되지
            않습니다.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-amber-100 p-2 text-xs">
            {"lsof -ti :3000 | xargs kill\nnpm run dev"}
          </pre>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {statuses.map((status) => (
            <div key={status.key} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div>
                    <Label htmlFor={`env-${status.key}`}>{status.label}</Label>
                    <p className="text-xs text-muted-foreground">{status.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGuideKey(status.key)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`${status.label} 발급 안내`}
                  >
                    <HelpCircle className="size-4" />
                  </button>
                </div>
                <div className="flex gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status.fileConfigured ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status.fileConfigured ? `파일: ${status.fileMaskedValue}` : "파일: 미설정"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status.runtimeConfigured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {status.runtimeConfigured ? "서버: 적용됨" : "서버: 재시작 필요"}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  id={`env-${status.key}`}
                  type="password"
                  placeholder={status.fileConfigured ? "새 값으로 변경하려면 입력" : "값을 입력하세요"}
                  value={drafts[status.key] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [status.key]: e.target.value }))}
                />
                <Button
                  variant="outline"
                  disabled={savingKey === status.key || !(drafts[status.key] ?? "").trim()}
                  onClick={() => save(status.key)}
                >
                  {savingKey === status.key ? "저장 중..." : "저장"}
                </Button>
                {status.fileConfigured && (
                  <Button
                    variant="ghost"
                    disabled={savingKey === status.key}
                    onClick={() => {
                      setDrafts((prev) => ({ ...prev, [status.key]: "" }));
                      save(status.key, "");
                    }}
                  >
                    지우기
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ApiKeyGuideDialog
        status={statuses.find((s) => s.key === guideKey) ?? null}
        open={guideKey !== null}
        onOpenChange={(open) => !open && setGuideKey(null)}
      />
    </div>
  );
}
