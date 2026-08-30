"use client";

import { Filter } from "lucide-react";
import { useEffect, useState } from "react";

import {
  defaultFeedFilters,
  getFeedFilterSummary,
  type FeedFilters,
} from "@/lib/feed-filters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";

const ratingOptions = Array.from({ length: 11 }, (_, index) => index / 2);

export function FeedFilters({
  filters,
  onApply,
}: {
  filters: FeedFilters;
  onApply: (filters: FeedFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const summary = getFeedFilterSummary(filters);

  useEffect(() => {
    if (!open) setDraft(filters);
  }, [filters, open]);

  return (
    <>
      <button
        type="button"
        className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Open feed filters"
        onClick={() => setOpen(true)}
      >
        <Icon icon={Filter} size="sm" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:w-[min(92vw,32rem)]">
          <DialogHeader>
            <DialogTitle>Filter recipes</DialogTitle>
            <DialogDescription>Choose which recipes appear in your feed.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Ratings</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "rated", "unrated"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={draft.rating === value ? "secondary" : "outline"}
                    onClick={() => setDraft((current) => ({
                      ...current,
                      rating: value,
                      minRating: value === "unrated" ? null : current.minRating,
                      maxRating: value === "unrated" ? null : current.maxRating,
                    }))}
                  >
                    {value === "all" ? "Any" : value === "rated" ? "Rated" : "Unrated"}
                  </Button>
                ))}
              </div>
              {draft.rating !== "unrated" ? (
                <div className="grid grid-cols-2 gap-3">
                  <RatingSelect
                    label="Minimum rating"
                    value={draft.minRating}
                    onChange={(minRating) => setDraft((current) => ({
                      ...current,
                      rating: minRating === null ? current.rating : "rated",
                      minRating,
                    }))}
                  />
                  <RatingSelect
                    label="Maximum rating"
                    value={draft.maxRating}
                    onChange={(maxRating) => setDraft((current) => ({
                      ...current,
                      rating: maxRating === null ? current.rating : "rated",
                      maxRating,
                    }))}
                  />
                </div>
              ) : null}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Calendar</legend>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "eaten", "not_eaten"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={draft.calendar === value ? "secondary" : "outline"}
                    onClick={() => setDraft((current) => ({ ...current, calendar: value }))}
                  >
                    {value === "all" ? "Any" : value === "eaten" ? "Eaten" : "Not eaten"}
                  </Button>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 p-4">
              <div>
                <p className="text-sm font-medium">Ready to cook</p>
                <p className="text-sm text-muted-foreground">Only show recipes with ready instructions.</p>
              </div>
              <Switch
                checked={draft.readyOnly}
                onCheckedChange={(readyOnly) => setDraft((current) => ({ ...current, readyOnly }))}
                aria-label="Only show ready to cook recipes"
              />
            </div>
          </div>

          <div className="flex justify-between gap-3 pt-6">
            <Button type="button" variant="ghost" onClick={() => setDraft(defaultFeedFilters)}>
              Reset
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (draft.minRating !== null && draft.maxRating !== null && draft.minRating > draft.maxRating) {
                  return;
                }
                onApply(draft);
                setOpen(false);
              }}
              disabled={draft.minRating !== null && draft.maxRating !== null && draft.minRating > draft.maxRating}
            >
              Show recipes
            </Button>
          </div>
          {draft.minRating !== null && draft.maxRating !== null && draft.minRating > draft.maxRating ? (
            <p className="text-sm text-destructive">Minimum rating cannot exceed the maximum.</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RatingSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Any</option>
        {ratingOptions.map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
      </select>
    </label>
  );
}
