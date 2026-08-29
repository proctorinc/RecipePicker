import { ArrowLeft, Bookmark, Tag } from "lucide-react";
import { notFound } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { HomeFeedShell } from "@/components/home-feed-shell";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
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
    : Tag;
  return (
    <PageShell>
      <HomeFeedShell
        initialPage={page}
        initialQuery=""
        tagId={tagId}
        header={
          <div className="flex items-center gap-3 px-2">
            <Button asChild variant="outline">
              <AppTransitionLink href="/tags" prefetch>
                <ArrowLeft className="size-4" />
                Back to tags
              </AppTransitionLink>
            </Button>
            <div>
              <h1 className="flex items-center gap-2 font-[family-name:var(--font-serif)] text-3xl font-semibold">
                <Icon icon={CollectionIcon} size="md" />
                {tag.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Recipes in this collection
              </p>
            </div>
          </div>
        }
      />
    </PageShell>
  );
}
