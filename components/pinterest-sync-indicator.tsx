"use client";

import { useEffect, useState } from "react";

import {
  getPinterestSyncProgressDisplay,
  type PinterestSyncProgressRun,
} from "@/lib/pinterest-sync-progress";

type SyncRun = PinterestSyncProgressRun & {
  syncRunId: string;
  completedAt: string | null;
  pinCount: number;
  message: string | null;
};

export function PinterestSyncIndicator({ initialRun }: { initialRun: SyncRun | null }) {
  const [run, setRun] = useState<SyncRun | null>(initialRun);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--pinterest-sync-indicator-height",
      run?.status === "running" ? "1.25rem" : "0px",
    );

    return () => {
      root.style.removeProperty("--pinterest-sync-indicator-height");
    };
  }, [run?.status]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/pinterest/sync-status", { cache: "no-store" });
        if (!cancelled) {
          setRun(response.ok ? (await response.json() as { run: SyncRun }).run : null);
        }
      } catch {
        // Keep the last known progress visible through a transient network error.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), run ? 3_000 : 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run?.syncRunId]);

  if (!run || run.status !== "running") return null;

  const display = getPinterestSyncProgressDisplay(run);
  const expectedPinCount = display.state === "normal" ? display.expectedPinCount : null;
  const percentComplete = display.state === "normal" ? display.percentComplete : 0;
  const timeRemaining = display.state === "normal" && display.timeRemainingMs !== null
    ? formatCompactTimeRemaining(display.timeRemainingMs)
    : null;
  const progressLabel = expectedPinCount === null
    ? `${display.processedPinCount} pins synced`
    : `${display.processedPinCount} / ${expectedPinCount} pins synced (${percentComplete}%)`;

  return (
    <>
      <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3rem)] z-40 h-5 bg-primary text-primary-foreground shadow-sm md:top-[4.75rem]">
        <button
          aria-describedby="pinterest-sync-tooltip"
          aria-label={`Pinterest is syncing: ${progressLabel}. Show details.`}
          aria-expanded={tooltipOpen}
          className="group relative flex h-full w-full items-center justify-center overflow-visible text-[10px] font-medium leading-none"
          onClick={() => setTooltipOpen((open) => !open)}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          type="button"
        >
          <span className="absolute inset-y-0 left-0 bg-primary-foreground/20 transition-[width] duration-300" style={{ width: `${percentComplete}%` }} />
          <span className="relative flex items-center gap-1 drop-shadow-sm">
            <span aria-hidden="true" className="flex h-3 w-3 items-center justify-center rounded-full bg-primary-foreground text-[9px] font-bold leading-none text-primary">P</span>
            <span>{expectedPinCount === null ? `${display.processedPinCount} pins` : `${percentComplete}% · ${display.processedPinCount}/${expectedPinCount}`}</span>
          </span>
          {timeRemaining ? <span className="absolute right-2 text-primary-foreground/60">{timeRemaining}</span> : null}
          <span
            className={`absolute top-full mt-1 w-max max-w-[calc(100vw-2rem)] rounded-md bg-foreground px-2.5 py-2 text-left text-xs font-normal leading-4 text-background shadow-lg transition-opacity ${tooltipOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            id="pinterest-sync-tooltip"
            role="tooltip"
          >
            Pinterest is syncing. {progressLabel}.{timeRemaining ? ` Estimated time remaining: ${timeRemaining}.` : ""}
          </span>
        </button>
      </div>
      <div aria-hidden="true" className="h-5" />
    </>
  );
}

function formatCompactTimeRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
