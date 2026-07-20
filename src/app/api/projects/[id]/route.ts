import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteProject, getProject, updateProject } from "@/server/services/project.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(project);
}

const updateProjectSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  reviewStatus: z.enum(["PENDING", "REVIEWED"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = updateProjectSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const project = await updateProject(params.id, body.data);
  return NextResponse.json(project);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await deleteProject(params.id);
  return new NextResponse(null, { status: 204 });
}
