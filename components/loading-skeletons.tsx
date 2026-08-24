import { Soup } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import {
  getFeedCardAspectClassFromVariant,
  type FeedCardAspectVariant,
} from "@/lib/feed-layout";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "animate-pulse rounded-[24px] bg-gradient-to-r from-white/80 via-white to-white/80",
        className,
      )}
    />
  );
}

export function FeedPageSkeleton() {
  return (
    <div className="space-y-6">
      <FeedCardsSkeleton />
      <div className="fixed bottom-24 left-0 right-0 z-30 px-3 md:bottom-4 md:px-0">
        <div className="mx-auto max-w-md">
          <Skeleton className="h-14 rounded-full border border-white/80" />
        </div>
      </div>
    </div>
  );
}

export function FeedCardsSkeleton() {
  return (
    <>
      <div className="md:hidden">{renderFeedSkeletonColumns(2)}</div>
      <div className="hidden md:block lg:hidden">
        {renderFeedSkeletonColumns(3)}
      </div>
      <div className="hidden lg:block">{renderFeedSkeletonColumns(4)}</div>
    </>
  );
}

export function AppLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-grain px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_18px_40px_rgba(73,49,31,0.18)]">
          <Soup className="h-7 w-7" />
        </div>
        <div>
          <p className="font-[family-name:var(--font-serif)] text-xl font-semibold">
            Recipe Picker
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Loading your recipes…</p>
        </div>
      </div>
    </main>
  );
}

export function FeedCardSkeleton({
  aspectVariant,
  animationDelayMs = 0,
}: {
  aspectVariant: FeedCardAspectVariant;
  animationDelayMs?: number;
}) {
  return (
    <Skeleton
      style={{ animationDelay: `${animationDelayMs}ms` }}
      className={cn(
        "w-full rounded-[28px] border border-primary/25 from-primary/80 via-primary/60 to-primary/80 shadow-[0_12px_28px_rgba(73,49,31,0.12)]",
        getFeedCardAspectClassFromVariant(aspectVariant),
      )}
    />
  );
}

function renderFeedSkeletonColumns(columnCount: number) {
  return (
    <div
      className={cn(
        "grid items-start gap-2 pb-24 md:gap-5",
        columnCount === 2
          ? "grid-cols-2"
          : columnCount === 3
            ? "grid-cols-3"
            : "grid-cols-4",
      )}
    >
      {Array.from({ length: columnCount }, (_unused, columnIndex) => (
        <FeedSkeletonColumn
          key={columnIndex}
          columnIndex={columnIndex}
          columnCount={columnCount}
        />
      ))}
    </div>
  );
}

function FeedSkeletonColumn({
  columnIndex,
  columnCount,
}: {
  columnIndex: number;
  columnCount: number;
}) {
  const cards: FeedCardAspectVariant[] = [
    columnIndex % 3 === 0 ? "taller" : "tall",
    columnIndex % 2 === 0 ? "square" : "taller",
  ];

  if (columnIndex < Math.max(1, columnCount - 2)) {
    cards.push("tall");
  }

  return (
    <div className="flex flex-col gap-2 md:gap-5">
      {cards.map((aspectVariant, rowIndex) => (
        <FeedCardSkeleton
          key={`${aspectVariant}-${rowIndex}`}
          aspectVariant={aspectVariant}
          animationDelayMs={(rowIndex * columnCount + columnIndex) * 120}
        />
      ))}
    </div>
  );
}

export function HistoryPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-soft sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_unused, index) => (
            <Skeleton key={index} className="aspect-square rounded-[20px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RecipePageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-11 w-36 rounded-full" />
      <Skeleton className="aspect-[16/10] w-full rounded-[36px] sm:aspect-[16/8]" />
      <div className="space-y-3 px-4">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-44 rounded-full" />
        <Skeleton className="h-11 w-40 rounded-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-[32px]" />
    </div>
  );
}

export function PickerPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-12 w-64" />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Skeleton className="min-h-[28rem] rounded-[32px]" />
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-[28px]" />
          <Skeleton className="h-64 rounded-[28px]" />
        </div>
      </div>
    </div>
  );
}

export function SettingsNavSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 5 }, (_unused, index) => (
        <Skeleton key={index} className="h-10 w-28 rounded-full" />
      ))}
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="space-y-8">
      <SettingsNavSkeleton />
      <div className="space-y-6">
        <Skeleton className="h-52 rounded-[32px]" />
        <Skeleton className="h-72 rounded-[32px]" />
      </div>
    </div>
  );
}
