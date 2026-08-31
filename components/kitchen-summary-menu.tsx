"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Soup, Star } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { HouseholdCookRatingView } from "@/types/view-models";

export function KitchenSummaryMenu({
  householdName,
  householdLogoUrl,
  cooks,
  size,
}: {
  householdName: string;
  householdLogoUrl: string | null;
  cooks: HouseholdCookRatingView[];
  size: "small" | "large";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSmall = size === "small";

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className={cn("relative", isSmall && "static")}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Show ${householdName} cooks and ratings`}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex items-center rounded-xl text-left font-[family-name:var(--font-serif)] transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isSmall ? "gap-1.5 px-1 py-1 text-base font-semibold" : "gap-3 p-1",
        )}
      >
        <KitchenLogo logoUrl={householdLogoUrl} size={size} />
        <span className={isSmall ? "max-w-44 truncate" : "text-lg font-semibold"}>
          {householdName}
        </span>
        <Icon
          icon={ChevronDown}
          size="xs"
          className={cn("text-muted-foreground transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {isOpen ? (
        <section
          role="dialog"
          aria-label={`${householdName} summary`}
          className={cn(
            "absolute z-50 overflow-hidden rounded-3xl border border-border bg-background shadow-soft",
            isSmall
              ? "left-1/2 top-[calc(100%+0.35rem)] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2"
              : "left-0 top-[calc(100%+0.5rem)] w-96",
          )}
        >
          <div className="flex items-center gap-4 border-b border-border/70 bg-muted/30 px-5 py-4">
            <KitchenLogo logoUrl={householdLogoUrl} size="feature" />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Your kitchen
              </p>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold">
                {householdName}
              </h2>
            </div>
          </div>
          <div className="p-3">
            <h3 className="px-2 pb-2 text-sm font-semibold">Cooks</h3>
            <ul className="space-y-1">
              {cooks.map((cook) => (
                <li key={cook.clerkUserId} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                  <CookAvatar name={cook.name} imageUrl={cook.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {cook.name}
                      {cook.isCurrentUser ? " (You)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cook.ratingCount} {cook.ratingCount === 1 ? "rating" : "ratings"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden />
                    {cook.averageRating ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function KitchenLogo({ logoUrl, size }: { logoUrl: string | null; size: "small" | "large" | "feature" }) {
  const dimensions = size === "small" ? "h-8 w-8" : size === "large" ? "h-11 w-11" : "h-16 w-16";
  const iconSize = size === "small" ? "sm" : size === "large" ? "md" : "xl";

  if (logoUrl) {
    return (
      // The uploaded image comes from the kitchen's trusted Blob URL.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={`${dimensions} shrink-0 rounded-full object-cover shadow-sm`} />
    );
  }

  return (
    <div className={`flex ${dimensions} shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm`}>
      <Icon icon={Soup} size={iconSize} />
    </div>
  );
}

function CookAvatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  if (imageUrl) {
    return (
      // Clerk profile images are displayed as the cook's avatar.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
