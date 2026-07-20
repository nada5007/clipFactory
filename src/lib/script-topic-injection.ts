const PREFIX = "clipfactory:script-topic:";

export function scriptTopicStorageKey(projectId: string): string {
  return `${PREFIX}${projectId}`;
}
