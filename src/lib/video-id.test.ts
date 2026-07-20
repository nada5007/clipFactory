import { describe, expect, it } from "vitest";

import { parseVideoId } from "@/lib/video-id";

describe("parseVideoId", () => {
  it("11자 videoId를 그대로 인식한다", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("watch?v= URL에서 videoId를 추출한다", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("youtu.be 단축 URL에서 videoId를 추출한다", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("shorts URL에서 videoId를 추출한다", () => {
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("잘못된 입력은 null을 반환한다", () => {
    expect(parseVideoId("아무거나 입력")).toBeNull();
    expect(parseVideoId("https://example.com/foo")).toBeNull();
  });
});
