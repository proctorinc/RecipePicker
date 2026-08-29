import { Bookmark } from "lucide-react";

import { AppTransitionLink } from "@/components/app-transition-link";
import { RecipeCollage } from "@/components/recipe-collage";
import { Card } from "@/components/ui/card";
import { SAVE_FOR_LATER_TAG_NORMALIZED_NAME } from "@/lib/recipe-tags";
import type { RecipeTagCollectionView } from "@/types/view-models";

export function TagCollections({ collections }: { collections: RecipeTagCollectionView[] }) {
  if (collections.length === 0) {
    return <Card className="border-dashed border-white/80 bg-white/70 p-12 text-center text-muted-foreground">No tagged recipes yet. Add tags from a recipe to build collections here.</Card>;
  }

  return <section className="grid grid-cols-2 gap-3">
    {collections.map((collection) => <AppTransitionLink key={collection.tagId} href={`/tags/${collection.tagId}`} prefetch className="block" pendingClassName="opacity-85">
      <Card className="group relative aspect-square overflow-hidden border-white/70 bg-secondary transition hover:-translate-y-0.5 hover:shadow-soft">
        <RecipePreview recipes={collection.previewRecipes} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/25" />
        <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
          <p className="flex items-center gap-1 truncate font-[family-name:var(--font-serif)] text-xl font-semibold leading-tight drop-shadow-sm sm:text-2xl">
            {collection.name.toLocaleLowerCase() === SAVE_FOR_LATER_TAG_NORMALIZED_NAME ? (
              <Bookmark className="size-4 shrink-0 fill-current" aria-hidden="true" />
            ) : null}
            <span className="truncate">{collection.name}</span>
          </p>
          <p className="mt-1 text-xs font-medium text-white/90 drop-shadow-sm sm:text-sm">{collection.recipeCount} {collection.recipeCount === 1 ? "recipe" : "recipes"}</p>
        </div>
      </Card>
    </AppTransitionLink>)}
  </section>;
}

function RecipePreview({ recipes }: { recipes: RecipeTagCollectionView["previewRecipes"] }) {
  return <RecipeCollage recipes={recipes} />;
}
