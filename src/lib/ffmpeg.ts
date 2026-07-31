import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "@/env";

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE_BIN = env.FFPROBE_PATH ?? "ffprobe";

export async function getAudioDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const seconds = Number.parseFloat(stdout.trim());
  return Math.round(seconds * 1000);
}

// ffmpeg concat demuxer의 file 지시자에 안전하게 넣기 위해 작은따옴표를 이스케이프한다.
function quoteConcatPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`;
}

export async function concatAudioFiles(
  inputPaths: string[],
  listFilePath: string,
  outputPath: string,
): Promise<void> {
  const list = inputPaths.map((p) => `file ${quoteConcatPath(p)}`).join("\n");
  await fs.writeFile(listFilePath, list, "utf-8");

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFilePath,
    "-c",
    "copy",
    outputPath,
  ]);
}

// VIDEO/IMAGE 멀티트랙 우선순위 합성(computeVisualRenderSegments)의 세그먼트 하나를 목표 해상도로
// 정규화한 정지 이미지 클립으로 만든다. extraFilters(색보정 등)는 scale/pad 뒤, format 앞에 끼워넣는다.
export async function buildImageSegmentClip(
  imagePath: string,
  durationSec: number,
  width: number,
  height: number,
  outputPath: string,
  extraFilters?: string,
): Promise<void> {
  const vf = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    ...(extraFilters ? [extraFilters] : []),
    "format=yuv420p",
  ].join(",");

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-t",
    String(durationSec),
    "-vf",
    vf,
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

// 위와 동일한 세그먼트 정규화를, VIDEO 클립은 원본에서 [offsetSec, offsetSec+durationSec] 구간만
// 트림해서 만든다. 오디오는 버린다(-an) — 최종 음성은 TTS/BGM 트랙에서 별도로 합성한다.
export async function buildVideoSegmentClip(
  videoPath: string,
  offsetSec: number,
  durationSec: number,
  width: number,
  height: number,
  outputPath: string,
  extraFilters?: string,
): Promise<void> {
  const vf = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    ...(extraFilters ? [extraFilters] : []),
    "format=yuv420p",
  ].join(",");

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-ss",
    String(offsetSec),
    "-i",
    videoPath,
    "-t",
    String(durationSec),
    "-vf",
    vf,
    "-r",
    "30",
    "-an",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

// buildImageSegmentClip/buildVideoSegmentClip으로 정규화(동일 해상도/프레임레이트/픽셀포맷)해 만든
// 세그먼트들을 순서대로 이어붙인다. 모두 같은 설정으로 인코딩됐으므로 -c copy로 빠르게 합칠 수 있다.
export async function concatVideoSegments(
  segmentPaths: string[],
  listFilePath: string,
  outputPath: string,
): Promise<void> {
  const list = segmentPaths.map((p) => `file ${quoteConcatPath(p)}`).join("\n");
  await fs.writeFile(listFilePath, list, "utf-8");

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFilePath,
    "-c",
    "copy",
    outputPath,
  ]);
}

// BGM 트랙 원본을 볼륨/재생속도(atempo)를 적용하고 타임라인 길이에 맞춰(루프 또는 무음 패딩) 가공한다.
export async function prepareBgmAudio(
  bgmPath: string,
  options: { volumeLinear: number; playbackSpeed: number; loop: boolean },
  totalDurationSec: number,
  outputPath: string,
): Promise<void> {
  const af = [`volume=${options.volumeLinear}`, `atempo=${options.playbackSpeed}`, ...(options.loop ? [] : ["apad"])].join(
    ",",
  );
  const args = ["-y"];
  if (options.loop) args.push("-stream_loop", "-1");
  args.push("-i", bgmPath, "-af", af, "-t", String(totalDurationSec), "-c:a", "libmp3lame", outputPath);
  await execFileAsync(FFMPEG_BIN, args);
}

// TTS 음성 트랙과 가공된 BGM을 하나의 오디오로 섞는다. normalize=0으로 amix가 각 입력 볼륨을
// 자동으로 낮추지 않게 해, 이미 확정된 TTS 음량이 BGM 믹싱 여부와 무관하게 유지되도록 한다.
export async function mixAudioTracks(voicePath: string, bgmPath: string, outputPath: string): Promise<void> {
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-i",
    voicePath,
    "-i",
    bgmPath,
    "-filter_complex",
    "[0:a][1:a]amix=inputs=2:duration=first:normalize=0",
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}

export async function muxVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    outputPath,
  ]);
}

// TTS 클립이 트림(트림-시작/트림-끝)된 경우 원본 오디오에서 [offsetSec, offsetSec+durationSec] 구간만 뽑아낸다.
// 트림으로 원본보다 길게 늘어난 구간(이웃이 삭제되며 생긴 여백으로 확장한 경우)은 무음으로 채운다(apad).
export async function trimOrPadAudioToDuration(
  inputPath: string,
  offsetSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-ss",
    String(offsetSec),
    "-i",
    inputPath,
    "-af",
    "apad",
    "-t",
    String(durationSec),
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}

// TTS 클립 사이의 빈 구간(트림/삭제로 발생)을 무음으로 채워 오디오 트랙 전체 길이를 타임라인과 맞춘다.
export async function generateSilence(durationSec: number, outputPath: string): Promise<void> {
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-t",
    String(durationSec),
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}

// 업로드한 비디오 클립의 오디오만 뽑아 "비디오 오디오" 트랙에 자동으로 추가하기 위해 쓴다.
// 오디오 스트림이 없는 영상(무음 영상 등)이면 ffmpeg가 실패하는데, 이 경우 조용히 false를 반환해
// 호출하는 쪽에서 "오디오 트랙 자동 추가"만 건너뛰고 비디오 업로드 자체는 계속 진행할 수 있게 한다.
export async function extractAudioTrack(videoPath: string, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync(FFMPEG_BIN, ["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-q:a", "2", outputPath]);
    return true;
  } catch {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    return false;
  }
}

// ffmpeg-full(libass 포함) 빌드가 필요하다 — 기본 ffmpeg 포뮬러에는 ass/subtitles 필터가 없다.
export async function burnSubtitles(inputVideoPath: string, assPath: string, outputPath: string): Promise<void> {
  const dir = path.dirname(assPath);
  const fileName = path.basename(assPath);
  // ass 필터 인자의 콜론/경로 이스케이핑 문제를 피하기 위해 ass 파일이 있는 디렉터리로 cwd를 옮기고
  // 파일명만 넘긴다.
  await execFileAsync(
    FFMPEG_BIN,
    ["-y", "-i", inputVideoPath, "-vf", `ass=${fileName}`, "-c:a", "copy", outputPath],
    { cwd: dir },
  );
}
