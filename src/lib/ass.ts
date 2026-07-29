import type { SubtitleStyle } from "@/lib/timeline";

export type AssCue = { text: string; startMs: number; endMs: number; style: SubtitleStyle };

function formatAssTimestamp(ms: number): string {
  const centis = Math.round(ms / 10);
  const totalSec = Math.floor(centis / 100);
  const cs = centis % 100;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// #RRGGBB → ASS의 &HBBGGRR& (BGR 순서, 알파는 별도 태그로 다룬다).
function hexToAssColor(hex: string): string {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

// ASS 알파: 00=불투명, FF=완전 투명 — 우리가 쓰는 "투명도(opacity)"와는 반전 관계.
function opacityToAssAlpha(opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  const alpha = Math.round((1 - clamped) * 255);
  return alpha.toString(16).padStart(2, "0").toUpperCase();
}

function escapeAssText(text: string): string {
  return text.replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

// 클립별 스타일을 override 태그로 그때그때 입혀서 하나의 Default 스타일만으로 모든 자막을 표현한다.
// 배경(BorderStyle 3)을 기본으로 쓰기 때문에 "테두리"는 텍스트 외곽선이 아니라 배경 박스의 여백 두께로 렌더링된다
// (ASS 포맷 한계로 박스+외곽선을 동시에 완전히 독립적으로 표현할 수 없어 박스 쪽을 우선했다).
function buildOverrideTags(style: SubtitleStyle): string {
  const tags = [
    `\\fn${style.fontFamily}`,
    `\\fs${style.fontSizePx}`,
    `\\b${style.bold ? 1 : 0}`,
    `\\c${hexToAssColor(style.fontColor)}`,
    `\\bord${style.borderWidthPx}`,
    `\\3c${hexToAssColor(style.backgroundColor)}`,
    `\\3a&H${opacityToAssAlpha(style.backgroundOpacity)}&`,
    `\\an5`,
    `\\pos(${style.positionXPx},${style.positionYPx})`,
  ];
  return `{${tags.join("")}}`;
}

export function generateAss(cues: AssCue[], videoWidth: number, videoHeight: number): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,2,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = cues.map((cue) => {
    const start = formatAssTimestamp(cue.startMs);
    const end = formatAssTimestamp(cue.endMs);
    const text = `${buildOverrideTags(cue.style)}${escapeAssText(cue.text)}`;
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return `${header}\n${lines.join("\n")}\n`;
}
