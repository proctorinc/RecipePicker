"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

export function FeedSearch({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery);
  const deferredValue = useDeferredValue(value);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (deferredValue.trim()) {
        params.set("q", deferredValue.trim());
      } else {
        params.delete("q");
      }

      startTransition(() => {
        router.replace(
          params.toString() ? `${pathname}?${params.toString()}` : pathname,
          { scroll: false },
        );
      });
    }, 180);

    return () => clearTimeout(timeout);
  }, [deferredValue, pathname, router, searchParams]);

  return (
    <div className="sticky top-24 z-30">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search recipes, ingredients, and more"
          className="h-14 border-white/80 bg-background/90 pl-11 pr-12 text-base"
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
      {/*<p className="px-2 pt-3 text-xs text-muted-foreground">{isPending ? "Updating feed..." : "Search across recipes and extracted recipe content."}</p>*/}
    </div>
  );
}
