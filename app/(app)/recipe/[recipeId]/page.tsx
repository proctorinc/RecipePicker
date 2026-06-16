import type { ReactNode } from "react";
import Image from "next/image";
import {
  Clock3,
  ExternalLink,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { AppTransitionLink } from "@/components/app-transition-link";
import { PageShell } from "@/components/page-shell";
import { RecipeMetadataEditor } from "@/components/recipe-metadata-editor";
import { RecipeReviewLauncher } from "@/components/recipe-review-launcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractRecipeAction } from "@/lib/actions/operations";
import { getRecipeDetail } from "@/lib/server/queries";
import { formatIso8601Duration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ reviewRecipeId?: string; historyMonth?: string }>;
}) {
  const { recipeId } = await params;
  const { reviewRecipeId, historyMonth } = await searchParams;
  const recipe = await getRecipeDetail(recipeId);

  if (!recipe) {
    notFound();
  }

  const backHref =
    reviewRecipeId && reviewRecipeId === recipeId
      ? `/history?recipeId=${encodeURIComponent(recipeId)}&from=recipe${historyMonth ? `&month=${encodeURIComponent(historyMonth)}` : ""}`
      : "/";
  const backLabel =
    reviewRecipeId && reviewRecipeId === recipeId
      ? "Back to review"
      : "Back to feed";
  const detailItems = [
    {
      label: "Total time",
      value: formatIso8601Duration(recipe.totalTime),
    },
    {
      label: "Prep time",
      value: formatIso8601Duration(recipe.prepTime),
    },
    {
      label: "Cook time",
      value: formatIso8601Duration(recipe.cookTime),
    },
    {
      label: "Servings",
      value: recipe.yieldText,
    },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value),
  );

  return (
    <PageShell>
      <RecipeMetadataEditor
        recipeId={recipe.recipeId}
        title={recipe.title}
        description={recipe.description}
        backHref={backHref}
        backLabel={backLabel}
      >
        <section className="overflow-hidden rounded-t-[36px] border border-white/70 bg-white/70 shadow-soft">
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
            <div className="absolute inset-x-0 bottom-0 p-2 text-white sm:p-8">
              <div className="mb-3 flex flex-wrap gap-2">
                {recipe.totalTime ? (
                  <MetaChip
                    icon={<Clock3 className="h-4 w-4" />}
                    label={
                      formatIso8601Duration(recipe.totalTime) ?? recipe.totalTime
                    }
                  />
                ) : null}
                {recipe.yieldText ? (
                  <MetaChip
                    icon={<ListChecks className="h-4 w-4" />}
                    label={`${recipe.yieldText} servings`}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </RecipeMetadataEditor>

      <div className="flex gap-2 w-full">
        {recipe.sourceUrl && (
          <Button asChild>
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              View recipe source
            </a>
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

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {detailItems.length > 0 ? (
            <Card className="bg-white/85">
              <CardHeader>
                <CardTitle>Recipe details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {detailItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[20px] bg-secondary/35 px-4 py-3"
                    >
                      <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {item.label}
                      </dt>
                      <dd className="mt-1 text-base font-medium text-foreground">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle>Ingredients</CardTitle>
            </CardHeader>
            <CardContent className="px-10">
              {recipe.ingredients.length > 0 ? (
                <ul className="space-y-3">
                  {recipe.ingredients.map((ingredient) => (
                    <li key={ingredient.id} className="list-disc">
                      <p className="font-medium text-foreground">
                        {ingredient.displayText}
                      </p>
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
        </div>

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
              <AppTransitionLink
                href={`/settings/recipes/${recipe.recipeId}`}
                prefetch
              >
                Detailed settings
              </AppTransitionLink>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
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
          <AppTransitionLink href={`/settings/recipes/${recipeId}`} prefetch>
            Open settings
          </AppTransitionLink>
        </Button>
      </div>
    </div>
  );
}
