"use client";

import { Filter } from "lucide-react";
import { useEffect, useId, useState } from "react";

import {
  defaultFeedFilters,
  type FeedFilters,
} from "@/lib/feed-filters";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";

const ratingOptions = Array.from({ length: 11 }, (_, index) => index / 2);

export function FeedFilters({
  filters,
  onApply,
  open,
  onOpenChange,
}: {
  filters: FeedFilters;
  onApply: (filters: FeedFilters) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const filterPanelId = useId();

  useEffect(() => {
    if (!open) setDraft(filters);
  }, [filters, open]);

  return (
    <div className="contents">
      <button
        type="button"
        className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={open ? "Close feed filters" : "Open feed filters"}
        aria-controls={filterPanelId}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Icon icon={Filter} size="sm" />
      </button>
      <div
        id={filterPanelId}
        aria-hidden={!open}
        inert={!open}
        className={`col-span-2 grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-5 border-t border-border/70 px-1 pb-1 pt-5">
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

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/40 p-4">
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

          <div className="flex justify-between gap-3 pt-1">
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
                onOpenChange(false);
              }}
              disabled={draft.minRating !== null && draft.maxRating !== null && draft.minRating > draft.maxRating}
            >
              Show recipes
            </Button>
          </div>
          {draft.minRating !== null && draft.maxRating !== null && draft.minRating > draft.maxRating ? (
            <p className="text-sm text-destructive">Minimum rating cannot exceed the maximum.</p>
          ) : null}
        </div>
      </div>
    </div>
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
