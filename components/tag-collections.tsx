import { Tag } from "lucide-react";

import { AppTransitionLink } from "@/components/app-transition-link";
import { RecipeImage } from "@/components/recipe-image";
import { Card } from "@/components/ui/card";
import type { RecipeTagCollectionView } from "@/types/view-models";

export function TagCollections({ collections }: { collections: RecipeTagCollectionView[] }) {
  if (collections.length === 0) {
    return <Card className="border-dashed border-white/80 bg-white/70 p-12 text-center text-muted-foreground">No tagged recipes yet. Add tags while editing a recipe to build collections here.</Card>;
  }

  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {collections.map((collection) => <AppTransitionLink key={collection.tagId} href={`/tags/${collection.tagId}`} prefetch className="block" pendingClassName="opacity-85">
      <Card className="flex min-h-36 items-center gap-4 overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-soft">
        <RecipePreview recipes={collection.previewRecipes} />
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 font-[family-name:var(--font-serif)] text-xl font-semibold"><Tag className="size-4 shrink-0" /><span className="truncate">{collection.name}</span></div>
          <p className="text-sm text-muted-foreground">{collection.recipeCount} {collection.recipeCount === 1 ? "recipe" : "recipes"}</p>
        </div>
      </Card>
    </AppTransitionLink>)}
  </section>;
}

function RecipePreview({ recipes }: { recipes: RecipeTagCollectionView["previewRecipes"] }) {
  return <div className="relative h-24 w-24 shrink-0">
    {recipes.map((recipe, index) => <div key={recipe.recipeId} className="absolute h-16 w-16 overflow-hidden rounded-2xl border-2 border-white bg-secondary shadow-sm" style={{ left: `${(index % 2) * 27}px`, top: `${Math.floor(index / 2) * 27}px`, zIndex: index }}>
      {recipe.imageUrl ? <RecipeImage src={recipe.imageUrl} previewSrc={recipe.previewImageUrl} alt="" fill sizes="64px" className="object-cover" /> : <div className="absolute inset-0" style={{ backgroundColor: recipe.dominantColor ?? "rgba(214, 196, 176, 0.65)" }} />}
    </div>)}
  </div>;
}
