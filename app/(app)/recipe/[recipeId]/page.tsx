import type { ReactNode } from "react";
import { Clock3, ExternalLink, ListChecks, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { AppTransitionLink } from "@/components/app-transition-link";
import { PageShell } from "@/components/page-shell";
import { RecipeImage } from "@/components/recipe-image";
import { CopyPublicRecipeLink } from "@/components/copy-public-recipe-link";
import { RecipeContent } from "@/components/recipe-content";
import { RecipeMetadataEditor } from "@/components/recipe-metadata-editor";
import { RecipeReviewLauncher } from "@/components/recipe-review-launcher";
import { RecipeVersionHistory } from "@/components/recipe-version-history";
import { PublishPersonalRecipe } from "@/components/publish-personal-recipe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RecipePageScrollToTop } from "@/app/(app)/recipe/[recipeId]/scroll-to-top";
import { extractRecipeAction } from "@/lib/actions/operations";
import { getCustomRecipeBoardOptions, getRecipeDetail } from "@/lib/server/queries";
import { formatIso8601Duration } from "@/lib/utils";
import { getCurrentUserAccess } from "@/lib/server/access";
import { getPublicRecipeUrl } from "@/lib/public-recipe-url";

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
  const [recipe, access, publishOptions] = await Promise.all([
    getRecipeDetail(recipeId),
    getCurrentUserAccess(),
    getCustomRecipeBoardOptions(),
  ]);

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
  return (
    <PageShell>
      <RecipePageScrollToTop />
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
              <RecipeImage
                src={recipe.imageUrl}
                previewSrc={recipe.previewImageUrl}
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
                      formatIso8601Duration(recipe.totalTime) ??
                      recipe.totalTime
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
        <CopyPublicRecipeLink url={getPublicRecipeUrl(recipe.recipeId)} />
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
        {recipe.pin.pinterestPinId.startsWith("personal:") ? (
          <PublishPersonalRecipe recipeId={recipe.recipeId} boards={publishOptions.boards} canPublish={publishOptions.canPublish} />
        ) : null}
      </div>

      <RecipeReviewLauncher
        recipeId={recipe.recipeId}
        recipeTitle={recipe.title}
        averageRating={recipe.averageRating}
        reviewCount={recipe.reviewCount}
        reviews={recipe.reviews}
      />

      <RecipeVersionHistory recipeId={recipe.recipeId} versions={recipe.versions} />

      <RecipeContent
        recipe={recipe}
        emptyIngredients={<EmptyRecipeState recipeId={recipe.recipeId} status={recipe.status} />}
        showEmptySteps={false}
      />

      {access.isAdmin && (
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
      )}
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
