"use client";

import { useState } from "react";

import { AppTransitionLink } from "@/components/app-transition-link";
import { RecipeImageCard } from "@/components/recipe-image-card";
import { Card } from "@/components/ui/card";
import { getFeedCardAspectClass } from "@/lib/feed-layout";
import type { FeedPinCard, FeedSearchMatch } from "@/types/view-models";

export const FEED_IMAGE_SIZES =
  "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw";

export function PinCard({
  card,
  priority = false,
}: {
  card: FeedPinCard;
  priority?: boolean;
}) {
  const aspectClass = getFeedCardAspectClass(card.pinId);
  const [isMatchDetailsOpen, setIsMatchDetailsOpen] = useState(false);

  return (
    <div
      className="relative break-inside-avoid"
    >
      <AppTransitionLink
        href={card.destinationHref}
        prefetch
        className="block"
        pendingClassName="opacity-85"
      >
        <Card className="group overflow-hidden border-white/70 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(57,45,34,0.14)]">
          <RecipeImageCard
            title={card.title}
            imageUrl={card.imageUrl}
            previewImageUrl={card.previewImageUrl}
            dominantColor={card.dominantColor}
            averageRating={card.averageRating}
            reviewCount={card.reviewCount}
            priority={priority}
            sizes={FEED_IMAGE_SIZES}
            className={aspectClass}
            imageClassName="group-hover:scale-[1.03]"
          />
        </Card>
      </AppTransitionLink>

      {card.searchMatches.length > 0 ? (
        <div
          className="relative px-2 pt-1.5"
          onMouseEnter={() => setIsMatchDetailsOpen(true)}
          onMouseLeave={() => setIsMatchDetailsOpen(false)}
          onFocus={() => setIsMatchDetailsOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsMatchDetailsOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="text-left text-[11px] font-medium text-muted-foreground underline decoration-muted-foreground/35 underline-offset-2 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-expanded={isMatchDetailsOpen}
            aria-controls={`search-match-details-${card.recipeId}`}
            aria-describedby={
              isMatchDetailsOpen ? `search-match-details-${card.recipeId}` : undefined
            }
            onClick={() => setIsMatchDetailsOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsMatchDetailsOpen(false);
                event.currentTarget.blur();
              }
            }}
          >
            Matched on {formatMatchFields(card.searchMatches)}
          </button>
          {isMatchDetailsOpen ? (
            <div
              id={`search-match-details-${card.recipeId}`}
              role="tooltip"
              className="absolute left-2 right-2 z-20 mt-1 rounded-xl border border-border/80 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
            >
              <p className="font-medium">Search match details</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {card.searchMatches.map((match, index) => (
                  <li key={`${match.field}-${match.matchedText}-${match.relatedText}-${index}`}>
                    {formatSearchMatchDetail(match)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatMatchFields(matches: FeedSearchMatch[]) {
  const fields = [...new Set(matches.map((match) => formatMatchField(match.field)))];

  if (fields.length === 1) {
    return fields[0];
  }

  if (fields.length === 2) {
    return `${fields[0]} and ${fields[1]}`;
  }

  return `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;
}

function formatMatchField(matchField: FeedSearchMatch["field"]) {
  switch (matchField) {
    case "title":
      return "title";
    case "ingredient":
      return "ingredient";
    case "alias":
      return "ingredient alias";
    case "family":
      return "ingredient family";
    case "description":
      return "description";
    case "site":
      return "site";
    case "website":
      return "website";
  }
}

function formatSearchMatchDetail(match: FeedSearchMatch) {
  switch (match.field) {
    case "title":
      return "The recipe title matched your search.";
    case "ingredient":
      return `Ingredient matched: ${match.matchedText ?? "exact ingredient match"}.`;
    case "alias":
      return `Ingredient alias matched: ${match.matchedText ?? "your search"} → ${match.relatedText ?? "ingredient"}.`;
    case "family":
      return `Ingredient family matched: ${match.matchedText ?? "your search"} → ${match.relatedText ?? "ingredient"}.`;
    case "description":
      return "The recipe description matched your search.";
    case "site":
      return "The recipe site matched your search.";
    case "website":
      return "The recipe website matched your search.";
  }
}
