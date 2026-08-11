// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 2)": 자막/전사 텍스트를 타임스탬프 단위 큐로 파싱한다.
// 지원 형식: WebVTT, SRT, 그리고 유튜브 "스크립트 복사"류의 타임스탬프 텍스트(`0:12\n텍스트` 또는 `0:12 텍스트`).
export type TranscriptCue = { startMs: number; endMs: number; text: string };

// "HH:MM:SS.mmm" / "MM:SS.mmm" / "M:SS" / "SS" 형태를 ms로. 구분자는 . 또는 , 둘 다 허용.
function timeToMs(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  const m = trimmed.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/) ?? trimmed.match(/^(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let millis = 0;
  if (m.length === 5) {
    hours = m[1] ? Number(m[1]) : 0;
    minutes = Number(m[2]);
    seconds = Number(m[3]);
    millis = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  } else {
    seconds = Number(m[1]);
    millis = m[2] ? Number(m[2].padEnd(3, "0")) : 0;
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

// VTT/SRT 공통: 빈 줄로 나뉜 블록에서 "start --> end" 줄을 찾아 큐를 만든다. `-->`가 없는 블록
// (WEBVTT 헤더, NOTE, SRT 인덱스 등)은 건너뛴다.
function parseCueBlocks(text: string): TranscriptCue[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const arrowIndex = lines.findIndex((l) => l.includes("-->"));
    if (arrowIndex === -1) continue;
    const [startRaw, endRaw] = lines[arrowIndex].split("-->").map((s) => s.trim().split(/\s+/)[0]);
    const startMs = timeToMs(startRaw ?? "");
    const endMs = timeToMs(endRaw ?? "");
    if (startMs === null || endMs === null) continue;
    const body = lines
      .slice(arrowIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "") // VTT 인라인 타이밍/스타일 태그 제거
      .trim();
    if (body) cues.push({ startMs, endMs, text: body });
  }
  return dedupeConsecutive(cues);
}

// 유튜브 스크립트 복사류: 타임스탬프만 있는 줄(또는 "타임스탬프 텍스트")을 큐로. 종료 시각은 다음 큐 시작으로,
// 마지막은 +5초로 근사한다(수동 입력엔 종료 시각이 없는 경우가 많음 — AI 구간 선정엔 시작+텍스트가 핵심).
function parseTimestampedText(text: string): TranscriptCue[] {
  const lineRe = /^\[?((?:\d+:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)\]?\s*(.*)$/;
  const rows: { startMs: number; text: string }[] = [];
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(lineRe);
    if (m) {
      const startMs = timeToMs(m[1]);
      if (startMs === null) continue;
      rows.push({ startMs, text: m[2].trim() });
    } else if (rows.length > 0) {
      // 타임스탬프 없는 후속 줄은 직전 큐 텍스트에 이어붙인다(타임스탬프 단독 줄 다음의 본문).
      rows[rows.length - 1].text = `${rows[rows.length - 1].text} ${line}`.trim();
    }
  }
  const cues: TranscriptCue[] = [];
  rows.forEach((row, i) => {
    if (!row.text) return;
    const endMs = i + 1 < rows.length ? rows[i + 1].startMs : row.startMs + 5000;
    cues.push({ startMs: row.startMs, endMs: Math.max(endMs, row.startMs + 500), text: row.text });
  });
  return cues;
}

// 인접한 동일 텍스트 큐(자동자막의 롤업 중복)를 합친다.
function dedupeConsecutive(cues: TranscriptCue[]): TranscriptCue[] {
  const out: TranscriptCue[] = [];
  for (const cue of cues) {
    const prev = out[out.length - 1];
    if (prev && prev.text === cue.text) {
      prev.endMs = Math.max(prev.endMs, cue.endMs);
      continue;
    }
    out.push({ ...cue });
  }
  return out;
}

export function parseTranscript(text: string): TranscriptCue[] {
  if (!text.trim()) return [];
  // `-->`가 있으면 VTT/SRT, 없으면 타임스탬프 텍스트로 취급.
  if (text.includes("-->")) return parseCueBlocks(text);
  return parseTimestampedText(text);
}

// AI 프롬프트에 넣기 좋은 형태: "[mm:ss] 텍스트" 줄 목록.
export function formatCuesForPrompt(cues: TranscriptCue[]): string {
  const stamp = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  return cues.map((c) => `[${stamp(c.startMs)}] ${c.text}`).join("\n");
}
