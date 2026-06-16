"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  createRecipeReviewAction,
  updateRecipeReviewAction,
} from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type { RecipeReviewView } from "@/types/view-models";
import { formatDay, formatRatingValue, getTodayDayString } from "@/lib/utils";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

type RecipeReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeTitle: string;
  review?: RecipeReviewView | null;
  initialRating?: number;
  viewRecipeHref?: string;
  eventId?: string | null;
  initialEatenOn?: string | null;
  showDateField?: boolean;
  allowDateEditing?: boolean;
  dismissLabel?: string;
  onSuccess?: () => void;
};

export function RecipeReviewDialog({
  open,
  onOpenChange,
  recipeId,
  recipeTitle,
  review,
  initialRating,
  viewRecipeHref,
  eventId,
  initialEatenOn,
  showDateField = true,
  allowDateEditing = true,
  dismissLabel = "Cancel",
  onSuccess,
}: RecipeReviewDialogProps) {
  const action = review ? updateRecipeReviewAction : createRecipeReviewAction;
  const [state, formAction] = useActionState(action, initialActionState);
  const defaultRating = useMemo(
    () => review?.ratingValue ?? initialRating ?? 5,
    [initialRating, review?.ratingValue],
  );
  const defaultEatenOn = review?.eatenOn ?? initialEatenOn ?? "";
  const [ratingValue, setRatingValue] = useState(defaultRating);
  const [eatenOn, setEatenOn] = useState(defaultEatenOn);
  const dateIncluded = Boolean(eatenOn) || Boolean(eventId);
  const [note, setNote] = useState(review?.note ?? "");
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setRatingValue(defaultRating);
    setEatenOn(defaultEatenOn);
    setNote(review?.note ?? "");
  }, [defaultEatenOn, defaultRating, open, review?.note]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      onOpenChange(false);
      onSuccess?.();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [onOpenChange, onSuccess, state]);

  useEffect(() => {
    if (!open || !dateIncluded || !allowDateEditing) {
      return;
    }

    const input = dateInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    if (typeof input.showPicker === "function") {
      input.showPicker();
    }
  }, [allowDateEditing, dateIncluded, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,38rem)]">
        <DialogHeader>
          <DialogTitle>
            {review ? "Edit review" : "Add recipe review"}
          </DialogTitle>
          <DialogDescription>{recipeTitle}</DialogDescription>
        </DialogHeader>
        <div>
          {!review && viewRecipeHref ? (
            <Button
              asChild
              type="button"
              variant="outline"
              className="w-full mt-4"
            >
              <Link href={viewRecipeHref}>Review recipe</Link>
            </Button>
          ) : null}
          <p className="text-xs font-light">
            You can still resume the review after
          </p>
        </div>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="recipeId" value={recipeId} />
          {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
          {review ? (
            <input type="hidden" name="reviewId" value={review.reviewId} />
          ) : null}
          <input type="hidden" name="ratingValue" value={ratingValue} />

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Rating</p>
            <div className="flex items-center justify-between gap-4 rounded-[24px] border border-border/70 bg-secondary/20 px-4 py-4">
              <StarRating value={ratingValue} onChange={setRatingValue} />
              <span className="text-sm font-medium text-muted-foreground">
                {formatRatingValue(ratingValue)} / 5
              </span>
            </div>
          </div>

          {showDateField ? (
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Date eaten
              </span>
              {allowDateEditing ? (
                <div className="flex gap-3">
                  {dateIncluded ? (
                    <Input
                      ref={dateInputRef}
                      type="date"
                      name="eatenOn"
                      value={eatenOn}
                      onChange={(event) => setEatenOn(event.target.value)}
                      aria-label="Date eaten"
                      className="h-11 w-1/2 border-primary bg-primary py-0 text-primary-foreground [color-scheme:dark]"
                      max={getTodayDayString()}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-1/2"
                      onClick={() => setEatenOn(todayDate())}
                    >
                      Add a date
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={dateIncluded ? "outline" : "default"}
                    className="w-1/2"
                    onClick={() => setEatenOn("")}
                  >
                    No date
                  </Button>
                </div>
              ) : (
                <>
                  <input type="hidden" name="eatenOn" value={eatenOn} />
                  <div className="rounded-[24px] border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-foreground">
                    {formatDay(eatenOn)}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Notes</span>
            <Textarea
              name="note"
              placeholder="What worked well, what could be better, or what you’d improve next time."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="text-xs font-light text-foreground px-4 text-center">
              More detailed feedback and suggestions will help power your recipe
              insights later!
            </p>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                {dismissLabel}
              </Button>
              <ReviewSubmitButton>
                {review ? "Save changes" : "Save review"}
              </ReviewSubmitButton>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewSubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : children}
    </Button>
  );
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
