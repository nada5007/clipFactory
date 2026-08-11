import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 2)": 영상은 받지 않고(--skip-download) 자동자막/업로드
// 자막만 vtt로 받아 그 텍스트를 반환한다. 자막이 없으면 null(호출부에서 STT 또는 수동 붙여넣기로 폴백).
// 자막 언어는 우선순위 목록으로 지정하고, 없으면 전체(all)에서 처음 받은 vtt를 쓴다.
export async function fetchAutoSubtitles(
  videoUrl: string,
  langs: string[] = ["ko", "en"],
): Promise<string | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clipfactory-subs-"));
  const outTemplate = path.join(dir, "sub.%(ext)s");
  try {
    await execFileAsync(
      "yt-dlp",
      [
        "--skip-download",
        "--write-auto-sub",
        "--write-sub",
        "--sub-langs",
        [...langs, "-live_chat"].join(","),
        "--sub-format",
        "vtt",
        "-o",
        outTemplate,
        videoUrl,
      ],
      { timeout: 60_000 },
    );

    const files = await fs.readdir(dir);
    const vtt = files.find((f) => f.endsWith(".vtt"));
    if (!vtt) return null;
    return await fs.readFile(path.join(dir, vtt), "utf-8");
  } catch {
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
