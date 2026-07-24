import { Suspense } from "react";

import { SurgeClient } from "@/components/insight/surge/surge-client";

export default function TrendingPage() {
  return (
    <Suspense>
      <SurgeClient />
    </Suspense>
  );
}
