"use client";

import { cn } from "@/lib/utils";

type StarRatingProps = {
  value: number;
  className?: string;
  starClassName?: string;
  emptyStarClassName?: string;
};

export function StarRating({
  value,
  className,
  starClassName,
  emptyStarClassName,
}: StarRatingProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: 5 }, (_, index) => {
        const starNumber = index + 1;
        const fillPercent = Math.max(0, Math.min(1, value - index)) * 100;

        return (
          <div key={starNumber} className="relative" aria-hidden="true">
            <span className={cn("select-none text-2xl leading-none text-stone-300", emptyStarClassName ?? starClassName)}>★</span>
            <span
              className={cn("pointer-events-none absolute inset-y-0 left-0 overflow-hidden text-2xl leading-none text-amber-400", starClassName)}
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
