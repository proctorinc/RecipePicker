"use client";

import type { RecipeVersionView } from "@/types/view-models";
import { Badge } from "@/components/ui/badge";

export function RecipeVersionHistory({ versions }: { versions: RecipeVersionView[] }) {
  if (versions.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {versions.map((version) => <Badge key={version.versionNumber} variant="outline" className="border-0 bg-white/18 px-4 py-2 text-sm font-normal text-white backdrop-blur">v{version.versionNumber}{version.isPrimary ? " · current" : ""}</Badge>)}
    </div>
  );
}
