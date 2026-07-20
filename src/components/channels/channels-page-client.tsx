"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CreateChannelDialog } from "@/components/channels/create-channel-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VIDEO_FORMAT_LABEL } from "@/lib/project-labels";
import type { SerializedChannel } from "@/types/project";

export function ChannelsPageClient() {
  const [channels, setChannels] = useState<SerializedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const fetchChannels = useCallback(() => {
    setLoading(true);
    fetch("/api/channels")
      .then((res) => res.json())
      .then(setChannels)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const oauthError = searchParams.get("oauthError");
  const oauthConnected = searchParams.get("oauthConnected");

  async function disconnect(channelId: string) {
    setDisconnectingId(channelId);
    try {
      await fetch(`/api/channels/${channelId}/oauth/disconnect`, { method: "POST" });
      fetchChannels();
    } finally {
      setDisconnectingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">채널별 설정 관리</h1>
          <p className="text-sm text-muted-foreground">각 채널별로 콘텐츠 생성 설정을 관리합니다</p>
        </div>
        <CreateChannelDialog onCreated={fetchChannels} />
      </div>

      {oauthConnected && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          ✓ YouTube 채널 연결됨
        </p>
      )}
      {oauthError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{oauthError}</p>}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          등록된 채널이 없습니다. &ldquo;새 채널 추가&rdquo;로 채널을 만들어보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <div key={channel.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{channel.name}</h3>
                <Badge variant="secondary">{VIDEO_FORMAT_LABEL[channel.videoFormat]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {channel.youtubeChannelId ? channel.youtubeChannelId : "YouTube 채널 미연동"}
              </p>

              {channel.oauthConnectedAt ? (
                <div className="flex items-center justify-between rounded-md bg-green-50 px-2 py-1.5">
                  <span className="text-xs text-green-700">● 연결됨</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disconnectingId === channel.id}
                    onClick={() => disconnect(channel.id)}
                  >
                    연결 해제
                  </Button>
                </div>
              ) : (
                <Button size="sm" asChild>
                  <a href={`/api/channels/${channel.id}/oauth/start`}>YouTube 계정 간편 연결</a>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        스크립트 · 이미지 · TTS/BGM · 영상 설정 · 업로드 상세 설정 탭은 다음 단계에서 제공됩니다.
      </div>
    </div>
  );
}
