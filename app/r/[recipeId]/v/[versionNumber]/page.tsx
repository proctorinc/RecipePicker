import type { Metadata } from "next";
import { Clock3, ExternalLink, ListChecks } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { RecipeContent } from "@/components/recipe-content";
import { RecipeImage } from "@/components/recipe-image";
import { Button } from "@/components/ui/button";
import { getPublicRecipeUrl } from "@/lib/public-recipe-url";
import {
  getPublicRecipeDetail,
  hasCurrentUserRecipeAccess,
} from "@/lib/server/queries";
import { formatIso8601Duration } from "@/lib/utils";

type Props = { params: Promise<{ recipeId: string; versionNumber: string }> };
async function load(params: Props["params"]) { const { recipeId, versionNumber } = await params; return getPublicRecipeDetail(recipeId, Number.parseInt(versionNumber, 10)); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const recipe = await load(params); if (!recipe) return { title: "Recipe not found" };
  const url = getPublicRecipeUrl(recipe.recipeId, recipe.versionNumber);
  return { title: recipe.title, description: recipe.description || `Recipe for ${recipe.title}`, alternates: { canonical: url } };
}

export default async function PublicRecipeVersionPage({ params }: Props) {
  const { recipeId } = await params;
  if (await hasCurrentUserRecipeAccess(recipeId)) {
    redirect(`/recipe/${encodeURIComponent(recipeId)}`);
  }

  const recipe = await load(params); if (!recipe) notFound();
  const isOlder = recipe.versionNumber < recipe.latestVersionNumber;
  return <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12"><PageShell>
    {isOlder ? <div className="rounded-[20px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">You are viewing version {recipe.versionNumber}. <a className="font-medium underline" href={getPublicRecipeUrl(recipe.recipeId, recipe.latestVersionNumber)}>View version {recipe.latestVersionNumber}</a>.</div> : null}
    <section className="overflow-hidden rounded-t-[36px] border border-white/70 bg-white/70 shadow-soft"><div className="relative aspect-[16/10] sm:aspect-[16/8]">{recipe.imageUrl ? <RecipeImage src={recipe.imageUrl} previewSrc={recipe.previewImageUrl} alt={recipe.title} fill className="object-cover" sizes="100vw" /> : <div className="absolute inset-0" style={{ backgroundColor: recipe.dominantColor ?? "rgba(214, 196, 176, 0.65)" }} />}<div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-2 text-white sm:p-8"><div className="mb-3 flex flex-wrap gap-2">{recipe.totalTime ? <MetaChip icon={<Clock3 className="h-4 w-4" />} label={formatIso8601Duration(recipe.totalTime) ?? recipe.totalTime} /> : null}{recipe.yieldText ? <MetaChip icon={<ListChecks className="h-4 w-4" />} label={`${recipe.yieldText} servings`} /> : null}</div></div></div></section>
    <div className="space-y-2 px-4"><p className="text-sm text-muted-foreground">Recipe from {recipe.householdName}</p><h1 className="max-w-3xl whitespace-pre-wrap font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">{recipe.title}</h1>{recipe.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground sm:text-base">{recipe.description}</p> : null}<p className="text-sm text-muted-foreground">Recipe version {recipe.versionNumber}</p></div>
    {recipe.sourceUrl ? <div className="flex gap-2"><Button asChild><a href={recipe.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />View original source</a></Button></div> : null}
    <RecipeContent recipe={recipe} />
  </PageShell></main>;
}
function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-4 py-2 text-sm backdrop-blur">{icon}{label}</div>; }
