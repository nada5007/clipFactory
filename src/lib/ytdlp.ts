import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type YtDlpEntry = {
  id: string;
  title: string;
  durationSec: number | null;
};

// PROJECT_SPEC.md §1.3 "BGM 설정": 브금대통령 채널의 영상 목록만 가볍게 조회한다
// (--flat-playlist는 각 영상을 열지 않고 메타데이터만 가져와 빠르다).
export async function fetchChannelEntries(channelUrl: string, maxVideos: number): Promise<YtDlpEntry[]> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--flat-playlist",
    "--dump-single-json",
    "--playlist-end",
    String(maxVideos),
    channelUrl,
  ]);

  const data = JSON.parse(stdout) as { entries?: { id: string; title?: string; duration?: number }[] };
  return (data.entries ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title ?? "",
    durationSec: typeof entry.duration === "number" ? Math.round(entry.duration) : null,
  }));
}

// 영상 오디오만 mp3로 추출해 outPath에 저장한다.
export async function downloadAudioAsMp3(videoUrl: string, outPath: string): Promise<void> {
  await execFileAsync(
    "yt-dlp",
    ["-x", "--audio-format", "mp3", "--audio-quality", "192K", "-o", outPath, videoUrl],
    { timeout: 120_000 },
  );
}
