// YouTube API의 contentDetails.duration은 ISO 8601 형식(예: PT1M30S)으로 온다.
const ISO_DURATION_PATTERN = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

export function parseIso8601DurationSeconds(iso: string): number {
  const match = iso.match(ISO_DURATION_PATTERN);
  if (!match) return 0;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

export function formatDurationLabel(iso: string): string {
  const totalSeconds = parseIso8601DurationSeconds(iso);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}` : `${minutes}:${paddedSeconds}`;
}
