import { env } from "@/env";
import type { ImageTransformRatio, ImageTransformResolution } from "@/lib/image-models";

function requireApiKey(): string {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다. 채널 설정 > API 키 관리에서 등록하세요.");
  }
  return env.GEMINI_API_KEY;
}

export type NanoBananaImageConfig = {
  aspectRatio?: ImageTransformRatio;
  imageSize?: ImageTransformResolution;
};

type GeminiImagePart = { inlineData?: { mimeType?: string; data?: string } };
type GeminiGenerateContentResponse = {
  candidates?: { content?: { parts?: GeminiImagePart[] } }[];
};

function extractImageBuffer(data: GeminiGenerateContentResponse): Buffer {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Nano Banana 응답에서 이미지 데이터를 찾지 못했습니다.");
  }
  return Buffer.from(imagePart.inlineData.data, "base64");
}

async function callGenerateContent(
  modelId: string,
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[],
  config?: NanoBananaImageConfig,
): Promise<Buffer> {
  const apiKey = requireApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: config?.aspectRatio || config?.imageSize ? { imageConfig: config } : undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nano Banana API 호출 실패 (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiGenerateContentResponse;
  return extractImageBuffer(data);
}

// PROJECT_SPEC.md §1.3 "이미지 탭 전체 확장": Nano Banana(표준형)/Nano Banana Pro(고급형)로 신규 이미지를 생성한다.
export function generateImageWithNanoBanana(
  modelId: string,
  prompt: string,
  config?: NanoBananaImageConfig,
): Promise<Buffer> {
  return callGenerateContent(modelId, [{ text: prompt }], config);
}

// "이미지 변환": 소스 이미지(최대 5개)를 함께 넣어 합성·편집한다.
export function editImageWithNanoBanana(
  modelId: string,
  images: Buffer[],
  prompt: string,
  config?: NanoBananaImageConfig,
): Promise<Buffer> {
  const imageParts = images.map((image) => ({
    inlineData: { mimeType: "image/png", data: image.toString("base64") },
  }));
  return callGenerateContent(modelId, [...imageParts, { text: prompt }], config);
}
