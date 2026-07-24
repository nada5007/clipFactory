import { NextResponse } from "next/server";
import { z } from "zod";

import { generateTodayIdeas, getTodayIdeas } from "@/server/services/daily-idea.service";

export async function GET(request: Request) {
  const modeParam = new URL(request.url).searchParams.get("mode");
  const mode = modeParam === "manual" ? "manual" : "auto";
  const idea = await getTodayIdeas(mode);
  return NextResponse.json(idea);
}

const generateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({
    mode: z.literal("manual"),
    topic: z.string().min(1),
    targetAudience: z.string().optional(),
    category: z.string().optional(),
  }),
]);

export async function POST(request: Request) {
  const body = generateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const idea = await generateTodayIdeas(body.data);
    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "아이디어 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
