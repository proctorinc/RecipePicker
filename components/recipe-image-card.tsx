"use client";

import { Star } from "lucide-react";

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
        <div className="absolute right-3 top-3 flex items-center justify-end gap-1 rounded-full bg-primary/90 px-2 py-1 text-sm text-primary-foreground">
          {averageRating} <Star className="size-3" />
        </div>
      ) : null}
    </div>
  );
}
