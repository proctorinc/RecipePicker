"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type AppRouteTransitionContextValue = {
  isNavigating: boolean;
  pendingHref: string | null;
  shouldShowIndicator: boolean;
  startNavigation: (href: string) => void;
  clearNavigation: () => void;
};

const AppRouteTransitionContext =
  createContext<AppRouteTransitionContextValue | null>(null);

const INDICATOR_DELAY_MS = 120;
const FALLBACK_CONTEXT: AppRouteTransitionContextValue = {
  isNavigating: false,
  pendingHref: null,
  shouldShowIndicator: false,
  startNavigation() {},
  clearNavigation() {},
};

export function AppRouteTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [shouldShowIndicator, setShouldShowIndicator] = useState(false);
  const timerRef = useRef<number | null>(null);
  const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    if (!pendingHref) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    setPendingHref(null);
    setShouldShowIndicator(false);
  }, [currentUrl, pendingHref]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const value = useMemo<AppRouteTransitionContextValue>(
    () => ({
      isNavigating: pendingHref !== null,
      pendingHref,
      shouldShowIndicator,
      startNavigation(href: string) {
        if (href === currentUrl || href === pendingHref) {
          return;
        }

        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }

        setPendingHref(href);
        setShouldShowIndicator(false);
        timerRef.current = window.setTimeout(() => {
          setShouldShowIndicator(true);
        }, INDICATOR_DELAY_MS);
      },
      clearNavigation() {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }

        setPendingHref(null);
        setShouldShowIndicator(false);
      },
    }),
    [currentUrl, pendingHref, shouldShowIndicator],
  );

  return (
    <AppRouteTransitionContext.Provider value={value}>
      {children}
    </AppRouteTransitionContext.Provider>
  );
}

export function useAppRouteTransition() {
  const context = useContext(AppRouteTransitionContext);
  return context ?? FALLBACK_CONTEXT;
}

export function AppShellProgress() {
  const { isNavigating, shouldShowIndicator } = useAppRouteTransition();

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden opacity-0 transition-opacity duration-150",
          shouldShowIndicator && "opacity-100",
        )}
      >
        <div
          className={cn(
            "h-full w-1/3 rounded-full bg-primary/85 shadow-[0_0_18px_rgba(73,49,31,0.28)]",
            isNavigating && "animate-[route-progress_1.1s_ease-in-out_infinite]",
          )}
        />
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-[4.5rem] z-30 h-3 bg-gradient-to-b from-primary/8 to-transparent opacity-0 transition-opacity duration-200",
          shouldShowIndicator && "opacity-100",
        )}
      />
    </>
  );
}
