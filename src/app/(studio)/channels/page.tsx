import { Suspense } from "react";

import { ChannelsPageClient } from "@/components/channels/channels-page-client";

export default function ChannelsPage() {
  return (
    <Suspense>
      <ChannelsPageClient />
    </Suspense>
  );
}
