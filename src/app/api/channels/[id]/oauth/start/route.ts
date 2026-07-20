import { NextResponse } from "next/server";

import { getAuthorizationUrl } from "@/server/services/channel-oauth.service";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const redirectUri = `${new URL(request.url).origin}/api/channels/${params.id}/oauth/callback`;

  try {
    const url = getAuthorizationUrl(params.id, redirectUri);
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth 연동을 시작할 수 없습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
