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
    <div className="sticky top-24 z-30">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search recipes, ingredients, and more"
          className="h-14 border-white/80 bg-background/90 pl-11 pr-12 text-base"
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
