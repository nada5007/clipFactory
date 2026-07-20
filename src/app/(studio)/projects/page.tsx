import { Suspense } from "react";

import { ProjectsPageClient } from "@/components/projects/projects-page-client";

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageClient />
    </Suspense>
  );
}
