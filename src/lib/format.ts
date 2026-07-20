export function formatDateKo(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatSecondsRange(startMs: number, endMs: number) {
  const start = (startMs / 1000).toFixed(1);
  const end = (endMs / 1000).toFixed(1);
  return `${start}s - ${end}s`;
}
