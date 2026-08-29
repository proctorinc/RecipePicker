import { Tag } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { TagCollections } from "@/components/tag-collections";
import { Icon } from "@/components/ui/icon";
import { getRecipeTagCollections } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const collections = await getRecipeTagCollections();
  return (
    <PageShell>
      <div className="space-y-1 px-2">
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight">
          <Icon icon={Tag} size="lg" />
          Collections
        </h1>
        <p className="text-muted-foreground">
          Browse your tagged recipe collections.
        </p>
      </div>
      <TagCollections collections={collections} />
    </PageShell>
  );
}
