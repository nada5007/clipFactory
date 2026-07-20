import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function resolveProjectFilePath(projectId: string, relativePath: string): string {
  return path.join(STORAGE_ROOT, projectId, relativePath);
}

// relativePath는 storage/{projectId}/ 기준 상대 경로이며 DB에는 이 값만 저장한다.
export async function writeProjectFile(
  projectId: string,
  relativePath: string,
  data: Buffer,
): Promise<void> {
  const fullPath = resolveProjectFilePath(projectId, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, data);
}

export function readProjectFile(projectId: string, relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveProjectFilePath(projectId, relativePath));
}

// ffmpeg 등 외부 프로세스가 직접 경로에 파일을 쓰기 전에 디렉터리를 미리 만들어둔다.
export async function ensureProjectDir(projectId: string, relativeDir = "."): Promise<void> {
  await fs.mkdir(resolveProjectFilePath(projectId, relativeDir), { recursive: true });
}
