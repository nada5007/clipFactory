import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getAudioDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
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

  await execFileAsync("ffmpeg", [
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
  perImageDurationSec: number,
  width: number,
  height: number,
  listFilePath: string,
  outputPath: string,
): Promise<void> {
  const lines: string[] = [];
  for (const imagePath of imagePaths) {
    lines.push(`file ${quoteConcatPath(imagePath)}`);
    lines.push(`duration ${perImageDurationSec}`);
  }
  // concat demuxer는 마지막 항목의 duration을 무시하므로 마지막 파일을 한 번 더 반복해야 한다.
  lines.push(`file ${quoteConcatPath(imagePaths[imagePaths.length - 1])}`);
  await fs.writeFile(listFilePath, lines.join("\n"), "utf-8");

  await execFileAsync("ffmpeg", [
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
  await execFileAsync("ffmpeg", [
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
