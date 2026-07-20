import { NextResponse } from "next/server";

import { deleteSavedItem } from "@/server/services/saved-item.service";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await deleteSavedItem(params.id);
  return new NextResponse(null, { status: 204 });
}
