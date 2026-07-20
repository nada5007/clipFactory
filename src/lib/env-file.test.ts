import { describe, expect, it } from "vitest";

import { parseEnvValues, upsertEnvValues } from "@/lib/env-file";

const SAMPLE = [
  "# Prisma / SQLite",
  'DATABASE_URL="file:./dev.db"',
  "",
  "# 스크립트/아이디어 생성 (Anthropic API)",
  "ANTHROPIC_API_KEY=",
  "",
  "YOUTUBE_API_KEY=old-key",
].join("\n");

describe("parseEnvValues", () => {
  it("KEY=value 줄을 파싱하고 따옴표를 제거한다", () => {
    const result = parseEnvValues(SAMPLE);
    expect(result.DATABASE_URL).toBe("file:./dev.db");
    expect(result.YOUTUBE_API_KEY).toBe("old-key");
    expect(result.ANTHROPIC_API_KEY).toBe("");
  });

  it("주석·빈 줄은 무시한다", () => {
    const result = parseEnvValues(SAMPLE);
    expect(Object.keys(result)).not.toContain("#");
  });
});

describe("upsertEnvValues", () => {
  it("기존 키의 값을 치환하고 나머지 줄·순서·주석은 보존한다", () => {
    const updated = upsertEnvValues(SAMPLE, { YOUTUBE_API_KEY: "new-key" });
    expect(updated).toContain("YOUTUBE_API_KEY=new-key");
    expect(updated).toContain("# Prisma / SQLite");
    expect(updated).toContain('DATABASE_URL="file:./dev.db"');
  });

  it("공백이 포함된 값은 따옴표로 감싼다", () => {
    const updated = upsertEnvValues(SAMPLE, { ANTHROPIC_API_KEY: "sk-abc 123" });
    expect(updated).toContain('ANTHROPIC_API_KEY="sk-abc 123"');
  });

  it("존재하지 않는 키는 파일 끝에 추가한다", () => {
    const updated = upsertEnvValues(SAMPLE, { NEW_KEY: "value" });
    expect(updated.trim().endsWith("NEW_KEY=value")).toBe(true);
  });

  it("빈 문자열로 값을 지울 수 있다", () => {
    const updated = upsertEnvValues(SAMPLE, { YOUTUBE_API_KEY: "" });
    expect(updated).toContain("YOUTUBE_API_KEY=\n");
  });

  it("여러 키를 한 번에 갱신할 수 있다", () => {
    const updated = upsertEnvValues(SAMPLE, { YOUTUBE_API_KEY: "y", ANTHROPIC_API_KEY: "a" });
    const parsed = parseEnvValues(updated);
    expect(parsed.YOUTUBE_API_KEY).toBe("y");
    expect(parsed.ANTHROPIC_API_KEY).toBe("a");
  });
});
