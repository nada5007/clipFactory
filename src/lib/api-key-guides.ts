import type { ManagedEnvKey } from "@/server/services/env-config.service";

export type ApiKeyGuide = {
  steps: string[];
  links: { label: string; url: string }[];
  note?: string;
};

export const API_KEY_GUIDES: Record<ManagedEnvKey, ApiKeyGuide> = {
  ANTHROPIC_API_KEY: {
    steps: [
      "console.anthropic.com에 접속해 로그인(또는 가입)합니다.",
      "좌측 메뉴에서 'API Keys'를 클릭합니다.",
      "'Create Key' 버튼으로 새 키를 생성합니다.",
      "생성된 키를 복사해 이 페이지의 입력란에 붙여넣고 저장합니다.",
    ],
    links: [{ label: "console.anthropic.com", url: "https://console.anthropic.com" }],
    note: "사용량 기반 과금입니다. Billing 메뉴에서 결제 정보를 등록해야 요청이 정상 처리됩니다.",
  },
  ELEVENLABS_API_KEY: {
    steps: [
      "elevenlabs.io에 접속해 가입(또는 로그인)합니다.",
      "우측 상단 프로필 아이콘을 클릭해 'API Keys' 메뉴로 이동합니다.",
      "발급된(또는 새로 생성한) API 키를 복사합니다.",
      "이 페이지의 입력란에 붙여넣고 저장합니다.",
    ],
    links: [{ label: "elevenlabs.io", url: "https://elevenlabs.io" }],
  },
  IMAGE_API_KEY: {
    steps: [
      "platform.openai.com에 접속해 로그인합니다.",
      "좌측 메뉴에서 'API keys'로 이동합니다.",
      "'Create new secret key'로 새 키를 생성합니다 (생성 직후 한 번만 전체 값이 표시되므로 즉시 복사).",
      "이 페이지의 입력란에 붙여넣고 저장합니다.",
    ],
    links: [{ label: "platform.openai.com", url: "https://platform.openai.com" }],
    note: "gpt-image-1 모델을 사용하려면 조직(Organization) 인증이 필요할 수 있습니다 (Settings → Organization → Verifications).",
  },
  YOUTUBE_API_KEY: {
    steps: [
      "console.cloud.google.com에서 프로젝트를 생성하거나 기존 프로젝트를 선택합니다.",
      "'API 및 서비스' → '라이브러리'에서 'YouTube Data API v3'를 검색해 사용 설정합니다.",
      "'API 및 서비스' → '사용자 인증 정보' → '사용자 인증 정보 만들기' → 'API 키'를 선택합니다.",
      "생성된 키를 복사해 이 페이지의 입력란에 붙여넣고 저장합니다.",
    ],
    links: [{ label: "console.cloud.google.com", url: "https://console.cloud.google.com" }],
    note: "탐색·분석, 채널 분석, 떡상 영상, 영상 SEO 등 읽기 전용 분석 기능에 사용됩니다. 키 제한(HTTP 리퍼러 등)을 걸어두는 것을 권장합니다.",
  },
  GOOGLE_OAUTH_CLIENT_ID: {
    steps: [
      "YouTube Data API 키와 동일한 Google Cloud 프로젝트를 사용합니다.",
      "'API 및 서비스' → 'OAuth 동의 화면'에서 앱 정보를 설정합니다 (테스트 중이면 '테스트 사용자'에 본인 계정 추가).",
      "'사용자 인증 정보' → '사용자 인증 정보 만들기' → 'OAuth 클라이언트 ID'를 선택하고, 애플리케이션 유형은 '웹 애플리케이션'을 선택합니다.",
      "'승인된 리디렉션 URI'에 http://localhost:3000/api/channels/{채널ID}/oauth/callback 형태의 URL을 추가합니다. 채널마다 ID가 다르므로, 채널 설정에서 YouTube 연결을 시도할 때 나오는 실제 콜백 URL을 각각 등록해야 합니다.",
      "생성된 '클라이언트 ID'를 복사해 이 페이지에 저장합니다.",
    ],
    links: [{ label: "console.cloud.google.com", url: "https://console.cloud.google.com" }],
    note: "YouTube 업로드(Phase 2) 및 예약 업로드 기능에 필요합니다. 클라이언트 보안 비밀과 한 쌍으로 발급됩니다.",
  },
  GOOGLE_OAUTH_CLIENT_SECRET: {
    steps: [
      "GOOGLE_OAUTH_CLIENT_ID를 발급받는 것과 같은 화면(OAuth 클라이언트 ID 생성)에서 함께 발급됩니다.",
      "생성 완료 화면 또는 사용자 인증 정보 목록에서 해당 클라이언트를 클릭하면 '클라이언트 보안 비밀'을 확인할 수 있습니다.",
      "값을 복사해 이 페이지에 저장합니다.",
    ],
    links: [{ label: "console.cloud.google.com", url: "https://console.cloud.google.com" }],
    note: "클라이언트 ID와 반드시 짝을 맞춰 설정해야 합니다.",
  },
};
