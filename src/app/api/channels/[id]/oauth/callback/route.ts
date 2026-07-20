import { NextResponse } from "next/server";

import { completeOAuthConnection } from "@/server/services/channel-oauth.service";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectUri = `${url.origin}/api/channels/${params.id}/oauth/callback`;
  const channelsUrl = new URL("/channels", url.origin);

  if (!code) {
    channelsUrl.searchParams.set("oauthError", "Google 인증이 취소되었습니다.");
    return NextResponse.redirect(channelsUrl);
  }

  try {
    await completeOAuthConnection(params.id, code, redirectUri);
    channelsUrl.searchParams.set("oauthConnected", params.id);
  } catch (error) {
    channelsUrl.searchParams.set(
      "oauthError",
      error instanceof Error ? error.message : "YouTube 계정 연결에 실패했습니다.",
    );
  }

  return NextResponse.redirect(channelsUrl);
}
