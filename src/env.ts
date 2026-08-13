import { z } from "zod";

// 외부 API 키는 아직 해당 기능(스크립트/이미지/TTS/YouTube)이 구현되지 않았으므로
// 이 단계에서는 optional로 둔다. 각 클라이언트(src/lib/clients/*)를 구현할 때
// 실제 사용 시점에 값의 존재를 확인한다.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  // 자막 번인(ASS/drawtext)에는 libass가 포함된 ffmpeg-full 빌드가 필요하다.
  // 기본 ffmpeg 포뮬러에는 libass가 없어 별도 경로를 지정하지 않으면 PATH의 ffmpeg/ffprobe를 그대로 쓴다.
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  // yt-dlp 실행 파일 경로. 미지정 시 PATH의 "yt-dlp"를 쓴다. YouTube의 PO-Token 방어로 stable 버전이
  // 막히는 경우, 최신 nightly 바이너리 경로를 여기에 지정한다.
  YTDLP_PATH: z.string().optional(),
  // yt-dlp가 인증 쿠키를 읽어올 브라우저(예: "chrome", "safari", "firefox"). 403/PO-Token으로 다운로드가
  // 막힐 때 로그인된 브라우저 쿠키로 우회한다(선택). "chrome:Profile 1"처럼 프로필 지정도 가능.
  YTDLP_COOKIES_FROM_BROWSER: z.string().optional(),
});

export const env = envSchema.parse(process.env);
