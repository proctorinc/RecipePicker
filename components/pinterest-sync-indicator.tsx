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
  const progressLabel = expectedPinCount === null
    ? `${display.processedPinCount} pins synced`
    : `${display.processedPinCount} / ${expectedPinCount} pins synced (${percentComplete}%)`;

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-5 bg-[#e60023] text-white shadow-sm">
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
        <span className="absolute inset-y-0 left-0 bg-[#ad001a] transition-[width] duration-300" style={{ width: `${percentComplete}%` }} />
        <span className="relative flex items-center gap-1 drop-shadow-sm">
          <span aria-hidden="true" className="flex h-3 w-3 items-center justify-center rounded-full bg-white text-[9px] font-bold leading-none text-[#e60023]">P</span>
          <span>{expectedPinCount === null ? `${display.processedPinCount} pins` : `${percentComplete}% · ${display.processedPinCount}/${expectedPinCount}`}</span>
        </span>
        <span
          className={`absolute top-full mt-1 w-max max-w-[calc(100vw-2rem)] rounded-md bg-foreground px-2.5 py-2 text-left text-xs font-normal leading-4 text-background shadow-lg transition-opacity ${tooltipOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          id="pinterest-sync-tooltip"
          role="tooltip"
        >
          Pinterest is syncing. {progressLabel}.
        </span>
      </button>
    </div>
  );
}
