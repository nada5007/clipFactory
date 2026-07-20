import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createSavedItem, deleteSavedItem, listSavedItems } from "@/server/services/saved-item.service";

describe("saved-item.service", () => {
  afterEach(async () => {
    await prisma.savedItem.deleteMany({});
  });

  it("영상 스냅샷을 저장하고 목록에서 조회된다", async () => {
    const item = await createSavedItem({
      type: "VIDEO",
      snapshot: { videoId: "v1", title: "제목", channelTitle: "채널", viewCount: 100 },
    });

    expect(item.type).toBe("VIDEO");

    const list = await listSavedItems();
    expect(list.map((i) => i.id)).toContain(item.id);
  });

  it("type으로 필터링해 조회한다", async () => {
    await createSavedItem({ type: "VIDEO", snapshot: { videoId: "v1" } });
    await createSavedItem({ type: "CHANNEL", snapshot: { channelId: "c1" } });

    const videos = await listSavedItems("VIDEO");
    expect(videos.every((i) => i.type === "VIDEO")).toBe(true);
    expect(videos.length).toBeGreaterThanOrEqual(1);
  });

  it("삭제하면 목록에서 사라진다", async () => {
    const item = await createSavedItem({ type: "IDEA", snapshot: { title: "아이디어" } });
    await deleteSavedItem(item.id);

    const list = await listSavedItems();
    expect(list.map((i) => i.id)).not.toContain(item.id);
  });

  it("note를 함께 저장할 수 있다", async () => {
    const item = await createSavedItem({ type: "VIDEO", snapshot: { videoId: "v1" }, note: "메모" });
    expect(item.note).toBe("메모");
  });
});
