import { CalendarPlus, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import { AppTransitionLink } from "@/components/app-transition-link";
import { PageShell } from "@/components/page-shell";
import { RecipeImage } from "@/components/recipe-image";
import { CopyPublicRecipeLink } from "@/components/copy-public-recipe-link";
import { RecipeContent } from "@/components/recipe-content";
import { RecipeMetadataEditor } from "@/components/recipe-metadata-editor";
import { RecipeReviewLauncher } from "@/components/recipe-review-launcher";
import { RecipeFlagButton } from "@/components/recipe-flag-button";
import { SaveForLaterButton } from "@/components/save-for-later-button";
import { StatusBadge } from "@/components/status-badge";
import { PublishPersonalRecipe } from "@/components/publish-personal-recipe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { RecipePageScrollToTop } from "@/app/(app)/recipe/[recipeId]/scroll-to-top";
import {
  getCustomRecipeBoardOptions,
  getRecipeDetail,
  getRecipeTags,
} from "@/lib/server/queries";
import { getCurrentUserAccess } from "@/lib/server/access";
import { getPublicRecipeUrl } from "@/lib/public-recipe-url";
import { SAVE_FOR_LATER_TAG_NORMALIZED_NAME } from "@/lib/recipe-tags";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const [recipe, access, publishOptions, availableTags] = await Promise.all([
    getRecipeDetail(recipeId),
    getCurrentUserAccess(),
    getCustomRecipeBoardOptions(),
    getRecipeTags(),
  ]);

  if (!recipe) {
    notFound();
  }

  return (
    <PageShell className="max-w-none">
      <RecipePageScrollToTop />
      <RecipeMetadataEditor
        recipeId={recipe.recipeId}
        title={recipe.title}
        description={recipe.description}
        tags={recipe.tags}
        availableTags={availableTags}
        byline={<RecipeByline siteName={recipe.siteName} sourceUrl={recipe.sourceUrl} />}
        content={
          <RecipeContent
            recipe={recipe}
            emptyIngredients={<EmptyRecipeState status={recipe.status} />}
            showEmptySteps={false}
          />
        }
        topContent={
          <div className="flex w-full flex-wrap gap-2">
            <SaveForLaterButton
              recipeId={recipe.recipeId}
              initiallySaved={recipe.tags.some(
                (tag) => tag.name.toLocaleLowerCase() === SAVE_FOR_LATER_TAG_NORMALIZED_NAME,
              )}
            />
            <Button asChild variant="secondary">
              <AppTransitionLink
                href={`/history?recipeId=${encodeURIComponent(recipe.recipeId)}&from=recipe`}
                prefetch
              >
                <CalendarPlus className="size-4" />
                Add
              </AppTransitionLink>
            </Button>
            <CopyPublicRecipeLink
              url={getPublicRecipeUrl(recipe.recipeId, recipe.primaryVersionNumber)}
            />
            <RecipeReviewLauncher
              buttonOnly
              recipeId={recipe.recipeId}
              recipeTitle={recipe.title}
              averageRating={recipe.averageRating}
              reviewCount={recipe.reviewCount}
              reviews={recipe.reviews}
            />

            {recipe.pin.pinterestPinId.startsWith("personal:") ? (
              <PublishPersonalRecipe
                recipeId={recipe.recipeId}
                boards={publishOptions.boards}
                canPublish={publishOptions.canPublish}
              />
            ) : null}
          </div>
        }
        afterDescriptionContent={
          <RecipeReviewLauncher
            recipeId={recipe.recipeId}
            recipeTitle={recipe.title}
            averageRating={recipe.averageRating}
            reviewCount={recipe.reviewCount}
            reviews={recipe.reviews}
          />
        }
      >
        <section className="relative aspect-[16/10] overflow-hidden rounded-t-[36px] border border-white/70 bg-white/70 shadow-soft sm:aspect-[16/8]">
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/25" />
        </section>
      </RecipeMetadataEditor>

      {recipe.status !== "recipe_ready" ? (
        <Card className="mx-auto w-full max-w-4xl bg-white/85">
          <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Recipe parsing status</p>
                <StatusBadge status={recipe.status} />
              </div>
              <p className="text-sm text-muted-foreground">{recipe.statusSummary}</p>
              {recipe.statusReason ? (
                <p className="text-sm text-destructive">{recipe.statusReason}</p>
              ) : null}
            </div>
            <RecipeFlagButton recipeId={recipe.recipeId} isFlagged={recipe.isFlagged} />
          </CardContent>
        </Card>
      ) : null}

      {access.isAdmin && (
        <Card className="mx-auto w-full max-w-4xl bg-white/85">
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

function RecipeByline({
  siteName,
  sourceUrl,
}: {
  siteName: string | null;
  sourceUrl: string | null;
}) {
  if (!siteName && !sourceUrl) {
    return null;
  }

  return (
    <p className="px-4 pb-2 text-sm text-muted-foreground sm:px-0">
      {siteName ? (
        <>
          From{" "}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold italic underline underline-offset-2"
            >
              {siteName}
              <Icon icon={ExternalLink} size="sm" />
            </a>
          ) : (
            <strong><em>{siteName}</em></strong>
          )}
        </>
      ) : (
        <>
          View{" "}
          <a
            href={sourceUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold italic underline underline-offset-2"
          >
            original recipe
            <Icon icon={ExternalLink} size="sm" />
          </a>
        </>
      )}
    </p>
  );
}

function EmptyRecipeState({
  status,
}: {
  status: string;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-dashed border-border bg-background/70 p-5">
      <p className="text-sm text-muted-foreground">
        {status === "not_extracted"
          ? "This recipe is synced and waiting for structured recipe content."
          : "Structured recipe content is not available yet for this recipe."}
      </p>
    </div>
  );
}
