"use client";

import Image from "next/image";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppTransitionLink } from "@/components/app-transition-link";
import { useAppRouteTransition } from "@/components/app-route-transition";
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
  FeedPinsPage,
  RecipeHistoryDayView,
  RecipeHistoryEventView,
  RecipeHistoryPageView,
  RecipeHistoryRecipeOption,
} from "@/types/view-models";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ReviewDialogTarget = {
  eventId: string | null;
  recipeId: string;
  recipeTitle: string;
  date: string | null;
  dismissLabel?: string;
};

export function RecipeHistoryCalendar({
  history,
  fromRecipe = false,
}: {
  history: RecipeHistoryPageView;
  fromRecipe?: boolean;
}) {
  const [dayDialogDate, setDayDialogDate] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] =
    useState<ReviewDialogTarget | null>(null);
  const [editingReview, setEditingReview] =
    useState<RecipeHistoryEventView | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const [searchedRecipeOptions, setSearchedRecipeOptions] = useState<
    RecipeHistoryRecipeOption[] | null
  >(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { startNavigation } = useAppRouteTransition();
  const today = getTodayDayString();
  const historyBaseHref = history.selectedRecipe
    ? `/history?month=${encodeURIComponent(history.month)}&recipeId=${encodeURIComponent(history.selectedRecipe.recipeId)}${fromRecipe ? "&from=recipe" : ""}`
    : `/history?month=${encodeURIComponent(history.month)}`;
  const postCreateHistoryHref = `/history?month=${encodeURIComponent(history.month)}`;
  const recipeOptionsById = useMemo(
    () =>
      new Map(
        history.recipeOptions.map((recipe) => [recipe.recipeId, recipe] as const),
      ),
    [history.recipeOptions],
  );
  const selectedDay = useMemo(
    () =>
      history.days.find((day) => day.date === dayDialogDate) ??
      history.days.find((day) => day.date === pickerDate) ??
      null,
    [dayDialogDate, history.days, pickerDate],
  );

  useEffect(() => {
    const normalized = deferredSearchValue.trim();

    if (!normalized) {
      setSearchedRecipeOptions(null);
      setIsSearchLoading(false);
      return;
    }

    let cancelled = false;

    async function searchRecipes() {
      setIsSearchLoading(true);

      try {
        const response = await fetch(
          `/api/feed?q=${encodeURIComponent(normalized)}&pageSize=12`,
        );

        if (!response.ok) {
          throw new Error("Unable to search recipes.");
        }

        const page = (await response.json()) as FeedPinsPage;
        const seenRecipeIds = new Set<string>();
        const nextOptions = page.items
          .filter((item) => item.hasRecipe)
          .map(
            (item) =>
              recipeOptionsById.get(item.recipeId) ?? {
                recipeId: item.recipeId,
                recipeTitle: item.title,
                recipeImageUrl: item.imageUrl,
              },
          )
          .filter((recipe) => {
            if (seenRecipeIds.has(recipe.recipeId)) {
              return false;
            }

            seenRecipeIds.add(recipe.recipeId);
            return true;
          });

        if (!cancelled) {
          setSearchedRecipeOptions(nextOptions);
        }
      } catch {
        if (!cancelled) {
          const fallbackQuery = normalized.toLocaleLowerCase();
          setSearchedRecipeOptions(
            history.recipeOptions.filter((recipe) =>
              recipe.recipeTitle.toLocaleLowerCase().includes(fallbackQuery),
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearchLoading(false);
        }
      }
    }

    void searchRecipes();

    return () => {
      cancelled = true;
    };
  }, [deferredSearchValue, history.recipeOptions, recipeOptionsById]);

  const visibleRecipeOptions = useMemo(() => {
    const normalized = deferredSearchValue.trim();
    const base = normalized
      ? searchedRecipeOptions ?? []
      : history.recipeOptions;

    return base.slice(0, 12);
  }, [deferredSearchValue, history.recipeOptions, searchedRecipeOptions]);

  function openDay(day: RecipeHistoryDayView) {
    if (day.events.length > 0) {
      setDayDialogDate(day.date);
      return;
    }

    if (history.selectedRecipe) {
      createEvent(history.selectedRecipe, day.date);
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

  function buildHistoryHref(month: string) {
    return history.selectedRecipe
      ? `/history?month=${encodeURIComponent(month)}&recipeId=${encodeURIComponent(history.selectedRecipe.recipeId)}${fromRecipe ? "&from=recipe" : ""}`
      : `/history?month=${encodeURIComponent(month)}`;
  }

  function buildRecipeHref(recipeId: string) {
    if (history.selectedRecipe?.recipeId !== recipeId) {
      return `/recipe/${encodeURIComponent(recipeId)}`;
    }

    return `/recipe/${encodeURIComponent(recipeId)}?reviewRecipeId=${encodeURIComponent(recipeId)}&historyMonth=${encodeURIComponent(history.month)}`;
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
        setSearchValue("");
        startNavigation(postCreateHistoryHref);
        router.replace(postCreateHistoryHref);
        router.refresh();

        if (date <= today && typeof result.data?.eventId === "string") {
          setDayDialogDate(null);
          setReviewTarget({
            eventId: result.data.eventId,
            recipeId: recipe.recipeId,
            recipeTitle: recipe.recipeTitle,
            date,
            dismissLabel: "Skip review",
          });
          return;
        }

        setReviewTarget(null);
        setDayDialogDate(date);
        return;
      }

      toast.error(result.message);
    });
  }

  return (
    <>
      <section className="rounded-[24px] border border-white/70 bg-white/90 p-2 shadow-soft sm:rounded-[32px] sm:p-6">
        {history.selectedRecipe ? (
          <div className="mb-4 rounded-[28px] border border-border/70 bg-secondary/20 p-4 sm:mb-6 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-[20px] bg-secondary/40 sm:h-20 sm:w-20">
                  {history.selectedRecipe.recipeImageUrl ? (
                    <Image
                      src={history.selectedRecipe.recipeImageUrl}
                      alt={history.selectedRecipe.recipeTitle}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Selected recipe
                  </p>
                  <h3 className="font-[family-name:var(--font-serif)] text-lg font-semibold sm:text-xl">
                    {history.selectedRecipe.recipeTitle}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Click a day on the calendar to add this recipe to meal history.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <AppTransitionLink
                    href={buildRecipeHref(history.selectedRecipe.recipeId)}
                  >
                    {fromRecipe ? "Back to recipe" : "View recipe"}
                  </AppTransitionLink>
                </Button>
                <Button asChild type="button" variant="ghost" size="sm">
                  <AppTransitionLink
                    href={`/history?month=${encodeURIComponent(history.month)}`}
                  >
                    Clear
                  </AppTransitionLink>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

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
                <AppTransitionLink
                  href={buildHistoryHref(history.previousMonth)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </AppTransitionLink>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 w-48 justify-center px-3 sm:hidden"
                size="sm"
              >
                <AppTransitionLink
                  href={buildHistoryHref(getTodayDayString().slice(0, 7))}
                >
                  Today
                </AppTransitionLink>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 w-11 justify-center px-3 sm:w-auto"
                size="sm"
              >
                <AppTransitionLink
                  href={buildHistoryHref(history.nextMonth)}
                >
                  <ChevronRight className="h-4 w-4" />
                </AppTransitionLink>
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
                : "Recipes recorded for this day."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {selectedDay?.events.map((event) => (
              <article
                key={event.eventId}
                className="border border-border/70 bg-secondary/15 p-3 sm:p-4 rounded-2xl"
              >
                <div className="flex gap-3 sm:gap-4">
                  <AppTransitionLink
                    href={buildRecipeHref(event.recipeId)}
                    prefetch
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
                  </AppTransitionLink>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                      <AppTransitionLink
                        href={buildRecipeHref(event.recipeId)}
                        prefetch
                        className="font-[family-name:var(--font-serif)] text-lg font-semibold sm:text-xl"
                      >
                        {event.recipeTitle}
                      </AppTransitionLink>
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
                            onClick={() =>
                              setReviewTarget({
                                eventId: event.eventId,
                                recipeId: event.recipeId,
                                recipeTitle: event.recipeTitle,
                                date: event.date,
                              })
                            }
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
              {history.selectedRecipe ? (
                <Button
                  type="button"
                  className="h-11 w-full sm:w-auto"
                  disabled={isPending}
                  onClick={() => {
                    if (history.selectedRecipe) {
                      createEvent(history.selectedRecipe, selectedDay.date);
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {selectedDay.isFuture
                    ? "Add planned recipe to this day"
                    : "Add this recipe to this day"}
                </Button>
              ) : (
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
              )}
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
              {isSearchLoading
                ? "Searching recipes..."
                : "No recipes matched that search."}
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
        dismissLabel={reviewTarget?.dismissLabel ?? "Cancel"}
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
