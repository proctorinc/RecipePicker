"use client";

import Image from "next/image";
import { useState } from "react";
import { Star } from "lucide-react";

import { AppTransitionLink } from "@/components/app-transition-link";
import { Card } from "@/components/ui/card";
import { getFeedCardAspectClass } from "@/lib/feed-layout";
import type { FeedPinCard } from "@/types/view-models";

const FEED_IMAGE_SIZES =
  "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw";

export function PinCard({
  card,
  priority = false,
}: {
  card: FeedPinCard;
  priority?: boolean;
}) {
  const aspectClass = getFeedCardAspectClass(card.pinId);
  const [isFullImageLoaded, setIsFullImageLoaded] = useState(false);

  return (
    <AppTransitionLink
      href={card.destinationHref}
      prefetch
      className="block break-inside-avoid"
      pendingClassName="opacity-85"
    >
      <Card className="group overflow-hidden border-white/70 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(57,45,34,0.14)]">
        <div
          className={`relative overflow-hidden ${aspectClass}`}
          style={{
            backgroundColor: card.dominantColor ?? "rgba(214, 196, 176, 0.65)",
          }}
        >
          {card.imageUrl ? (
            <>
              {card.previewImageUrl ? (
                <Image
                  src={card.previewImageUrl}
                  alt=""
                  fill
                  aria-hidden="true"
                  sizes={FEED_IMAGE_SIZES}
                  className={`object-cover scale-[1.06] blur-2xl transition duration-300 ${isFullImageLoaded ? "opacity-0" : "opacity-100"}`}
                />
              ) : null}
              <Image
                src={card.imageUrl}
                alt={card.title}
                fill
                priority={priority}
                loading={priority ? undefined : "lazy"}
                sizes={FEED_IMAGE_SIZES}
                onLoad={() => setIsFullImageLoaded(true)}
                className={`object-cover transition duration-500 ${isFullImageLoaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-md scale-[1.03]"} group-hover:scale-[1.03]`}
              />
            </>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          {card.reviewCount > 0 ? (
            // <div className="absolute bottom-3 right-3 flex justify-end">
            //   <FeedCardStars value={card.averageRating ?? 0} />
            // </div>
            <div className="absolute top-3 right-3 justify-end gap-1 px-2 py-1 text-sm flex items-center rounded-full bg-primary/90 text-primary-foreground">
              {card.averageRating} <Star className="size-3" />
            </div>
          ) : null}
        </div>
      </Card>
    </AppTransitionLink>
  );
}

function FeedCardStars({ value }: { value: number }) {
  const normalizedValue = Math.max(0, Math.min(5, Math.round(value * 2) / 2));
  const visibleStarCount = Math.ceil(normalizedValue);

  return (
    <div className="flex items-center justify-end gap-1">
      {Array.from({ length: visibleStarCount }, (_, index) => {
        const fillPercent =
          Math.max(0, Math.min(1, normalizedValue - index)) * 100;

        return (
          <div key={index} className="relative h-[18px] w-[18px]">
            <span
              className="absolute inset-y-0 left-0 overflow-hidden text-lg leading-none text-white/70"
              style={{ width: `${fillPercent}%` }}
            >
              ★
            </span>
          </div>
        );
      })}
    </div>
  );
}
