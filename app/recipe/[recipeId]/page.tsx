import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { RecipeReviewLauncher } from "@/components/recipe-review-launcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractRecipeAction } from "@/lib/actions/operations";
import { getRecipeDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ reviewRecipeId?: string }>;
}) {
  const { recipeId } = await params;
  const { reviewRecipeId } = await searchParams;
  const recipe = await getRecipeDetail(recipeId);
  const isEnabled = false;

  if (!recipe) {
    notFound();
  }

  const backHref =
    reviewRecipeId && reviewRecipeId === recipeId
      ? `/history?reviewRecipeId=${encodeURIComponent(recipeId)}`
      : "/";
  const backLabel =
    reviewRecipeId && reviewRecipeId === recipeId
      ? "Back to review"
      : "Back to feed";

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        </Button>
      </div>

      <section className="overflow-hidden rounded-[36px] border border-white/70 bg-white/70 shadow-soft">
        <div className="relative aspect-[16/10] sm:aspect-[16/8]">
          {recipe.imageUrl ? (
            <Image
              src={recipe.imageUrl}
              alt={recipe.title}
              fill
              className="object-cover"
              sizes="100vw"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                backgroundColor:
                  recipe.dominantColor ?? "rgba(214, 196, 176, 0.65)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <div className="mb-3 flex flex-wrap gap-2">
              {recipe.totalTime ? (
                <MetaChip
                  icon={<Clock3 className="h-4 w-4" />}
                  label={recipe.totalTime}
                />
              ) : null}
              {recipe.yieldText ? (
                <MetaChip
                  icon={<ListChecks className="h-4 w-4" />}
                  label={recipe.yieldText}
                />
              ) : null}
              {recipe.siteName ? (
                <MetaChip
                  icon={<Sparkles className="h-4 w-4" />}
                  label={recipe.siteName}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2 px-4">
        <h2 className="max-w-2xl font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">
          {recipe.title}
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          {recipe.description}
        </p>
      </div>

      <div className="flex gap-2 w-full">
        {recipe.sourceUrl && (
          <Button asChild>
            <Link href={recipe.sourceUrl}>
              <ExternalLink className="size-4" />
              View recipe source
            </Link>
          </Button>
        )}

        {recipe.pin?.link && (
          <Button asChild variant="outline">
            <a href={recipe.pin.link} target="_blank" rel="noreferrer">
              View on pinterest
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>

      <RecipeReviewLauncher
        recipeId={recipe.recipeId}
        recipeTitle={recipe.title}
        averageRating={recipe.averageRating}
        reviewCount={recipe.reviewCount}
        reviews={recipe.reviews}
      />

      {isEnabled && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr]">
          {recipe.ingredients.length > 0 && (
            <Card className="bg-white/85">
              <CardHeader>
                <CardTitle>Ingredients</CardTitle>
              </CardHeader>
              <CardContent className="px-10">
                {recipe.ingredients.length > 0 ? (
                  <ul className="space-y-3">
                    {recipe.ingredients.map((ingredient) => (
                      <li
                        key={ingredient.id}
                        className="list-disc"
                        // className="rounded-[22px] bg-secondary/60 px-4 py-4"
                      >
                        <p className="font-medium text-foreground">
                          {ingredient.displayText}
                        </p>
                        {ingredient.notes ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {ingredient.notes}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyRecipeState
                    recipeId={recipe.recipeId}
                    status={recipe.status}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {recipe.steps.length > 0 && (
            <Card className="bg-white/85">
              <CardHeader>
                <CardTitle>Recipe</CardTitle>
              </CardHeader>
              <CardContent>
                {recipe.steps.length > 0 ? (
                  <ol className="space-y-4">
                    {recipe.steps.map((step, index) => (
                      <li
                        key={step.id}
                        className="flex gap-4 rounded-[24px] bg-secondary/40 p-4"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-sm">
                          {index + 1}
                        </div>
                        <div>
                          {step.section ? (
                            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {step.section}
                            </p>
                          ) : null}
                          <p className="leading-7">{step.text}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyRecipeState
                    recipeId={recipe.recipeId}
                    status={recipe.status}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {isEnabled && (
        <Card className="bg-white/85">
          <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Recipe source and parsing</p>
              <p className="text-sm text-muted-foreground">
                {recipe.extractionSummary ??
                  "This recipe has not been parsed into structured instructions yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {recipe.sourceUrl && (
                <Button asChild variant="outline">
                  <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                    Source page
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link href={`/settings/recipes/${recipe.recipeId}`}>
                  Detailed settings
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function MetaChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-4 py-2 text-sm backdrop-blur">
      {icon}
      {label}
    </div>
  );
}

function EmptyRecipeState({
  recipeId,
  status,
}: {
  recipeId: string;
  status: string;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-dashed border-border bg-background/70 p-5">
      <p className="text-sm text-muted-foreground">
        {status === "not_extracted"
          ? "This recipe is synced, but its recipe content has not been extracted yet."
          : "Structured recipe content is not available yet for this recipe."}
      </p>
      <div className="flex flex-wrap gap-3">
        <ActionForm
          action={extractRecipeAction}
          fields={{ recipeId: String(recipeId) }}
          buttonVariant="secondary"
        >
          Extract recipe
        </ActionForm>
        <Button asChild variant="ghost">
          <Link href={`/settings/recipes/${recipeId}`}>Open settings</Link>
        </Button>
      </div>
    </div>
  );
}
