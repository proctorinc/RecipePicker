"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAppRouteTransition } from "@/components/app-route-transition";
import { cn } from "@/lib/utils";

type AppTransitionLinkProps = ComponentProps<typeof Link> & {
  pendingClassName?: string;
  disableWhilePending?: boolean;
};

export function AppTransitionLink({
  href,
  className,
  onClick,
  onMouseEnter,
  onTouchStart,
  prefetch = true,
  pendingClassName,
  disableWhilePending = true,
  ...props
}: AppTransitionLinkProps) {
  const router = useRouter();
  const { pendingHref, startNavigation } = useAppRouteTransition();
  const hrefString = typeof href === "string" ? href : href.toString();
  const isPending = pendingHref === hrefString;

  function prefetchRoute() {
    if (prefetch && hrefString.startsWith("/")) {
      router.prefetch(hrefString);
    }
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetch}
      aria-disabled={disableWhilePending && isPending ? true : undefined}
      className={cn(
        className,
        isPending && disableWhilePending && "pointer-events-none",
        isPending && pendingClassName,
      )}
      onClick={(event) => {
        onClick?.(event);

        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        startNavigation(hrefString);
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        prefetchRoute();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        prefetchRoute();
      }}
    />
  );
}
