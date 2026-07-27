import { Suspense } from "react";

import { ExploreClient } from "@/components/insight/explore/explore-client";

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreClient />
    </Suspense>
  );
}
