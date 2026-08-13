import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "@/env";

const execFileAsync = promisify(execFile);

// yt-dlp 실행 파일(미지정 시 PATH의 yt-dlp). PO-Token 방어 우회를 위해 nightly 경로를 env로 지정할 수 있다.
const YTDLP_BIN = env.YTDLP_PATH ?? "yt-dlp";

// yt-dlp가 ffmpeg를 못 찾는 문제(특히 PATH의 ffmpeg가 깨진 경우)를 피하려고, 앱이 쓰는 FFMPEG_PATH가 있으면
// 그 디렉터리를 --ffmpeg-location으로 넘긴다. 쿠키 브라우저가 설정돼 있으면 인증 쿠키도 함께 넘긴다(403 우회).
function commonArgs(): string[] {
  const args: string[] = [];
  if (env.FFMPEG_PATH) args.push("--ffmpeg-location", path.dirname(env.FFMPEG_PATH));
  if (env.YTDLP_COOKIES_FROM_BROWSER) args.push("--cookies-from-browser", env.YTDLP_COOKIES_FROM_BROWSER);
  return args;
}

// yt-dlp 실패(403/PO-Token/추출 실패 등)를 사용자가 이해할 수 있는 한국어 메시지로 감싼다.
function wrapYtDlpError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  if (/403|Forbidden|PO Token|po_token|Sign in to confirm|unable to download video data/i.test(raw)) {
    return new Error(
      "영상 다운로드가 YouTube에 의해 차단되었습니다(403/PO-Token). yt-dlp를 최신 nightly로 올리거나(YTDLP_PATH), " +
        "로그인된 브라우저 쿠키(YTDLP_COOKIES_FROM_BROWSER)를 설정한 뒤 다시 시도해주세요. 원본: " +
        raw.slice(0, 300),
    );
  }
  if (/ffmpeg is not installed|ffmpeg exited/i.test(raw)) {
    return new Error("ffmpeg 실행에 실패했습니다. FFMPEG_PATH가 올바른(정상 동작하는) ffmpeg를 가리키는지 확인해주세요. 원본: " + raw.slice(0, 300));
  }
  return error instanceof Error ? error : new Error(raw);
}

export type YtDlpEntry = {
  id: string;
  title: string;
  durationSec: number | null;
};

// PROJECT_SPEC.md §1.3 "BGM 설정": 브금대통령 채널의 영상 목록만 가볍게 조회한다
// (--flat-playlist는 각 영상을 열지 않고 메타데이터만 가져와 빠르다).
export async function fetchChannelEntries(channelUrl: string, maxVideos: number): Promise<YtDlpEntry[]> {
  const { stdout } = await execFileAsync(YTDLP_BIN, [
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
  try {
    await execFileAsync(
      YTDLP_BIN,
      [...commonArgs(), "-x", "--audio-format", "mp3", "--audio-quality", "192K", "-o", outPath, videoUrl],
      { timeout: 120_000 },
    );
  } catch (error) {
    throw wrapYtDlpError(error);
  }
}

const VIDEO_FORMAT = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 3)": 원본 영상을 mp4로 받아 outPath에 저장한다.
// 대상 영상 권리는 사용자 책임(§2.5 원칙 개정) — 본인/라이선스 채널 사용을 전제로 한다.
export async function downloadVideo(videoUrl: string, outPath: string): Promise<void> {
  try {
    await execFileAsync(
      YTDLP_BIN,
      [...commonArgs(), "-f", VIDEO_FORMAT, "--merge-output-format", "mp4", "-o", outPath, videoUrl],
      { timeout: 300_000 },
    );
  } catch (error) {
    throw wrapYtDlpError(error);
  }
}

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 3)": 하이라이트 구간만 내려받는다. 긴 원본(예: 수 시간
// 생중계)을 통째로 받으면 타임아웃·수 GB가 되므로, --download-sections로 [startSec, startSec+durationSec]
// 구간만 받아 outPath에 저장한다(yt-dlp 내부적으로 ffmpeg가 해당 범위를 잘라낸다).
export async function downloadVideoSection(
  videoUrl: string,
  startSec: number,
  durationSec: number,
  outPath: string,
): Promise<void> {
  const start = Math.max(0, startSec);
  const end = start + Math.max(0.1, durationSec);
  try {
    await execFileAsync(
      YTDLP_BIN,
      [
        ...commonArgs(),
        "-f",
        VIDEO_FORMAT,
        "--download-sections",
        `*${start}-${end}`,
        "--merge-output-format",
        "mp4",
        "-o",
        outPath,
        videoUrl,
      ],
      { timeout: 180_000 },
    );
  } catch (error) {
    throw wrapYtDlpError(error);
  }
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
      YTDLP_BIN,
      [
        ...commonArgs(),
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
