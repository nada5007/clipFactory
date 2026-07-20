// 대본 본문을 TTS 세그먼트 단위(문장)로 분리한다.
export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
