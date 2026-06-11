"use client";

import { useEffect } from "react";

export function FeedSyncTrigger() {
  useEffect(() => {
    void fetch("/api/pinterest/sync-if-needed", {
      method: "POST",
      cache: "no-store",
    }).catch(() => {
      // The feed should stay usable even if background sync cannot start.
    });
  }, []);

  return null;
}
