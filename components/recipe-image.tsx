"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type RecipeImageProps = Omit<ImageProps, "src" | "alt" | "onLoad"> & {
  src: string;
  alt: string;
  previewSrc?: string | null;
  className?: string;
  previewClassName?: string;
  onLoad?: ImageProps["onLoad"];
};

export function RecipeImage({
  src,
  alt,
  previewSrc = null,
  className,
  previewClassName,
  onLoad,
  ...props
}: RecipeImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  return (
    <>
      {previewSrc ? (
        <Image
          {...props}
          src={previewSrc}
          alt=""
          aria-hidden="true"
          className={cn(
            className,
            "scale-[1.06] blur-2xl transition duration-300",
            isLoaded ? "opacity-0" : "opacity-100",
            previewClassName,
          )}
        />
      ) : null}
      <Image
        {...props}
        src={src}
        alt={alt}
        onLoad={(event) => {
          setIsLoaded(true);
          onLoad?.(event);
        }}
        className={cn(
          "transition duration-500",
          isLoaded
            ? "opacity-100 blur-0 scale-100"
            : "opacity-0 blur-md scale-[1.03]",
          className,
        )}
      />
    </>
  );
}
