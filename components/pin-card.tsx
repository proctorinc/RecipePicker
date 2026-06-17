"use client";

import { AppTransitionLink } from "@/components/app-transition-link";
import { RecipeImageCard } from "@/components/recipe-image-card";
import { Card } from "@/components/ui/card";
import { getFeedCardAspectClass } from "@/lib/feed-layout";
import type { FeedPinCard } from "@/types/view-models";

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
      </Card>
    </AppTransitionLink>
  );
}
