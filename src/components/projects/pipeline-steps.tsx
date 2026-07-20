import { Clapperboard, FileText, Image as ImageIcon, Mic, Video } from "lucide-react";

import { PIPELINE_STEPS } from "@/lib/project-labels";
import { cn } from "@/lib/utils";

const ICONS = {
  script: FileText,
  image: ImageIcon,
  tts: Mic,
  edit: Clapperboard,
  video: Video,
} as const;

export function PipelineSteps({ progress }: { progress: number }) {
  return (
    <div className="flex items-center justify-between">
      {PIPELINE_STEPS.map((step) => {
        const Icon = ICONS[step.key];
        const done = progress >= step.threshold;
        return (
          <div
            key={step.key}
            title={step.label}
            className={cn(
              "flex size-8 items-center justify-center rounded-md",
              done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </div>
        );
      })}
    </div>
  );
}
