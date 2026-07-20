import fs from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getEnvKeyStatuses, updateEnvKey } from "@/server/services/env-config.service";

vi.mock("node:fs/promises", () => ({
  default: { readFile: vi.fn(), writeFile: vi.fn() },
}));

describe("env-config.service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.writeFile).mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("파일에 값이 없고 런타임에도 없으면 미설정 상태를 반환한다", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("YOUTUBE_API_KEY=\n");
    delete process.env.YOUTUBE_API_KEY;

    const statuses = await getEnvKeyStatuses();
    const youtube = statuses.find((s) => s.key === "YOUTUBE_API_KEY");

    expect(youtube?.fileConfigured).toBe(false);
    expect(youtube?.runtimeConfigured).toBe(false);
  });

  it("파일에는 값이 있지만 런타임(process.env)에는 없으면 재시작 대기 상태를 나타낸다", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("YOUTUBE_API_KEY=abcd1234efgh\n");
    delete process.env.YOUTUBE_API_KEY;

    const statuses = await getEnvKeyStatuses();
    const youtube = statuses.find((s) => s.key === "YOUTUBE_API_KEY");

    expect(youtube?.fileConfigured).toBe(true);
    expect(youtube?.runtimeConfigured).toBe(false);
    expect(youtube?.fileMaskedValue).not.toContain("abcd1234efgh");
  });

  it("관리 대상이 아닌 키는 거부한다", async () => {
    await expect(updateEnvKey("DATABASE_URL", "evil")).rejects.toThrow("관리 대상이 아닌 키입니다.");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("값을 저장하면 .env 파일에 반영되고 마스킹된 상태를 반환한다", async () => {
    let fileContent = "YOUTUBE_API_KEY=\n";
    vi.mocked(fs.readFile).mockImplementation(() => Promise.resolve(fileContent));
    vi.mocked(fs.writeFile).mockImplementation((_path, data) => {
      fileContent = data as string;
      return Promise.resolve();
    });

    const status = await updateEnvKey("YOUTUBE_API_KEY", "new-secret-key-123");

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(".env"),
      expect.stringContaining("YOUTUBE_API_KEY=new-secret-key-123"),
      "utf-8",
    );
    expect(status.fileConfigured).toBe(true);
    expect(status.fileMaskedValue).not.toContain("new-secret-key-123");
  });
});
