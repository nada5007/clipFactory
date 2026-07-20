import fs from "node:fs/promises";
import path from "node:path";

import { maskSecret } from "@/lib/mask-secret";
import { parseEnvValues, upsertEnvValues } from "@/lib/env-file";

const ENV_PATH = path.join(process.cwd(), ".env");

// PROJECT_SPEC.md §0.2에 정의된 외부 API 키 (DATABASE_URL 등 앱 동작 필수 설정은 대상에서 제외).
export const MANAGED_ENV_KEYS = [
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API 키", description: "스크립트/아이디어 생성" },
  { key: "ELEVENLABS_API_KEY", label: "ElevenLabs API 키", description: "TTS 음성 생성" },
  { key: "IMAGE_API_KEY", label: "OpenAI API 키", description: "이미지 생성 (gpt-image-1)" },
  { key: "YOUTUBE_API_KEY", label: "YouTube Data API 키", description: "유튜브 데이터 분석 (읽기 전용)" },
  { key: "GOOGLE_OAUTH_CLIENT_ID", label: "Google OAuth 클라이언트 ID", description: "YouTube 업로드 인증" },
  { key: "GOOGLE_OAUTH_CLIENT_SECRET", label: "Google OAuth 클라이언트 보안 비밀", description: "YouTube 업로드 인증" },
] as const;

export type ManagedEnvKey = (typeof MANAGED_ENV_KEYS)[number]["key"];

const MANAGED_KEY_SET = new Set<string>(MANAGED_ENV_KEYS.map((k) => k.key));

export type EnvKeyStatus = {
  key: ManagedEnvKey;
  label: string;
  description: string;
  fileConfigured: boolean;
  fileMaskedValue: string;
  runtimeConfigured: boolean;
};

async function readEnvFileContent(): Promise<string> {
  try {
    return await fs.readFile(ENV_PATH, "utf-8");
  } catch {
    return "";
  }
}

export async function getEnvKeyStatuses(): Promise<EnvKeyStatus[]> {
  const fileValues = parseEnvValues(await readEnvFileContent());

  return MANAGED_ENV_KEYS.map(({ key, label, description }) => {
    const fileValue = fileValues[key] ?? "";
    return {
      key,
      label,
      description,
      fileConfigured: fileValue.length > 0,
      fileMaskedValue: maskSecret(fileValue),
      runtimeConfigured: Boolean(process.env[key]),
    };
  });
}

// 저장 직후에는 .env 파일만 갱신된다. 서버 프로세스는 시작 시점에 process.env를 한 번만 읽으므로
// 실제 반영에는 재시작이 필요하다 (UI에서 재시작 안내를 함께 표시한다).
export async function updateEnvKey(key: string, value: string): Promise<EnvKeyStatus> {
  if (!MANAGED_KEY_SET.has(key)) {
    throw new Error("관리 대상이 아닌 키입니다.");
  }

  const content = await readEnvFileContent();
  const updated = upsertEnvValues(content, { [key]: value });
  await fs.writeFile(ENV_PATH, updated, "utf-8");

  const statuses = await getEnvKeyStatuses();
  const status = statuses.find((s) => s.key === key);
  if (!status) {
    throw new Error("상태를 조회하지 못했습니다.");
  }
  return status;
}
