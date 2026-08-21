"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyPublicRecipeLink({ url }: { url: string }) {
  const [shared, setShared] = useState(false);

  const shareRecipeUrl = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
      }

      setShared(true);
      window.setTimeout(() => setShared(false), 2_000);
    } catch (error) {
      // Closing the native share sheet is not an error that needs UI feedback.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      throw error;
    }
  };

  return (
    <Button type="button" variant="outline" onClick={shareRecipeUrl}>
      {shared ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {shared ? "Shared" : "Share"}
    </Button>
  );
}
