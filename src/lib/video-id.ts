const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function parseVideoId(raw: string): string | null {
  const trimmed = raw.trim();

  if (VIDEO_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname.includes("youtu.be")) {
    const id = url.pathname.slice(1).split("/")[0];
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  if (url.hostname.includes("youtube.com")) {
    const vParam = url.searchParams.get("v");
    if (vParam && VIDEO_ID_PATTERN.test(vParam)) return vParam;

    const pathMatch = url.pathname.match(/\/(shorts|embed)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[2];
  }

  return null;
}
