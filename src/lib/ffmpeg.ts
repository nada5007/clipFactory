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

export async function buildImageSlideshow(
  imagePaths: string[],
  durationsSec: number[],
  width: number,
  height: number,
  listFilePath: string,
  outputPath: string,
): Promise<void> {
  const lines: string[] = [];
  imagePaths.forEach((imagePath, i) => {
    lines.push(`file ${quoteConcatPath(imagePath)}`);
    lines.push(`duration ${durationsSec[i]}`);
  });
  // concat demuxer는 마지막 항목의 duration을 무시하므로 마지막 파일을 한 번 더 반복해야 한다.
  lines.push(`file ${quoteConcatPath(imagePaths[imagePaths.length - 1])}`);
  await fs.writeFile(listFilePath, lines.join("\n"), "utf-8");

  // concat demuxer가 이 "반복된 마지막 파일" 경계 항목을 자체 duration을 가진 세그먼트로 취급해
  // 실제 합보다 한 구간 더 길게(직전 항목 길이만큼) 뽑아내는 경우가 있어, -t로 정확한 총 길이를 강제한다.
  const totalDurationSec = durationsSec.reduce((sum, d) => sum + d, 0);

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFilePath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-r",
    "30",
    "-t",
    String(totalDurationSec),
    "-pix_fmt",
    "yuv420p",
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
