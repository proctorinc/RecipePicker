import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
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
      <div className="columns-2 gap-2 pb-24 sm:columns-2 md:columns-3 md:gap-5 lg:columns-4">
        {Array.from({ length: 10 }, (_unused, index) => (
          <Skeleton
            key={index}
            className={cn(
              "mb-2 break-inside-avoid border border-white/70 md:mb-5",
              index % 3 === 0
                ? "aspect-[4/6]"
                : index % 2 === 0
                  ? "aspect-[4/5]"
                  : "aspect-[4/4.75]",
            )}
          />
        ))}
      </div>
      <div className="fixed bottom-24 left-0 right-0 z-30 px-3 md:bottom-4 md:px-0">
        <div className="mx-auto max-w-md">
          <Skeleton className="h-14 rounded-full border border-white/80" />
        </div>
      </div>
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
