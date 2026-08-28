import { FeedLoadingScrollLock } from "@/components/feed-loading-scroll-lock";
import { FeedPageSkeleton } from "@/components/loading-skeletons";
import { PageShell } from "@/components/page-shell";

export default function FeedLoading() {
  return (
    <PageShell>
      <FeedLoadingScrollLock />
      <FeedPageSkeleton />
    </PageShell>
  );
}
