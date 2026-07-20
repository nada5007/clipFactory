import "dotenv/config";

// 테스트에서는 실제 외부 API를 호출하지 않고 fetch를 모킹하므로,
// .env에 키가 비어 있어도 각 클라이언트의 requireApiKey() 검증을 통과할 더미 값을 채운다.
process.env.YOUTUBE_API_KEY ||= "test-dummy-key";
process.env.GOOGLE_OAUTH_CLIENT_ID ||= "test-dummy-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= "test-dummy-client-secret";
