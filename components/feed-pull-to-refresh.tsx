"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Icon } from "@/components/ui/icon";

const REFRESH_THRESHOLD_PX = 72;
const MAX_PULL_DISTANCE_PX = 104;
const REFRESH_INDICATOR_OFFSET_PX = 56;

export function FeedPullToRefresh({
  disabled = false,
  onRefresh,
}: {
  disabled?: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    function resetPull() {
      touchStartYRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    }

    function handleTouchStart(event: TouchEvent) {
      if (disabled || isRefreshing || event.touches.length !== 1 || window.scrollY > 0) {
        return;
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    }

    function handleTouchMove(event: TouchEvent) {
      const touchStartY = touchStartYRef.current;
      const touch = event.touches[0];
      if (touchStartY === null || !touch) {
        return;
      }

      if (window.scrollY > 0) {
        resetPull();
        return;
      }

      const distance = touch.clientY - touchStartY;
      if (distance <= 0) {
        resetPull();
        return;
      }

      event.preventDefault();
      const nextDistance = Math.min(distance * 0.55, MAX_PULL_DISTANCE_PX);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    }

    function handleTouchEnd() {
      const shouldRefresh = pullDistanceRef.current >= REFRESH_THRESHOLD_PX;
      resetPull();

      if (!shouldRefresh || disabled || isRefreshing) {
        return;
      }

      setIsRefreshing(true);
      setPullDistance(REFRESH_INDICATOR_OFFSET_PX);
      void onRefresh()
        .catch((error: unknown) => {
          console.error("Unable to refresh feed.", error);
        })
        .finally(() => {
          setPullDistance(0);
          setIsRefreshing(false);
        });
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", resetPull, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, [disabled, isRefreshing, onRefresh]);

  const isVisible = pullDistance > 0 || isRefreshing;
  const progress = Math.min(pullDistance / REFRESH_THRESHOLD_PX, 1);

  return (
    <div
      aria-hidden={!isVisible}
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem+var(--pinterest-sync-indicator-height))] z-30 flex justify-center"
      style={{
        opacity: isVisible ? Math.max(progress, 0.2) : 0,
        transform: `translateY(${pullDistance - REFRESH_INDICATOR_OFFSET_PX}px)`,
      }}
    >
      <div
        role="status"
        aria-label={isRefreshing ? "Refreshing recipes" : "Pull down to refresh recipes"}
        className="flex size-10 items-center justify-center rounded-full border border-border/80 bg-background/90 text-primary shadow-md backdrop-blur transition-transform duration-200 motion-reduce:transition-none"
      >
        <Icon
          icon={RefreshCw}
          size="md"
          className={isRefreshing ? "animate-spin" : undefined}
          style={isRefreshing ? undefined : { transform: `rotate(${progress * 180}deg)` }}
        />
      </div>
    </div>
  );
}
