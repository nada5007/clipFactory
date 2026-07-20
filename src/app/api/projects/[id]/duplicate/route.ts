import { NextResponse } from "next/server";

import { duplicateProject } from "@/server/services/project.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const project = await duplicateProject(params.id);
  return NextResponse.json(project, { status: 201 });
}
