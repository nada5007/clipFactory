"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateKo } from "@/lib/format";
import {
  composeTopicFromSavedItem,
  type ChannelSnapshot,
  type IdeaSnapshot,
  type VideoSnapshot,
} from "@/lib/saved-item-topic";
import { scriptTopicStorageKey } from "@/lib/script-topic-injection";
import { cn } from "@/lib/utils";

const numberFormat = new Intl.NumberFormat("ko-KR");

type SavedItemType = "VIDEO" | "CHANNEL" | "IDEA";

type SavedItem = {
  id: string;
  type: SavedItemType;
  snapshotJson: unknown;
  note: string | null;
  createdAt: string;
};

type StudioChannel = { id: string; name: string };

const TYPE_TABS: { value: SavedItemType | "ALL"; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "VIDEO", label: "영상" },
  { value: "CHANNEL", label: "채널" },
  { value: "IDEA", label: "아이디어" },
];

function SavedItemSummary({ item }: { item: SavedItem }) {
  if (item.type === "VIDEO") {
    const s = item.snapshotJson as VideoSnapshot;
    return (
      <>
        <p className="line-clamp-2 text-sm font-medium">{s.title}</p>
        <p className="text-xs text-muted-foreground">
          {s.channelTitle} · 조회수 {numberFormat.format(s.viewCount)}회{s.ratio ? ` · ${s.ratio.toFixed(1)}배 떡상` : ""}
        </p>
      </>
    );
  }
  if (item.type === "CHANNEL") {
    const s = item.snapshotJson as ChannelSnapshot;
    return (
      <>
        <p className="text-sm font-medium">{s.title}</p>
        <p className="text-xs text-muted-foreground">
          구독자 {numberFormat.format(s.subscriberCount)}명 · 영상 {numberFormat.format(s.videoCount)}개
        </p>
      </>
    );
  }
  const s = item.snapshotJson as IdeaSnapshot;
  return (
    <>
      <p className="line-clamp-2 text-sm font-medium">{s.title}</p>
      <p className="line-clamp-1 text-xs text-muted-foreground">훅: {s.hook}</p>
    </>
  );
}

const TYPE_BADGE_LABEL: Record<SavedItemType, string> = { VIDEO: "영상", CHANNEL: "채널", IDEA: "아이디어" };

export function SavedItemsClient() {
  const router = useRouter();
  const [type, setType] = useState<SavedItemType | "ALL">("ALL");
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<StudioChannel[]>([]);
  const [creatingForId, setCreatingForId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = type === "ALL" ? "" : `?type=${type}`;
    fetch(`/api/saved-items${params}`)
      .then((res) => res.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetch("/api/channels")
      .then((res) => res.json())
      .then(setChannels);
  }, []);

  const removeItem = async (id: string) => {
    await fetch(`/api/saved-items/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const startCreateProject = (id: string) => {
    setCreatingForId(id);
    setSelectedChannelId(channels[0]?.id ?? "");
    setCreateError(null);
  };

  const confirmCreateProject = async (item: SavedItem) => {
    if (!selectedChannelId) {
      setCreateError("채널을 선택하세요.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const titleSource =
        item.type === "VIDEO"
          ? (item.snapshotJson as VideoSnapshot).title
          : item.type === "CHANNEL"
            ? (item.snapshotJson as ChannelSnapshot).title
            : (item.snapshotJson as IdeaSnapshot).title;

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannelId, title: titleSource.slice(0, 100) }),
      });
      const project = await res.json();
      if (!res.ok) throw new Error(project.error ?? "프로젝트를 생성하지 못했습니다.");

      const topic = composeTopicFromSavedItem({ type: item.type, snapshot: item.snapshotJson } as Parameters<
        typeof composeTopicFromSavedItem
      >[0]);
      sessionStorage.setItem(scriptTopicStorageKey(project.id), topic);
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "프로젝트를 생성하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">저장됨</h2>
        <p className="text-sm text-muted-foreground">저장한 영상·채널·아이디어에서 바로 대본을 생성할 수 있습니다</p>
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
        {TYPE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              type === t.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">저장된 항목이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {TYPE_BADGE_LABEL[item.type]}
              </span>
              <SavedItemSummary item={item} />
              {item.note && <p className="text-xs text-muted-foreground">메모: {item.note}</p>}
              <p className="text-xs text-muted-foreground">{formatDateKo(item.createdAt)}</p>

              {creatingForId === item.id ? (
                <div className="flex flex-col gap-2 border-t pt-2">
                  <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="채널 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {createError && <p className="text-xs text-destructive">{createError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={creating} onClick={() => confirmCreateProject(item)}>
                      {creating ? "생성 중..." : "확인"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCreatingForId(null)} disabled={creating}>
                      취소
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 border-t pt-2">
                  <Button size="sm" onClick={() => startCreateProject(item.id)}>
                    대본 생성
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => removeItem(item.id)}>
                    삭제
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
