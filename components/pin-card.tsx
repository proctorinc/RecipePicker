import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import type { FeedPinCard } from "@/types/view-models";

export function PinCard({ card }: { card: FeedPinCard }) {
  const aspectClass = getAspectClass(card.pinId);

  return (
    <Link
      href={card.destinationHref}
      className="mb-2 md:mb-5 block break-inside-avoid"
    >
      <Card className="group overflow-hidden border-white/70 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(57,45,34,0.14)]">
        <div
          className={`relative overflow-hidden ${aspectClass}`}
          style={{
            backgroundColor: card.dominantColor ?? "rgba(214, 196, 176, 0.65)",
          }}
        >
          {card.imageUrl ? (
            <Image
              src={card.imageUrl}
              alt={card.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
              className="object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          {card.reviewCount > 0 ? (
            <div className="absolute bottom-3 right-3 flex justify-end">
              <FeedCardStars value={card.averageRating ?? 0} />
            </div>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function getAspectClass(pinId: string) {
  const value = pinId.charCodeAt(pinId.length - 1) % 3;
  if (value === 0) {
    return "aspect-[4/5]";
  }
  if (value === 1) {
    return "aspect-[4/6]";
  }
  return "aspect-[4/4.75]";
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
