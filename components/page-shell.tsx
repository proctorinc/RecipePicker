import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("mx-auto flex w-full max-w-4xl flex-col gap-8", className)}
    >
      {children}
    </section>
  );
}

export function PageIntro({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="space-y-3">
      <h1 className="max-w-4xl font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
    </section>
  );
}
