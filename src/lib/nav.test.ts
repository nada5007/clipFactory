import { describe, expect, it } from "vitest";

import { isActivePath } from "@/lib/nav";

describe("isActivePath", () => {
  it("루트 경로는 정확히 일치할 때만 active", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/projects", "/")).toBe(false);
  });

  it("동일 경로는 active", () => {
    expect(isActivePath("/projects", "/projects")).toBe(true);
  });

  it("하위 경로도 active", () => {
    expect(isActivePath("/projects/abc123", "/projects")).toBe(true);
  });

  it("접두사만 겹치는 다른 경로는 active가 아니다", () => {
    expect(isActivePath("/projects-archive", "/projects")).toBe(false);
  });
});
