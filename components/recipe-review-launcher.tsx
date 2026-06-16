"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ReviewDeleteButton } from "@/components/review-delete-button";
import { RecipeReviewDialog } from "@/components/recipe-review-dialog";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { RecipeReviewView } from "@/types/view-models";
import { formatDay, formatRatingValue, getTodayMonthString } from "@/lib/utils";

type RecipeReviewLauncherProps = {
  recipeId: string;
  recipeTitle: string;
  averageRating: number | null;
  reviewCount: number;
  reviews: RecipeReviewView[];
};

export function RecipeReviewLauncher({
  recipeId,
  recipeTitle,
  averageRating,
  reviewCount,
  reviews,
}: RecipeReviewLauncherProps) {
  const [rateFlowOpen, setRateFlowOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(5);
  const [editingReview, setEditingReview] = useState<RecipeReviewView | null>(
    null,
  );
  const averageLabel = useMemo(
    () => formatRatingValue(averageRating),
    [averageRating],
  );

  return (
    <>
      <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">
              Meal reviews
            </p>
            <div className="flex items-center gap-3">
              <StarRating value={averageRating ?? 0} />
              <p className="text-sm text-muted-foreground">
                {reviewCount > 0
                  ? `${averageLabel} (${reviewCount} review${reviewCount === 1 ? "" : "s"})`
                  : "No reviews yet"}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {/*<div>
              <p className="mb-2 text-sm font-medium">
                How did this meal turn out?
              </p>
              <StarRating
                value={selectedRating}
                onChange={(value) => {
                  setSelectedRating(value);
                  setCreateOpen(true);
                }}
              />
            </div>*/}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSelectedRating(5);
                  setRateFlowOpen(true);
                }}
              >
                Rate recipe
              </Button>
              {reviewCount > 0 ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline">
                      See {reviewCount} review{reviewCount === 1 ? "" : "s"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[min(92vw,48rem)] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Reviews</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {reviews.map((review) => (
                        <article
                          key={review.reviewId}
                          className="rounded-[24px] border border-border/60 bg-secondary/20 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <StarRating value={review.ratingValue} />
                                <span className="text-sm text-muted-foreground">
                                  {formatRatingValue(review.ratingValue)} / 5
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {review.eatenOn
                                  ? `${formatDay(review.eatenOn)} by `
                                  : "No date included by "}
                                {review.reviewerName}
                              </p>
                              {review.note ? (
                                <p className="text-sm leading-6 text-foreground">
                                  {review.note}
                                </p>
                              ) : null}
                            </div>
                            {review.canEdit || review.canDelete ? (
                              <div className="flex gap-2">
                                {review.canEdit ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingReview(review)}
                                  >
                                    Edit
                                  </Button>
                                ) : null}
                                {review.canDelete ? (
                                  <ReviewDeleteButton
                                    reviewId={review.reviewId}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={rateFlowOpen} onOpenChange={setRateFlowOpen}>
        <DialogContent className="w-[min(92vw,32rem)]">
          <DialogHeader>
            <DialogTitle>Add a rating</DialogTitle>
            <DialogDescription>
              Did you eat this recipe on a specific day?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full whitespace-normal justify-start rounded-[24px] px-5 py-4 text-left"
              onClick={() => {
                setRateFlowOpen(false);
                setCreateOpen(true);
              }}
            >
              <span className="flex min-w-0 flex-col items-start">
                <span className="font-medium">No date</span>
                <span className="text-sm font-normal leading-5 text-muted-foreground">
                  Eat it too long ago? Just add a review for this recipe
                </span>
              </span>
            </Button>
            <Button
              asChild
              type="button"
              variant="secondary"
              className="h-auto w-full whitespace-normal justify-start rounded-[24px] px-5 py-4 text-left"
            >
              <Link
                href={`/history?month=${encodeURIComponent(getTodayMonthString())}&recipeId=${encodeURIComponent(recipeId)}&from=recipe`}
                className="w-full"
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="font-medium">Add date</span>
                  <span className="text-sm font-normal leading-5 text-muted-foreground">
                    Ate this recently? Add this to your meal history.
                  </span>
                </span>
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RecipeReviewDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        recipeId={recipeId}
        recipeTitle={recipeTitle}
        initialRating={selectedRating}
        showDateField={false}
      />
      <RecipeReviewDialog
        open={Boolean(editingReview)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingReview(null);
          }
        }}
        recipeId={recipeId}
        recipeTitle={recipeTitle}
        review={editingReview}
      />
    </>
  );
}
