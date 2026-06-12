import { RecipePageSkeleton } from "@/components/loading-skeletons";
import { PageShell } from "@/components/page-shell";

export default function RecipeLoading() {
  return (
    <PageShell>
      <RecipePageSkeleton />
    </PageShell>
  );
}
