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
          className="h-14 rounded-full border-0 bg-background/65 pl-10 pr-12 text-base shadow-[0_18px_40px_rgba(73,49,31,0.14)] backdrop-blur-sm"
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
