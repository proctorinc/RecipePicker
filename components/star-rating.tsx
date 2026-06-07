"use client";

import { cn } from "@/lib/utils";

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  className?: string;
  starClassName?: string;
  emptyStarClassName?: string;
  disabled?: boolean;
};

export function StarRating({
  value,
  onChange,
  className,
  starClassName,
  emptyStarClassName,
  disabled = false,
}: StarRatingProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: 5 }, (_, index) => {
        const starNumber = index + 1;
        const fillPercent = Math.max(0, Math.min(1, value - index)) * 100;

        return (
          <div key={starNumber} className="relative">
            <span className={cn("select-none text-2xl leading-none text-stone-300", emptyStarClassName ?? starClassName)}>★</span>
            <span
              className={cn("pointer-events-none absolute inset-y-0 left-0 overflow-hidden text-2xl leading-none text-amber-400", starClassName)}
              style={{ width: `${fillPercent}%` }}
            >
              ★
            </span>
            {onChange ? (
              <div className="absolute inset-0 flex">
                <button
                  type="button"
                  className="h-full w-1/2"
                  disabled={disabled}
                  onClick={() => onChange(index + 0.5)}
                  aria-label={`Rate ${index + 0.5} stars`}
                />
                <button
                  type="button"
                  className="h-full w-1/2"
                  disabled={disabled}
                  onClick={() => onChange(starNumber)}
                  aria-label={`Rate ${starNumber} stars`}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
