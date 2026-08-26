import { FeedPageSkeleton } from "@/components/loading-skeletons";
import { PageShell } from "@/components/page-shell";

export default function FeedLoading() {
  return (
    <PageShell>
      <FeedPageSkeleton />
    </PageShell>
  );
}
