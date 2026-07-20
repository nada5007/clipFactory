import { describe, expect, it } from "vitest";

import { maskSecret } from "@/lib/mask-secret";

describe("maskSecret", () => {
  it("빈 값은 빈 문자열을 반환한다", () => {
    expect(maskSecret("")).toBe("");
  });

  it("8자 이하는 전부 마스킹한다", () => {
    expect(maskSecret("abcd1234")).toBe("••••••••");
  });

  it("8자 초과는 앞뒤 4자만 남기고 마스킹한다", () => {
    expect(maskSecret("sk-abcdefgh1234")).toBe("sk-a•••••••1234");
  });

  it("원본 값을 그대로 포함하지 않는다", () => {
    const secret = "sk-super-secret-key-value";
    const masked = maskSecret(secret);
    expect(masked).not.toContain(secret);
  });
});
