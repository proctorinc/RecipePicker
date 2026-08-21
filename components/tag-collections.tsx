import type { CSSProperties } from "react";

import { AppTransitionLink } from "@/components/app-transition-link";
import { RecipeImage } from "@/components/recipe-image";
import { Card } from "@/components/ui/card";
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
          <p className="truncate font-[family-name:var(--font-serif)] text-xl font-semibold leading-tight drop-shadow-sm sm:text-2xl">{collection.name}</p>
          <p className="mt-1 text-xs font-medium text-white/90 drop-shadow-sm sm:text-sm">{collection.recipeCount} {collection.recipeCount === 1 ? "recipe" : "recipes"}</p>
        </div>
      </Card>
    </AppTransitionLink>)}
  </section>;
}

function RecipePreview({ recipes }: { recipes: RecipeTagCollectionView["previewRecipes"] }) {
  if (recipes.length === 1) return <RecipeTile recipe={recipes[0]} className="absolute inset-0" />;

  const collagePositions = [
    "left-[-8%] top-[-5%] h-[58%] w-[58%] rotate-[-7deg]",
    "right-[-7%] top-[-4%] h-[53%] w-[53%] rotate-[6deg]",
    "bottom-[-8%] left-[-4%] h-[55%] w-[55%] rotate-[5deg]",
    "bottom-[-7%] right-[-5%] h-[57%] w-[57%] rotate-[-6deg]",
    "left-[22%] top-[22%] h-[53%] w-[53%] rotate-[2deg]",
  ];

  return <div className="absolute inset-0 overflow-hidden bg-secondary">
    {recipes.map((recipe, index) => <RecipeTile key={recipe.recipeId} recipe={recipe} className={`absolute overflow-hidden border-2 border-white/85 shadow-lg ${collagePositions[index] ?? ""}`} style={{ zIndex: index + 1 }} />)}
  </div>;
}

function RecipeTile({ recipe, className, style }: {
  recipe: RecipeTagCollectionView["previewRecipes"][number];
  className: string;
  style?: CSSProperties;
}) {
  return <div className={className} style={style}>
    {recipe.imageUrl ? <RecipeImage src={recipe.imageUrl} previewSrc={recipe.previewImageUrl} alt="" fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" /> : <div className="absolute inset-0" style={{ backgroundColor: recipe.dominantColor ?? "rgba(214, 196, 176, 0.65)" }} />}
  </div>;
}
