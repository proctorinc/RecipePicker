import { FeedPageSkeleton } from "@/components/loading-skeletons";
import { PageShell } from "@/components/page-shell";

export default function AppLoading() {
  return (
    <PageShell>
      <FeedPageSkeleton />
    </PageShell>
  );
}
