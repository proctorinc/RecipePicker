"use client";

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

  return (
    <AppTransitionLink
      href={card.destinationHref}
      prefetch
      className="block break-inside-avoid"
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
        {card.searchMatches.length > 0 ? (
          <p className="truncate px-3 py-2 text-[11px] font-medium text-muted-foreground">
            <span className="mr-1 text-foreground/65">Matches</span>
            {card.searchMatches.slice(0, 2).map(formatSearchMatch).join(" · ")}
          </p>
        ) : null}
      </Card>
    </AppTransitionLink>
  );
}

function formatSearchMatch(match: FeedSearchMatch) {
  switch (match.field) {
    case "title":
      return "Title: exact";
    case "ingredient":
      return `Ingredient: ${match.matchedText ?? "exact"}`;
    case "alias":
      return `Alias: ${match.matchedText} → ${match.relatedText}`;
    case "family":
      return `Family: ${match.matchedText} → ${match.relatedText}`;
    case "description":
      return "Description";
    case "site":
      return "Site";
    case "website":
      return "Website";
  }
}
