import { Bookmark, Hash } from "lucide-react";
import { notFound } from "next/navigation";

import { HomeFeedShell } from "@/components/home-feed-shell";
import { PageShell } from "@/components/page-shell";
import { Icon } from "@/components/ui/icon";
import { getFeedPinsPage, getRecipeTag } from "@/lib/server/queries";
import { SAVE_FOR_LATER_TAG_NORMALIZED_NAME } from "@/lib/recipe-tags";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: { params: Promise<{ tagId: string }> }) {
  const { tagId } = await params;
  const tag = await getRecipeTag(tagId);
  if (!tag) notFound();
  const page = await getFeedPinsPage({ tagId });
  const CollectionIcon = tag.name.toLocaleLowerCase() === SAVE_FOR_LATER_TAG_NORMALIZED_NAME
    ? Bookmark
    : Hash;
  return (
    <PageShell>
      <HomeFeedShell
        initialPage={page}
        initialQuery=""
        tagId={tagId}
        header={
          <div className="px-2">
            <h1 className="flex items-center gap-2 font-[family-name:var(--font-serif)] text-3xl font-semibold">
              <Icon icon={CollectionIcon} size="md" />
              {tag.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Recipes in this collection
            </p>
          </div>
        }
      />
    </PageShell>
  );
}
