"use client";

import type { RecipeVersionView } from "@/types/view-models";
import { Badge } from "@/components/ui/badge";

export function RecipeVersionHistory({ versions }: { versions: RecipeVersionView[] }) {
  if (versions.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {versions.map((version) => <Badge key={version.versionNumber} variant="outline" className="border border-white/40 bg-secondary/85 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground backdrop-blur">v{version.versionNumber}{version.isPrimary ? " · current" : ""}</Badge>)}
    </div>
  );
}
