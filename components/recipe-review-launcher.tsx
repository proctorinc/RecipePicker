"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Star } from "lucide-react";

import { ReviewDeleteButton } from "@/components/review-delete-button";
import { RecipeReviewDialog } from "@/components/recipe-review-dialog";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RecipeReviewView } from "@/types/view-models";
import { formatDay, formatRatingValue, getTodayMonthString } from "@/lib/utils";

type RecipeReviewLauncherProps = {
  recipeId: string;
  recipeTitle: string;
  averageRating: number | null;
  reviewCount: number;
  reviews: RecipeReviewView[];
  buttonOnly?: boolean;
};

export function RecipeReviewLauncher({
  recipeId,
  recipeTitle,
  averageRating,
  reviewCount,
  reviews,
  buttonOnly = false,
}: RecipeReviewLauncherProps) {
  const [rateFlowOpen, setRateFlowOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(3.5);
  const [editingReview, setEditingReview] = useState<RecipeReviewView | null>(
    null,
  );
  const averageLabel = useMemo(
    () => formatRatingValue(averageRating),
    [averageRating],
  );

  return (
    <>
      {buttonOnly ? (
        <Button
          type="button"
          onClick={() => {
            setSelectedRating(3.5);
            setRateFlowOpen(true);
          }}
        >
          <Icon icon={Star} size="sm" />
          Review
        </Button>
      ) : (
        <Card
          className={
            reviewCount > 0
              ? "cursor-pointer bg-white/85 transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              : "bg-white/85"
          }
          role={reviewCount > 0 ? "button" : undefined}
          tabIndex={reviewCount > 0 ? 0 : undefined}
          aria-label={
            reviewCount > 0 ? `View ${reviewCount} reviews` : undefined
          }
          onClick={reviewCount > 0 ? () => setReviewsOpen(true) : undefined}
          onKeyDown={
            reviewCount > 0
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setReviewsOpen(true);
                  }
                }
              : undefined
          }
        >
          <CardHeader>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Reviews</CardTitle>
                {reviewCount > 0 ? (
                  <span className="text-sm font-medium text-muted-foreground underline underline-offset-4">
                    View all
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <StarRating value={averageRating ?? 0} />
                <p className="text-sm text-muted-foreground">
                  {reviewCount > 0
                    ? `${averageLabel} (${reviewCount} review${reviewCount === 1 ? "" : "s"})`
                    : "No reviews yet"}
                </p>
              </div>
            </div>
            {reviewCount > 0 ? (
              <Dialog open={reviewsOpen} onOpenChange={setReviewsOpen}>
                <DialogContent className="w-[min(92vw,48rem)] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="pb-4">Reviews</DialogTitle>
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
                              {review.reviewerName} · Version{" "}
                              {review.recipeVersionNumber}
                            </p>
                            {review.note ? (
                              <p className="text-sm leading-6 text-foreground">
                                {review.note}
                              </p>
                            ) : null}
                            {review.imageUrl ? (
                              // Review photos are trusted public Blob URLs.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={review.imageUrl}
                                alt={`Photo from ${review.reviewerName}'s review`}
                                className="max-h-72 w-full rounded-[18px] object-cover"
                              />
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
          </CardHeader>
        </Card>
      )}

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
