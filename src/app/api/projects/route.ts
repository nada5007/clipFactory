import { NextResponse } from "next/server";
import { z } from "zod";

import { createProject, listProjects } from "@/server/services/project.service";

const listQuerySchema = z.object({
  q: z.string().optional(),
  channel: z.string().optional(),
  status: z.enum(["DRAFT", "SCRIPTING", "IMAGING", "TTS", "EDITING", "RENDERED", "UPLOADED", "FAILED"]).optional(),
  format: z.enum(["SHORT", "LONG"]).optional(),
  sort: z.enum(["latest", "oldest", "title", "progress"]).optional(),
  page: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = listQuerySchema.safeParse(params);
  if (!query.success) {
    return NextResponse.json({ error: query.error.flatten() }, { status: 400 });
  }

  const result = await listProjects({
    q: query.data.q,
    channelId: query.data.channel,
    status: query.data.status,
    videoFormat: query.data.format,
    sort: query.data.sort,
    page: query.data.page,
  });

  return NextResponse.json(result);
}

const createProjectSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  creationType: z.enum(["MANUAL", "AI_AUTO"]).optional(),
  videoFormat: z.enum(["SHORT", "LONG"]).optional(),
});

export async function POST(request: Request) {
  const body = createProjectSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const project = await createProject(body.data);
  return NextResponse.json(project, { status: 201 });
}
