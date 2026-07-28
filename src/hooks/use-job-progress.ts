"use client";

import { useCallback, useRef, useState } from "react";

export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type JobState = {
  id: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
};

// 이미지 일괄 생성/TTS 생성/렌더링 같은 장시간 작업의 진행률을 SSE(GET /api/projects/:id/events)로 구독한다.
export function useJobProgress(projectId: string, type: "IMAGES" | "RENDER" | "TTS") {
  const [job, setJob] = useState<JobState | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const start = useCallback(
    (onDone: (job: JobState) => void) => {
      sourceRef.current?.close();
      setJob(null);

      const source = new EventSource(`/api/projects/${projectId}/events?type=${type}`);
      sourceRef.current = source;

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as JobState;
        setJob(data);
        if (data.status === "SUCCEEDED" || data.status === "FAILED") {
          source.close();
          onDone(data);
        }
      };

      source.onerror = () => {
        source.close();
      };
    },
    [projectId, type],
  );

  return { job, start };
}
