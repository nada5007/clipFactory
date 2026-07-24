import { NextResponse } from "next/server";
import { z } from "zod";

import { listNiches, setNiches } from "@/server/services/niche.service";

export async function GET() {
  const niches = await listNiches();
  return NextResponse.json({ niches });
}

const setNichesSchema = z.object({ niches: z.array(z.string()) });

export async function PUT(request: Request) {
  const body = setNichesSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const niches = await setNiches(body.data.niches);
  return NextResponse.json({ niches });
}
