import type { VideoFormat } from "@prisma/client";

import { env } from "@/env";

// OpenAI gpt-image-1 하나만 연결한다 (개인용 재현 범위 — UI_SPEC의 다수 모델 레지스트리는
// 채널 설정 이미지 탭을 구현할 때 확장). IMAGE_API_KEY는 PROJECT_SPEC.md §0.2에 이미 선언된
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

export async function generateImage(prompt: string, size: ImageSize): Promise<Buffer> {
  const apiKey = requireApiKey();

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size, n: 1 }),
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
