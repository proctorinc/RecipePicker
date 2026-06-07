"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RecipeReviewDialog } from "@/components/recipe-review-dialog";
import { ReviewDeleteButton } from "@/components/review-delete-button";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  RecipeHistoryItemView,
  RecipeHistoryRecipeOption,
} from "@/types/view-models";
import { formatDay, formatRatingValue } from "@/lib/utils";

const REVIEW_RECIPE_PARAM = "reviewRecipeId";

export function ReviewHistoryList({
  items,
  recipeOptions,
}: {
  items: RecipeHistoryItemView[];
  recipeOptions: RecipeHistoryRecipeOption[];
}) {
  const [editingReview, setEditingReview] =
    useState<RecipeHistoryItemView | null>(null);
  const [newReview, setNewReview] = useState<{
    recipeId: string;
    recipeTitle: string;
    ratingValue: number;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reviewRecipeId = searchParams.get(REVIEW_RECIPE_PARAM);
  const matchingRecipes = useMemo(() => {
    const normalizedSearch = deferredSearchValue.trim().toLocaleLowerCase();
    const matches = normalizedSearch
      ? recipeOptions.filter((recipe) =>
          recipe.recipeTitle.toLocaleLowerCase().includes(normalizedSearch),
        )
      : recipeOptions;

    return matches.slice(0, 6);
  }, [deferredSearchValue, recipeOptions]);
  const reviewRecipe = useMemo(
    () =>
      reviewRecipeId
        ? (recipeOptions.find((recipe) => recipe.recipeId === reviewRecipeId) ??
          null)
        : null,
    [recipeOptions, reviewRecipeId],
  );
  const newReviewRecipeHref = useMemo(() => {
    if (!newReview?.recipeId) {
      return null;
    }

    return `/recipe/${newReview.recipeId}?reviewRecipeId=${encodeURIComponent(newReview.recipeId)}`;
  }, [newReview?.recipeId]);

  const setReviewRecipeParam = useCallback(
    (recipeId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (recipeId) {
        params.set(REVIEW_RECIPE_PARAM, recipeId);
      } else {
        params.delete(REVIEW_RECIPE_PARAM);
      }

      router.replace(
        params.toString() ? `${pathname}?${params.toString()}` : pathname,
        { scroll: false },
      );
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!reviewRecipeId) {
      setNewReview(null);
      return;
    }

    if (!reviewRecipe) {
      setReviewRecipeParam(null);
      return;
    }

    setPickerOpen(false);
    setNewReview((current) => {
      if (
        current?.recipeId === reviewRecipe.recipeId &&
        current.recipeTitle === reviewRecipe.recipeTitle
      ) {
        return current;
      }

      return {
        recipeId: reviewRecipe.recipeId,
        recipeTitle: reviewRecipe.recipeTitle,
        ratingValue: 5,
      };
    });
  }, [reviewRecipe, reviewRecipeId, setReviewRecipeParam]);

  function selectRecipe(recipe: RecipeHistoryRecipeOption) {
    setNewReview({
      recipeId: recipe.recipeId,
      recipeTitle: recipe.recipeTitle,
      ratingValue: 5,
    });
    setPickerOpen(false);
    setSearchValue("");
    setReviewRecipeParam(recipe.recipeId);
  }

  function closeNewReview() {
    setNewReview(null);
    setReviewRecipeParam(null);
  }

  return (
    <>
      <div className="space-y-4">
        <Button
          type="button"
          className="w-full md:w-fit"
          onClick={() => setPickerOpen(true)}
          disabled={recipeOptions.length === 0}
        >
          Add review
        </Button>

        {items.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-border bg-white/80 px-6 py-10 text-center text-muted-foreground">
            {recipeOptions.length > 0
              ? "No meal reviews yet. Start your history by adding one here."
              : "No recipes are available yet. Sync or add recipes first, then you can review them here."}
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.reviewId}
              className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-soft"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href={`/recipe/${item.recipeId}`}
                  className="relative h-24 w-full overflow-hidden rounded-[22px] bg-secondary/30 sm:w-32"
                >
                  {item.recipeImageUrl ? (
                    <Image
                      src={item.recipeImageUrl}
                      alt={item.recipeTitle}
                      fill
                      className="object-cover"
                      sizes="128px"
                    />
                  ) : null}
                </Link>
                <div className="flex-1 space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <Link
                        href={`/recipe/${item.recipeId}`}
                        className="font-[family-name:var(--font-serif)] text-2xl font-semibold"
                      >
                        {item.recipeTitle}
                      </Link>
                      <div className="flex items-center gap-3">
                        <StarRating value={item.ratingValue} />
                        <span className="text-sm text-muted-foreground">
                          {formatRatingValue(item.ratingValue)} / 5
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.eatenOn
                          ? `${formatDay(item.eatenOn)} by `
                          : "No date included by "}
                        {item.reviewerName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewReview({
                            recipeId: item.recipeId,
                            recipeTitle: item.recipeTitle,
                            ratingValue: item.ratingValue,
                          });
                          setReviewRecipeParam(item.recipeId);
                        }}
                      >
                        Review again
                      </Button>
                      {item.canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingReview(item)}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {item.canDelete ? (
                        <ReviewDeleteButton reviewId={item.reviewId} />
                      ) : null}
                    </div>
                  </div>
                  {item.note ? (
                    <p className="text-sm leading-6 text-foreground">
                      {item.note}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) {
            setSearchValue("");
          }
        }}
      >
        <DialogContent className="w-[min(92vw,34rem)]">
          <DialogHeader>
            <DialogTitle>Add meal review</DialogTitle>
            <DialogDescription>
              Search your household recipes, then pick one to jump into the
              review form.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">
                Recipe
              </span>
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search by recipe title"
                className="flex h-12 w-full rounded-full border border-border bg-background/90 px-5 py-3 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
            </label>
            <div className="h-[50vh] space-y-3 overflow-y-auto pr-1">
              {matchingRecipes.length > 0 ? (
                matchingRecipes.map((recipe) => (
                  <button
                    key={recipe.recipeId}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[22px] border border-border/60 bg-secondary/20 pr-4 py-0 overflow-hidden text-left transition hover:bg-secondary/35"
                    onClick={() => selectRecipe(recipe)}
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-secondary/40">
                      {recipe.recipeImageUrl ? (
                        <Image
                          src={recipe.recipeImageUrl}
                          alt={recipe.recipeTitle}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      ) : null}
                    </div>
                    <span className="font-medium text-foreground line-clamp-3">
                      {recipe.recipeTitle}
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/70 bg-secondary/10 px-4 py-5 text-sm text-muted-foreground">
                  No recipes match that search yet.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RecipeReviewDialog
        open={Boolean(editingReview)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingReview(null);
          }
        }}
        recipeId={editingReview?.recipeId ?? ""}
        recipeTitle={editingReview?.recipeTitle ?? ""}
        review={editingReview}
      />
      <RecipeReviewDialog
        open={Boolean(newReview)}
        onOpenChange={(open) => {
          if (!open) {
            closeNewReview();
          }
        }}
        recipeId={newReview?.recipeId ?? ""}
        recipeTitle={newReview?.recipeTitle ?? ""}
        initialRating={newReview?.ratingValue ?? 5}
        viewRecipeHref={newReviewRecipeHref ?? undefined}
      />
    </>
  );
}
