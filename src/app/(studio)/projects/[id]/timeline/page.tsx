import { TimelineEditorClient } from "@/components/projects/timeline/timeline-editor-client";

export default function TimelinePage({ params }: { params: { id: string } }) {
  return <TimelineEditorClient projectId={params.id} />;
}
