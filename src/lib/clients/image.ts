import type { VideoFormat } from "@prisma/client";

import { env } from "@/env";
import type { ImageQuality } from "@/lib/image-models";

// OpenAI gpt-image-1을 사용한다. IMAGE_API_KEY는 PROJECT_SPEC.md §0.2에 이미 선언된
// 범용 이미지 생성 키 이름을 그대로 사용한다.
export const IMAGE_MODEL = "gpt-image-1";

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

// 숏폼(9:16)은 세로, 롱폼(16:9)은 가로 이미지로 생성한다.
export function resolveImageSize(videoFormat: VideoFormat): ImageSize {
  return videoFormat === "LONG" ? "1536x1024" : "1024x1536";
}

// UI_SPEC.md §2.3: 채널 기본 프롬프트는 실행 시 각 장면 프롬프트 맨 앞에 자동으로 붙는다.
export function buildImagePrompt(scenePrompt: string, channelPrompt?: string): string {
  return channelPrompt ? `${channelPrompt}. ${scenePrompt}` : scenePrompt;
}

function requireApiKey(): string {
  if (!env.IMAGE_API_KEY) {
    throw new Error("IMAGE_API_KEY가 설정되지 않았습니다. .env를 확인하세요.");
  }
  return env.IMAGE_API_KEY;
}

export async function generateImage(
  prompt: string,
  size: ImageSize,
  quality: ImageQuality = "low",
): Promise<Buffer> {
  const apiKey = requireApiKey();

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size, quality, n: 1 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`이미지 생성 요청 실패: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data: { b64_json: string }[] };
  const b64 = json.data[0]?.b64_json;
  if (!b64) {
    throw new Error("이미지 생성 응답에 이미지 데이터가 없습니다.");
  }

  return Buffer.from(b64, "base64");
}

// PROJECT_SPEC.md §1.3 "이미지 변환": 기존 이미지(들)를 참고 이미지로 넣어 편집·합성한다.
export async function editImage(
  images: Buffer[],
  prompt: string,
  size: ImageSize,
  quality: ImageQuality = "low",
): Promise<Buffer> {
  const apiKey = requireApiKey();

  const form = new FormData();
  form.set("model", IMAGE_MODEL);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", quality);
  for (const image of images) {
    form.append("image[]", new Blob([new Uint8Array(image)], { type: "image/png" }), "image.png");
  }

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`이미지 변환 요청 실패: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data: { b64_json: string }[] };
  const b64 = json.data[0]?.b64_json;
  if (!b64) {
    throw new Error("이미지 변환 응답에 이미지 데이터가 없습니다.");
  }

  return Buffer.from(b64, "base64");
}
