"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

export function FeedSearch({
  value,
  onChange,
  isSearching = false,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  isSearching?: boolean;
}) {
  return (
    <div className="relative">
      <div className="relative">
        <Search className="z-50 pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search recipes, ingredients, and more"
          className="h-14 rounded-full border border-border/80 bg-background/80 pl-10 pr-12 text-base shadow-[0_12px_28px_rgba(73,49,31,0.18)] backdrop-blur-md transition-shadow focus-visible:shadow-[0_14px_32px_rgba(73,49,31,0.24)]"
          aria-busy={isSearching}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
