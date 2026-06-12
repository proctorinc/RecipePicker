import { PickerPageSkeleton } from "@/components/loading-skeletons";
import { PageShell } from "@/components/page-shell";

export default function PickerLoading() {
  return (
    <PageShell className="max-w-6xl">
      <PickerPageSkeleton />
    </PageShell>
  );
}
