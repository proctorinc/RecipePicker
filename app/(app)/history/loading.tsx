import { HistoryPageSkeleton } from "@/components/loading-skeletons";
import { PageShell } from "@/components/page-shell";

export default function HistoryLoading() {
  return (
    <PageShell>
      <HistoryPageSkeleton />
    </PageShell>
  );
}
