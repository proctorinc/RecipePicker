"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  PlusCircle,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { createRecipeEventAction } from "@/lib/actions/operations";
import {
  cn,
  formatDay,
  formatRatingValue,
  getTodayDayString,
} from "@/lib/utils";
import type {
  RecipeHistoryDayView,
  RecipeHistoryEventView,
  RecipeHistoryPageView,
  RecipeHistoryRecipeOption,
} from "@/types/view-models";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecipeHistoryCalendar({
  history,
}: {
  history: RecipeHistoryPageView;
}) {
  const [dayDialogDate, setDayDialogDate] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] =
    useState<RecipeHistoryEventView | null>(null);
  const [editingReview, setEditingReview] =
    useState<RecipeHistoryEventView | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const today = getTodayDayString();
  const selectedDay = useMemo(
    () =>
      history.days.find((day) => day.date === dayDialogDate) ??
      history.days.find((day) => day.date === pickerDate) ??
      null,
    [dayDialogDate, history.days, pickerDate],
  );
  const visibleRecipeOptions = useMemo(() => {
    const normalized = deferredSearchValue.trim().toLocaleLowerCase();
    const base = normalized
      ? history.recipeOptions.filter((recipe) =>
          recipe.recipeTitle.toLocaleLowerCase().includes(normalized),
        )
      : history.recipeOptions;

    return base.slice(0, 12);
  }, [deferredSearchValue, history.recipeOptions]);

  function openDay(day: RecipeHistoryDayView) {
    if (day.events.length > 0) {
      setDayDialogDate(day.date);
      return;
    }

    setPickerDate(day.date);
  }

  function openAddRecipe(date: string) {
    setDayDialogDate(null);
    setPickerDate(date);
    setSearchValue("");
  }

  function handleReviewSuccess() {
    router.refresh();
  }

  function createEvent(recipe: RecipeHistoryRecipeOption, date: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("recipeId", recipe.recipeId);
      formData.set("date", date);

      const result = await createRecipeEventAction(
        { status: "idle", message: "" },
        formData,
      );

      if (result.status === "success") {
        toast.success(result.message);
        setPickerDate(null);
        setDayDialogDate(date);
        setSearchValue("");
        router.refresh();
        return;
      }

      toast.error(result.message);
    });
  }

  return (
    <>
      <section className="rounded-[24px] border border-white/70 bg-white/90 p-2 shadow-soft sm:rounded-[32px] sm:p-6">
        <div className="mb-3 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="text-center sm:order-2">
            {/*<p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:hidden">
              Recipe history
            </p>*/}
            <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold sm:text-2xl">
              {history.monthLabel}
            </h2>
          </div>
          <div className="w-full flex justify-center">
            <div className="flex justify-between max-w-xs gap-2 sm:order-1 sm:flex sm:w-auto sm:items-center">
              <Button
                asChild
                variant="outline"
                className="h-11 w-11 justify-center px-3 sm:w-auto"
                size="sm"
              >
                <Link
                  href={`/history?month=${encodeURIComponent(history.previousMonth)}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 w-48 justify-center px-3 sm:hidden"
                size="sm"
              >
                <Link
                  href={`/history?month=${encodeURIComponent(getTodayDayString().slice(0, 7))}`}
                >
                  Today
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 w-11 justify-center px-3 sm:w-auto"
                size="sm"
              >
                <Link
                  href={`/history?month=${encodeURIComponent(history.nextMonth)}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:gap-2 sm:text-xs sm:tracking-[0.24em]">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1 sm:py-2">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 bg-border sm:bg-transparent rounded-xl sm:gap-2 border sm:border-none gap-px overflow-hidden">
          {history.days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => openDay(day)}
              className={cn(
                "group relative flex flex-start w-full h-full aspect-[2/3] shrink-0 sm:aspect-square overflow-hidden sm:border p-1 text-left transition hover:border-primary/40 hover:bg-secondary/15 sm:rounded-[24px] sm:p-2",
                day.inCurrentMonth
                  ? "sm:border-border/70 bg-white/75"
                  : "sm:border-border/35 bg-muted/95 text-muted-foreground",
                day.isToday && "border-primary/40 ring-1 ring-primary/25",
              )}
            >
              {day.events.length > 0 ? (
                <DayPreviewImage event={day.events[day.events.length - 1]!} />
              ) : null}
              <div className="mb-1 flex items-start justify-between sm:mb-2">
                <span
                  className={cn(
                    "relative z-10 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold sm:h-8 sm:min-w-8 sm:text-sm",
                    day.events.length > 0 &&
                      !day.isToday &&
                      "bg-white/90 text-foreground",
                    day.isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {day.dayNumber}
                </span>
                {day.events.length > 1 ? (
                  <span className="hidden absolute right-1 bottom-1 z-10 sm:inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/90 px-1 text-[10px] font-semibold text-foreground sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-[11px]">
                    {day.events.length}
                  </span>
                ) : null}
              </div>

              {day.events.length === 0 ? (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 invisible flex items-center justify-center text-[10px] group-hover:visible sm:rounded-[18px]">
                  <Plus className="h-4 w-4 text-muted sm:h-5 sm:w-5" />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <Dialog
        open={Boolean(dayDialogDate && selectedDay)}
        onOpenChange={(open) => {
          if (!open) {
            setDayDialogDate(null);
          }
        }}
      >
        <DialogContent className="w-[min(96vw,42rem)] max-h-[92vh] overflow-y-auto p-4 sm:w-[min(92vw,42rem)] sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">
              {selectedDay ? formatDay(selectedDay.date) : "Meal details"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedDay?.isFuture
                ? "Planned recipes for this day."
                : "Recipes you ate today."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {selectedDay?.events.map((event) => (
              <article
                key={event.eventId}
                className="border border-border/70 bg-secondary/15 p-3 sm:p-4 rounded-2xl"
              >
                <div className="flex gap-3 sm:gap-4">
                  <Link
                    href={`/recipe/${event.recipeId}`}
                    className="relative w-20 h-20 shrink-0 aspect-2/3 rounded-[14px] overflow-hidden bg-secondary/40 sm:h-24 sm:w-24 sm:rounded-[18px]"
                  >
                    {event.recipeImageUrl ? (
                      <Image
                        src={event.recipeImageUrl}
                        alt={event.recipeTitle}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : null}
                  </Link>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                      <Link
                        href={`/recipe/${event.recipeId}`}
                        className="font-[family-name:var(--font-serif)] text-lg font-semibold sm:text-xl"
                      >
                        {event.recipeTitle}
                      </Link>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        {event.isPlanned ? "Planned" : "Eaten"}
                      </p>
                    </div>

                    {event.review ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <StarRating value={event.review.ratingValue} />
                          <span className="text-xs text-muted-foreground sm:text-sm">
                            {formatRatingValue(event.review.ratingValue)} / 5 by{" "}
                            {event.review.reviewerName}
                          </span>
                        </div>
                        {event.review.note ? (
                          <p className="text-xs leading-5 text-foreground sm:text-sm sm:leading-6">
                            {event.review.note}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {event.review.canEdit ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingReview(event)}
                            >
                              Edit review
                            </Button>
                          ) : null}
                          {event.review.canDelete ? (
                            <ReviewDeleteButton
                              reviewId={event.review.reviewId}
                              onSuccess={handleReviewSuccess}
                            />
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {event.canAddReview ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewTarget(event)}
                          >
                            Add review
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground sm:text-sm">
                            {event.isPlanned
                              ? "Reviews unlock after the planned date passes."
                              : "No review yet."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {selectedDay ? (
            <div className="mt-4 flex justify-end sm:mt-6">
              <Button
                type="button"
                className="h-11 w-full sm:w-auto"
                onClick={() => openAddRecipe(selectedDay.date)}
              >
                <Plus className="h-4 w-4" />
                {selectedDay.isFuture
                  ? "Add planned recipe"
                  : "Add eaten recipe"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pickerDate)}
        onOpenChange={(open) => {
          if (!open) {
            setPickerDate(null);
            setSearchValue("");
          }
        }}
      >
        <DialogContent className="w-[min(96vw,42rem)] max-h-[92vh] overflow-y-auto p-4 sm:w-[min(92vw,42rem)] sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">
              {pickerDate && pickerDate > today
                ? "Plan recipe"
                : "Add eaten recipe"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {pickerDate ? formatDay(pickerDate) : "Choose a date"}
            </DialogDescription>
          </DialogHeader>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search your recipes"
              className="h-11 pl-11 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleRecipeOptions.map((recipe) => (
              <button
                key={recipe.recipeId}
                type="button"
                disabled={!pickerDate || isPending}
                onClick={() => {
                  if (pickerDate) {
                    createEvent(recipe, pickerDate);
                  }
                }}
                className="group relative aspect-square overflow-hidden rounded-[24px] border border-border/70 bg-secondary/25 text-left"
              >
                {recipe.recipeImageUrl ? (
                  <Image
                    src={recipe.recipeImageUrl}
                    alt={recipe.recipeTitle}
                    fill
                    className="object-cover transition duration-200 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 50vw, 192px"
                  />
                ) : (
                  <div className="absolute inset-0 bg-secondary/70" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-sm font-medium text-white">
                    {recipe.recipeTitle}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {visibleRecipeOptions.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border/70 px-6 py-10 text-center text-sm text-muted-foreground">
              No recipes matched that search.
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <RecipeReviewDialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(null);
          }
        }}
        recipeId={reviewTarget?.recipeId ?? ""}
        recipeTitle={reviewTarget?.recipeTitle ?? ""}
        eventId={reviewTarget?.eventId ?? null}
        initialEatenOn={reviewTarget?.date ?? null}
        allowDateEditing={false}
        onSuccess={handleReviewSuccess}
      />

      <RecipeReviewDialog
        open={Boolean(editingReview?.review)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingReview(null);
          }
        }}
        recipeId={editingReview?.recipeId ?? ""}
        recipeTitle={editingReview?.recipeTitle ?? ""}
        review={editingReview?.review ?? null}
        eventId={editingReview?.eventId ?? null}
        initialEatenOn={editingReview?.date ?? null}
        allowDateEditing={false}
        onSuccess={handleReviewSuccess}
      />
    </>
  );
}

function DayPreviewImage({ event }: { event: RecipeHistoryEventView }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {event.recipeImageUrl ? (
        <Image
          src={event.recipeImageUrl}
          alt={event.recipeTitle}
          fill
          className="object-cover"
          sizes="220px"
        />
      ) : (
        <div className="absolute inset-0 bg-secondary/80" />
      )}
    </div>
  );
}
