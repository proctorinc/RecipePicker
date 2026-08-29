import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Icon } from "@/components/ui/icon";
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
  icon,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <section className="space-y-3">
      <h1 className="flex max-w-4xl items-center gap-3 font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">
        {icon ? <Icon icon={icon} size="lg" /> : null}
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
