"use client";

import { Star } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { RecipeImage } from "@/components/recipe-image";
import { cn } from "@/lib/utils";

type RecipeImageCardProps = {
  title: string;
  imageUrl: string | null;
  previewImageUrl?: string | null;
  dominantColor?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  sizes: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  titleClassName?: string;
};

export function RecipeImageCard({
  title,
  imageUrl,
  previewImageUrl = null,
  dominantColor = null,
  averageRating = null,
  reviewCount = 0,
  sizes,
  priority = false,
  className,
  imageClassName,
  titleClassName,
}: RecipeImageCardProps) {
  const hasPerfectRating = averageRating === 5;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundColor: dominantColor ?? "rgba(214, 196, 176, 0.65)",
      }}
    >
      {imageUrl ? (
        <RecipeImage
          src={imageUrl}
          previewSrc={previewImageUrl}
          alt={title}
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes={sizes}
          previewClassName="object-cover"
          className={cn("object-cover", imageClassName)}
        />
      ) : null}
      <p
        className={cn(
          "absolute bottom-3 left-2 z-10 line-clamp-2 pr-2 font-serif text-sm font-bold text-primary-foreground/90",
          titleClassName,
        )}
      >
        {title}
      </p>
      <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/10 to-transparent" />
      {reviewCount > 0 && averageRating !== null ? (
        <div
          className={cn(
            "absolute right-0 top-3 flex items-center gap-1 py-1 pl-5 pr-3 text-sm [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,10px_50%)]",
            hasPerfectRating
              ? "border-y border-l border-amber-200/70 bg-[linear-gradient(135deg,#9c600c_0%,#f0c858_50%,#b77812_100%)] text-amber-950 shadow-[0_2px_6px_rgba(77,42,3,0.35)]"
              : "bg-primary/90 text-amber-100/90",
          )}
        >
          <span className="font-bold">{averageRating}</span>
          <Icon icon={Star} size="xs" className="fill-current" />
        </div>
      ) : null}
    </div>
  );
}
