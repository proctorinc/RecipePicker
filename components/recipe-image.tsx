"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type RecipeImageProps = Omit<ImageProps, "src" | "alt" | "onLoad" | "onError"> & {
  src: string;
  alt: string;
  previewSrc?: string | null;
  className?: string;
  previewClassName?: string;
  onLoad?: ImageProps["onLoad"];
  onError?: ImageProps["onError"];
};

const MAX_RETRIES = 2;

export function RecipeImage({
  src,
  alt,
  previewSrc = null,
  className,
  previewClassName,
  onLoad,
  onError,
  ...props
}: RecipeImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsLoaded(false);
    setRetryAttempt(0);
    setHasFailed(false);

    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [src]);

  function retryImage(event: Parameters<NonNullable<ImageProps["onError"]>>[0]) {
    onError?.(event);

    if (retryAttempt >= MAX_RETRIES) {
      setHasFailed(true);
      return;
    }

    if (retryTimer.current) return;

    // Remounting the image triggers a new request without modifying a possibly
    // signed third-party source URL. The delay avoids immediately repeating a
    // transient upstream failure.
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setRetryAttempt((attempt) => attempt + 1);
    }, 500 * (retryAttempt + 1));
  }

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
        key={retryAttempt}
        src={src}
        alt={alt}
        onLoad={(event) => {
          setIsLoaded(true);
          onLoad?.(event);
        }}
        onError={retryImage}
        className={cn(
          "transition duration-500",
          isLoaded
            ? "opacity-100 blur-0 scale-100"
            : "opacity-0 blur-md scale-[1.03]",
          className,
        )}
      />
      {hasFailed && !previewSrc ? (
        <div
          role="img"
          aria-label={`Image unavailable for ${alt}`}
          className="absolute inset-0 bg-muted"
        />
      ) : null}
    </>
  );
}
