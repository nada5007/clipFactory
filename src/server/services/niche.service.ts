import { prisma } from "@/lib/prisma";

export async function listNiches(): Promise<string[]> {
  const rows = await prisma.nicheSetting.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => r.category);
}

// 니치 설정은 전체 교체 방식이 UI(칩 다중 선택)와 가장 잘 맞는다 — 기존 목록을 지우고 새로 저장한다.
export async function setNiches(categories: string[]): Promise<string[]> {
  const unique = Array.from(new Set(categories));
  await prisma.$transaction([
    prisma.nicheSetting.deleteMany({}),
    ...unique.map((category) => prisma.nicheSetting.create({ data: { category } })),
  ]);
  return unique;
}
