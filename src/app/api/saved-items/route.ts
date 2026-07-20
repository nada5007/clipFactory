import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSavedItem, listSavedItems } from "@/server/services/saved-item.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const typeParam = params.get("type");
  const type = typeParam === "VIDEO" || typeParam === "CHANNEL" || typeParam === "IDEA" ? typeParam : undefined;

  const items = await listSavedItems(type);
  return NextResponse.json(items);
}

const createSavedItemSchema = z.object({
  type: z.enum(["VIDEO", "CHANNEL", "IDEA"]),
  snapshot: z.record(z.string(), z.unknown()),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const body = createSavedItemSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const item = await createSavedItem({ ...body.data, snapshot: body.data.snapshot as Prisma.InputJsonValue });
  return NextResponse.json(item, { status: 201 });
}
