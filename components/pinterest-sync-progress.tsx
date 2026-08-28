"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ActivityIndicator } from "@/components/activity-indicator";
import {
  formatPinterestSyncTimeRemaining,
  getPinterestSyncProgressDisplay,
  type PinterestSyncProgressRun,
} from "@/lib/pinterest-sync-progress";

type SyncProgressRun = PinterestSyncProgressRun & {
  syncRunId: string;
  completedAt: string | null;
  pinCount: number;
  message: string | null;
};

export function PinterestSyncProgress({ run }: { run: SyncProgressRun }) {
  const router = useRouter();
  const [currentRun, setCurrentRun] = useState(run);
  const hasRefreshed = useRef(false);

  useEffect(() => {
    setCurrentRun(run);
  }, [run]);

  useEffect(() => {
    if (currentRun.status !== "running") {
      if (!hasRefreshed.current) {
        hasRefreshed.current = true;
        router.refresh();
      }
      return;
    }

    let cancelled = false;
    const refreshProgress = async () => {
      try {
        const response = await fetch(`/api/pinterest/sync-status?syncRunId=${encodeURIComponent(currentRun.syncRunId)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json() as { run: SyncProgressRun };
        if (!cancelled) setCurrentRun(payload.run);
      } catch {
        // A transient status request must not interrupt the active sync display.
      }
    };

    const timer = window.setInterval(() => {
      void refreshProgress();
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentRun.status, currentRun.syncRunId, router]);

  if (currentRun.status !== "running") return null;
  const display = getPinterestSyncProgressDisplay(currentRun);

  return (
    <div className="rounded-[18px] border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ActivityIndicator label="Pinterest sync in progress" className="h-4 w-4" />
        <span>Pinterest sync in progress</span>
      </div>

      {display.state === "count_only" ? (
        <p className="mt-2 text-muted-foreground">{display.processedPinCount} pins processed</p>
      ) : null}

      {display.state === "normal" ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span>{display.processedPinCount} / {display.expectedPinCount} pins</span>
            <ProgressInfo />
          </div>
          <div
            aria-label={`${display.percentComplete}% complete`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={display.percentComplete}
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${display.percentComplete}%` }} />
          </div>
          <p className="text-muted-foreground">{display.percentComplete}% complete</p>
          {display.timeRemainingMs !== null ? <p className="text-muted-foreground">Time remaining: {formatPinterestSyncTimeRemaining(display.timeRemainingMs)}</p> : null}
        </div>
      ) : null}

      {display.state === "overtime" ? (
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          <ActivityIndicator label="Processing additional pins" className="h-4 w-4" />
          <span>{display.processedPinCount} pins processed · Processing additional pins</span>
        </div>
      ) : null}
    </div>
  );
}

function ProgressInfo() {
  return (
    <span className="group relative inline-flex">
      <button aria-label="About Pinterest sync progress" className="rounded-full text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline" type="button">
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" role="tooltip">
        Pin totals and time remaining are approximate and are based on the most recent successful sync of these boards.
      </span>
    </span>
  );
}
