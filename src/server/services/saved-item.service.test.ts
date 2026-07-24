import { afterEach, describe, expect, it } from "vitest";

import { createSavedItem, deleteSavedItem, listSavedItems } from "@/server/services/saved-item.service";

describe("saved-item.service", () => {
  // SavedItem은 전역 테이블이라 실제 사용자가 저장한 항목이 들어있을 수 있다.
  // 테이블 전체를 비우면 실사용 데이터가 삭제되므로, 이 테스트에서 만든 항목의 id만 추적해 지운다.
  const createdIds: string[] = [];

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop();
      if (id) await deleteSavedItem(id).catch(() => {});
    }
  });

  it("영상 스냅샷을 저장하고 목록에서 조회된다", async () => {
    const item = await createSavedItem({
      type: "VIDEO",
      snapshot: { videoId: "v1", title: "제목", channelTitle: "채널", viewCount: 100 },
    });
    createdIds.push(item.id);

    expect(item.type).toBe("VIDEO");

    const list = await listSavedItems();
    expect(list.map((i) => i.id)).toContain(item.id);
  });

  it("type으로 필터링해 조회한다", async () => {
    const video = await createSavedItem({ type: "VIDEO", snapshot: { videoId: "v1" } });
    const channel = await createSavedItem({ type: "CHANNEL", snapshot: { channelId: "c1" } });
    createdIds.push(video.id, channel.id);

    const videos = await listSavedItems("VIDEO");
    expect(videos.every((i) => i.type === "VIDEO")).toBe(true);
    expect(videos.map((i) => i.id)).toContain(video.id);
  });

  it("삭제하면 목록에서 사라진다", async () => {
    const item = await createSavedItem({ type: "IDEA", snapshot: { title: "아이디어" } });
    await deleteSavedItem(item.id);

    const list = await listSavedItems();
    expect(list.map((i) => i.id)).not.toContain(item.id);
  });

  it("note를 함께 저장할 수 있다", async () => {
    const item = await createSavedItem({ type: "VIDEO", snapshot: { videoId: "v1" }, note: "메모" });
    createdIds.push(item.id);
    expect(item.note).toBe("메모");
  });
});
