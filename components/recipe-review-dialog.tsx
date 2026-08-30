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
import { formatDay, getTodayDayString } from "@/lib/utils";
import { StarRating } from "@/components/star-rating";
import { RatingValuePicker } from "@/components/rating-value-picker";
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
    () => review?.ratingValue ?? initialRating ?? 3.5,
    [initialRating, review?.ratingValue],
  );
  const defaultEatenOn = review?.eatenOn ?? initialEatenOn ?? "";
  const [ratingValue, setRatingValue] = useState(defaultRating);
  const [eatenOn, setEatenOn] = useState(defaultEatenOn);
  const dateIncluded = Boolean(eatenOn) || Boolean(eventId);
  const [note, setNote] = useState(review?.note ?? "");
  const [removeImage, setRemoveImage] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setRatingValue(defaultRating);
    setEatenOn(defaultEatenOn);
    setNote(review?.note ?? "");
    setRemoveImage(false);
    setSelectedImageName("");
    if (imageInputRef.current) imageInputRef.current.value = "";
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
          {removeImage ? <input type="hidden" name="removeImage" value="true" /> : null}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Rating</p>
            <div className="flex items-center justify-between gap-4 rounded-[24px] border border-border/70 bg-secondary/20 px-4 py-4">
              <StarRating value={ratingValue} />
              <div className="flex items-center gap-2">
                <RatingValuePicker value={ratingValue} onChange={setRatingValue} />
                <span className="text-sm font-medium text-muted-foreground">/ 5</span>
              </div>
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

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Photo</p>
              <p className="text-xs text-muted-foreground">Optional — take one now or choose one from your library.</p>
            </div>
            {review?.imageUrl && !removeImage && !selectedImageName ? (
              <div className="overflow-hidden rounded-[20px] border border-border/60 bg-secondary/20">
                {/* Review photos are trusted public Blob URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={review.imageUrl} alt="Current review photo" className="max-h-56 w-full object-cover" />
              </div>
            ) : null}
            <Input
              ref={imageInputRef}
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedImageName(file?.name ?? "");
                if (file) setRemoveImage(false);
              }}
            />
            {selectedImageName ? <p className="text-xs text-muted-foreground">Selected: {selectedImageName}</p> : null}
            {review?.imageUrl && !selectedImageName && !removeImage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRemoveImage(true);
                  if (imageInputRef.current) imageInputRef.current.value = "";
                }}
              >
                Remove photo
              </Button>
            ) : null}
            {removeImage ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveImage(false)}>
                Keep current photo
              </Button>
            ) : null}
          </div>

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
