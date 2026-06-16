"use client";

import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAppRouteTransition } from "@/components/app-route-transition";
import { Input } from "@/components/ui/input";

export function FeedSearch({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery);
  const deferredValue = useDeferredValue(value);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { startNavigation } = useAppRouteTransition();
  const latestUrlQueryRef = useRef(initialQuery.trim());

  useEffect(() => {
    const nextQuery = initialQuery.trim();
    latestUrlQueryRef.current = nextQuery;
    setValue((current) => (current === nextQuery ? current : nextQuery));
  }, [initialQuery]);

  useEffect(() => {
    const nextQuery = deferredValue.trim();

    if (nextQuery === latestUrlQueryRef.current) {
      return;
    }

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQuery) {
        params.set("q", nextQuery);
      } else {
        params.delete("q");
      }

      const nextHref = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      const currentHref = searchParams.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;

      if (nextHref === currentHref) {
        latestUrlQueryRef.current = nextQuery;
        return;
      }

      startTransition(() => {
        latestUrlQueryRef.current = nextQuery;
        startNavigation(nextHref);
        router.replace(nextHref, { scroll: false });
      });
    }, 180);

    return () => clearTimeout(timeout);
  }, [deferredValue, pathname, router, searchParams, startNavigation]);

  return (
    <div className="sticky top-24 z-30">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search recipes, ingredients, and more"
          className="h-14 border-white/80 bg-background/90 pl-11 pr-12 text-base"
          aria-busy={isPending}
        />
        {value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
