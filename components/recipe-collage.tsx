import { RecipeImage } from "@/components/recipe-image";

export type RecipeCollageItem = {
  recipeId: string;
  imageUrl: string | null;
  previewImageUrl: string | null;
  dominantColor: string | null;
};

export function RecipeCollage({
  recipes,
  sizes = "(max-width: 640px) 50vw, 33vw",
}: {
  recipes: RecipeCollageItem[];
  sizes?: string;
}) {
  const visibleRecipes = recipes.slice(0, 4);
  const layoutClass = getLayoutClass(visibleRecipes.length);

  return <div className={`absolute inset-0 grid overflow-hidden bg-secondary ${layoutClass}`}>
    {visibleRecipes.map((recipe) => <div key={recipe.recipeId} className="relative min-h-0 min-w-0 overflow-hidden">
      {recipe.imageUrl ? <RecipeImage src={recipe.imageUrl} previewSrc={recipe.previewImageUrl} alt="" fill sizes={sizes} className="object-cover" /> : <div className="absolute inset-0" style={{ backgroundColor: recipe.dominantColor ?? "rgba(214, 196, 176, 0.65)" }} />}
    </div>)}
  </div>;
}

function getLayoutClass(recipeCount: number) {
  switch (recipeCount) {
    case 1:
      return "grid-cols-1 grid-rows-1";
    case 2:
      return "grid-cols-1 grid-rows-2";
    case 3:
      return "grid-cols-2 grid-rows-2 [&>*:first-child]:col-span-2";
    default:
      return "grid-cols-2 grid-rows-2";
  }
}
