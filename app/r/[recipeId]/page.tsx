import type { Metadata } from "next";
import { Clock3, ExternalLink, ListChecks } from "lucide-react";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { RecipeContent } from "@/components/recipe-content";
import { RecipeImage } from "@/components/recipe-image";
import { Button } from "@/components/ui/button";
import { getPublicRecipeUrl } from "@/lib/public-recipe-url";
import { getPublicRecipeDetail } from "@/lib/server/queries";
import { formatIso8601Duration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}): Promise<Metadata> {
  const { recipeId } = await params;
  const recipe = await getPublicRecipeDetail(recipeId);

  if (!recipe) {
    return { title: "Recipe not found" };
  }

  const url = getPublicRecipeUrl(recipe.recipeId);
  const description = recipe.description || `Recipe for ${recipe.title}`;
  return {
    title: recipe.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: recipe.title,
      description,
      images: recipe.imageUrl ? [{ url: recipe.imageUrl, alt: recipe.title }] : [],
    },
    twitter: {
      card: recipe.imageUrl ? "summary_large_image" : "summary",
      title: recipe.title,
      description,
      images: recipe.imageUrl ? [recipe.imageUrl] : [],
    },
  };
}

export default async function PublicRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const recipe = await getPublicRecipeDetail(recipeId);

  if (!recipe) {
    notFound();
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <PageShell>
        <section className="overflow-hidden rounded-t-[36px] border border-white/70 bg-white/70 shadow-soft">
          <div className="relative aspect-[16/10] sm:aspect-[16/8]">
            {recipe.imageUrl ? (
              <RecipeImage src={recipe.imageUrl} previewSrc={recipe.previewImageUrl} alt={recipe.title} fill className="object-cover" sizes="100vw" />
            ) : (
              <div className="absolute inset-0" style={{ backgroundColor: recipe.dominantColor ?? "rgba(214, 196, 176, 0.65)" }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-2 text-white sm:p-8">
              <div className="mb-3 flex flex-wrap gap-2">
                {recipe.totalTime ? <MetaChip icon={<Clock3 className="h-4 w-4" />} label={formatIso8601Duration(recipe.totalTime) ?? recipe.totalTime} /> : null}
                {recipe.yieldText ? <MetaChip icon={<ListChecks className="h-4 w-4" />} label={`${recipe.yieldText} servings`} /> : null}
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-2 px-4">
          <h1 className="max-w-3xl whitespace-pre-wrap font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">{recipe.title}</h1>
          {recipe.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground sm:text-base">{recipe.description}</p> : null}
        </div>

        {recipe.sourceUrl ? (
          <div className="flex gap-2"><Button asChild><a href={recipe.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />View original source</a></Button></div>
        ) : null}

        <RecipeContent recipe={recipe} />
      </PageShell>
    </main>
  );
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-4 py-2 text-sm backdrop-blur">{icon}{label}</div>;
}
