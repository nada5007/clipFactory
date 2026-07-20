export type ChannelInputResolution =
  | { type: "id"; value: string }
  | { type: "handle"; value: string }
  | { type: "query"; value: string };

const CHANNEL_ID_PATTERN = /^UC[a-zA-Z0-9_-]{22}$/;

export function parseChannelInput(raw: string): ChannelInputResolution {
  const trimmed = raw.trim();

  if (CHANNEL_ID_PATTERN.test(trimmed)) {
    return { type: "id", value: trimmed };
  }

  const channelUrlMatch = trimmed.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelUrlMatch) {
    return { type: "id", value: channelUrlMatch[1] };
  }

  const handleUrlMatch = trimmed.match(/youtube\.com\/(@[\w.-]+)/);
  if (handleUrlMatch) {
    return { type: "handle", value: handleUrlMatch[1] };
  }

  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed };
  }

  return { type: "query", value: trimmed };
}
