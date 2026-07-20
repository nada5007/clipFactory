// .env 파일 텍스트를 직접 파싱·수정하는 순수 함수. 실제 파일 I/O는 server/services/env-config.service.ts에서 담당한다.
// 기존 줄의 순서·주석은 최대한 보존하고, 관리 대상 키만 값을 치환하거나 없으면 맨 끝에 추가한다.

const ENV_LINE_PATTERN = /^([A-Z_][A-Z0-9_]*)=(.*)$/;

export function parseEnvValues(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(ENV_LINE_PATTERN);
    if (!match) continue;
    result[match[1]] = unquoteEnvValue(match[2]);
  }
  return result;
}

function unquoteEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatEnvValue(value: string): string {
  if (value === "") return "";
  if (/[\s#"'\\]/.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return value;
}

export function upsertEnvValues(content: string, updates: Record<string, string>): string {
  const remaining = new Set(Object.keys(updates));
  const lines = content.split("\n").map((line) => {
    const match = line.match(ENV_LINE_PATTERN);
    if (!match || !remaining.has(match[1])) return line;
    const key = match[1];
    remaining.delete(key);
    return `${key}=${formatEnvValue(updates[key])}`;
  });

  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  for (const key of Array.from(remaining)) {
    lines.push(`${key}=${formatEnvValue(updates[key])}`);
  }

  return `${lines.join("\n")}\n`;
}
