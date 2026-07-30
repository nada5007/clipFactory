import { getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { ensureProjectDir, resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import { addUploadedMediaClip } from "@/server/services/timeline.service";

export type MediaKind = "video" | "image" | "audio";

const ALLOWED_MIME: Record<MediaKind, Record<string, string>> = {
  video: { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" },
  image: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
  audio: { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav" },
};

// UI_SPEC.md §5.4 캡처 기준(비디오 500MB/1개, 이미지 10MB) — 오디오는 참조 캡처가 없어 보수적으로 50MB.
const MAX_BYTES: Record<MediaKind, number> = {
  video: 500 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
};

export function getUploadedMedia(id: string) {
  return prisma.uploadedMedia.findUniqueOrThrow({ where: { id } });
}

// "트랙에 클립 추가 > 직접 업로드": 파일을 프로젝트 스토리지에 저장하고 UploadedMedia 레코드를 만든다.
// 타임라인 클립 생성은 별도(timeline.service.ts의 addUploadedMediaClip)에서 담당한다.
export async function uploadMedia(
  projectId: string,
  kind: MediaKind,
  file: { buffer: Buffer; mimeType: string },
) {
  const ext = ALLOWED_MIME[kind][file.mimeType];
  if (!ext) {
    throw new Error(`지원하지 않는 파일 형식입니다 (${file.mimeType}).`);
  }
  if (file.buffer.byteLength > MAX_BYTES[kind]) {
    throw new Error(`파일이 너무 큽니다 (최대 ${Math.round(MAX_BYTES[kind] / 1024 / 1024)}MB).`);
  }

  await ensureProjectDir(projectId, "uploads");
  const fileName = `uploads/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await writeProjectFile(projectId, fileName, file.buffer);

  let durationMs: number | null = null;
  if (kind === "video" || kind === "audio") {
    durationMs = await getAudioDurationMs(resolveProjectFilePath(projectId, fileName));
  }

  return prisma.uploadedMedia.create({
    data: { projectId, kind, filePath: fileName, durationMs },
  });
}

const TRACK_TYPE_TO_MEDIA_KIND: Partial<Record<string, MediaKind>> = {
  VIDEO: "video",
  IMAGE: "image",
  TTS: "audio",
  AUDIO: "audio",
  BGM: "audio",
  SFX: "audio",
};

// "트랙에 클립 추가 > 직접 업로드" 한 번의 API 호출로 처리: 트랙 타입으로 미디어 종류를 정하고,
// 파일을 저장한 뒤 그 자리에 타임라인 클립까지 만든다. SUBTITLE 트랙은 텍스트 전용이라 업로드 대상이 아니다.
export async function uploadMediaToTrack(projectId: string, trackId: string, atMs: number, file: { buffer: Buffer; mimeType: string; name: string }) {
  const track = await prisma.timelineTrack.findUniqueOrThrow({ where: { id: trackId } });
  const kind = TRACK_TYPE_TO_MEDIA_KIND[track.type];
  if (!kind) {
    throw new Error(`${track.type} 트랙에는 파일을 업로드할 수 없습니다.`);
  }

  const media = await uploadMedia(projectId, kind, { buffer: file.buffer, mimeType: file.mimeType });
  return addUploadedMediaClip(trackId, atMs, { id: media.id, kind, durationMs: media.durationMs, label: file.name });
}
