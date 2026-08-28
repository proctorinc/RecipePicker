"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

export function RecipeHeaderBackButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const match = pathname.match(/^\/recipe\/([^/]+)$/);

  if (!match) return null;

  const recipeId = match[1];
  const fromHistory = searchParams.get("reviewRecipeId") === recipeId;
  const historyMonth = searchParams.get("historyMonth");
  const fallbackHref = fromHistory
    ? `/history?recipeId=${encodeURIComponent(recipeId)}&from=recipe${historyMonth ? `&month=${encodeURIComponent(historyMonth)}` : ""}`
    : "/";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0"
      aria-label="Go back"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }

        router.push(fallbackHref);
      }}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}
