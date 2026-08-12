import { NextResponse } from "next/server";

import { parseScanPeriod } from "@/lib/scan-period";
import { scanChannel } from "@/server/services/channel-analysis.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const channel = params.get("channel")?.trim();
  const period = parseScanPeriod(params.get("period"));

  if (!channel) {
    return NextResponse.json({ error: "채널 URL, ID, 핸들 또는 이름을 입력하세요." }, { status: 400 });
  }

  try {
    const result = await scanChannel(channel, period);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채널을 분석하지 못했습니다." },
      { status: 502 },
    );
  }
}
